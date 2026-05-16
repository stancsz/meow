import * as blessed from 'blessed';
import * as path from 'path';
import * as fs from 'fs';
import { Agent } from '../agent/agent';
import { Liaison } from '../liaison/Liaison';
import { Orchestrator, StatusUpdate } from '../orchestrator/Orchestrator';
import { ExecutionMode } from '../orchestrator/ExecutionMode';
import { tuiEvents, TUIMessage } from './tui-events';

// ─── ANSI style helpers ──────────────────────────────────────────────────────

const S = {
  bold:     '{bold}',
  dim:      '{dim}',
  white:    '{white-fg}',
  cyan:     '{cyan-fg}',
  yellow:   '{yellow-fg}',
  green:    '{green-fg}',
  red:      '{red-fg}',
  blue:     '{blue-fg}',
  bg_blue:  '{blue-bg}',
  reset:    '{/}',
} as const;

function stylize(open: string, text: string): string {
  return text ? `${open}${text}{/}` : text;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/\{/g, '\\{');
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  return h > 0 ? `${h}h${m}m${String(s).padStart(2, '0')}s`
       : `${m}m${String(s).padStart(2, '0')}s`;
}

// ─── Phase indicator helpers ───────────────────────────────────────────────────

function phaseTag(label: string, fg: string): string {
  return stylize(`{${fg}-fg}{bold}`, `[${label}]`) + ' ';
}

const PHASE = {
  ready:    () => phaseTag('READY',    'green'),
  parsing:  () => phaseTag('L1',       'cyan')   + 'parsing…',
  orch:     () => phaseTag('L2',       'cyan')   + 'orchestrating…',
  success:  () => phaseTag('DONE',     'green'),
  error:    () => phaseTag('ERROR',    'red'),
  aborted:  () => phaseTag('ABORTED',  'yellow'),
} as const;

type PhaseKey = keyof typeof PHASE;

// ─── Status line builder ───────────────────────────────────────────────────────
// Shows: [MODE] tokens:XXX elapsed:HH:MM:SS  (right-aligned)
// Compact — lives on line 2 of the output pane

function statusLine(mode: string, tokens: number, startMs: number): string {
  const elapsed = fmtElapsed(Date.now() - startMs);
  const left  = stylize(S.dim, `[${mode}]`);
  const right = stylize(S.dim, `tokens:${tokens.toLocaleString()}  elapsed:${elapsed}`);
  return `${left}${' '.repeat(60 - left.length - strip(right).length)}${right}`;
}

function strip(s: string): string {
  return s.replace(/\{[^}]*\}/g, '');
}

// ─── Slash commands ───────────────────────────────────────────────────────────

interface Cmd {
  name: string;
  desc: string;
  fn: (ctx: CmdCtx, args?: string) => Promise<void>;
}

interface CmdCtx {
  log: (msg: string) => void;
  setPhase: (k: PhaseKey) => void;
  abort: () => void;
}

const CMDS: Cmd[] = [
  {
    name: 'help',
    desc: 'show this list',
    async fn({ log }) {
      log(stylize(S.dim, 'Commands:'));
      for (const c of CMDS) log(`  /${c.name}  ${stylize(S.dim, c.desc)}`);
    },
  },
  {
    name: 'clear',
    desc: 'clear output',
    async fn() { /* handled below */ },
  },
  {
    name: 'abort',
    desc: 'abort current task',
    async fn({ log, abort }) {
      abort();
      log(stylize(S.yellow, '^C aborted.'));
    },
  },
  {
    name: 'mode',
    desc: 'set mode: ship | seq | par | audit',
    async fn({ log }, args?: string) {
      const m = (args ?? '').trim().toLowerCase();
      const map: Record<string, ExecutionMode> = {
        ship: ExecutionMode.SHIP,
        seq:  ExecutionMode.SEQUENTIAL,
        par:  ExecutionMode.PARALLEL,
        audit: ExecutionMode.AUDIT_ONLY,
      };
      if (!map[m]) {
        log(stylize(S.red, `unknown mode: ${m}. try ship | seq | par | audit`));
        return;
      }
      _executionMode = map[m];
      log(stylize(S.green, `mode → ${m.toUpperCase()}`));
      tuiEvents.emitModeChange(m);
    },
  },
  {
    name: 'trace',
    desc: 'toggle trace',
    async fn({ log }) {
      _traceMode = !_traceMode;
      log(stylize(S.yellow, `trace ${_traceMode ? 'ON' : 'OFF'}`));
    },
  },
  {
    name: 'tasks',
    desc: 'show task tree',
    async fn({ log }) {
      log(renderTaskSummary());
    },
  },
  {
    name: 'exit',
    desc: 'exit meow',
    async fn() { process.exit(0); },
  },
];

// Module-level toggles shared with command handlers
let _executionMode = ExecutionMode.SHIP;
let _traceMode = false;

function setExecutionMode(m: ExecutionMode) { _executionMode = m; }
function toggleTrace()                      { _traceMode = !_traceMode; }
function isTracing()                        { return _traceMode; }

// ─── Task tree summary (for /tasks) ───────────────────────────────────────────

let _taskRoot = { label: '(root)', children: [] as any[], done: 0, fail: 0, total: 0 };

function renderTaskSummary(): string {
  const lines: string[] = [];
  function walk(nodes: any[], depth = 0) {
    for (const n of nodes) {
      const icon = n.status === 'done'   ? stylize(S.green, '✓')
                 : n.status === 'failed' ? stylize(S.red,   '✗')
                                         : stylize(S.cyan,  '▸');
      lines.push(`${'  '.repeat(depth)}${icon} ${esc(n.label ?? n.id)}`);
      if (n.children?.length) walk(n.children, depth + 1);
    }
  }
  walk(_taskRoot.children);
  return lines.length ? lines.join('\n') : stylize(S.dim, '(no tasks)');
}

// ─── Main TUI ─────────────────────────────────────────────────────────────────

export class MeowTUI {
  private screen!:   blessed.Widgets.Screen;
  private logPane!:  blessed.Widgets.Log;
  private statusBar!: blessed.Widgets.BoxElement;

  private agent!:       Agent;
  private liaison!:     Liaison;
  private orchestrator!: Orchestrator;

  private history:     string[]  = [];
  private historyIdx   = -1;
  private historyPath: string;

  private phase:      PhaseKey  = 'ready';
  private startMs:    number    = Date.now();
  private tokens:     number    = 0;
  private running:    boolean   = false;
  private abortCtrl?: AbortController;

  // ── constructor ─────────────────────────────────────────────────────────────

  constructor(agent: Agent, screen?: blessed.Widgets.Screen) {
    this.agent = agent;
    this.historyPath = path.join(process.env.HOME ?? '/tmp', '.meow', 'history.txt');
    this.screen = screen ?? blessed.screen({
      smartCSR:  true,
      title:     'MEOW',
      fullUnicode: true,
    });
    this.build();
    this.wire();
    this.keyboard();
  }

  // ── layout (2 rows: log + status, input is the status bar content) ──────────

  private build() {
    // Full-screen scrolling log pane
    this.logPane = blessed.log({
      parent:    this.screen,
      top:       0,
      left:      0,
      width:     '100%',
      height:   '100%-1',
      tags:      true,
      scrollable: true,
      alwaysScroll: true,
      style: { fg: 'white', bg: 'black' },
    });

    // Status bar — also acts as the input area (border below it)
    this.statusBar = blessed.box({
      parent:   this.screen,
      bottom:   0,
      left:     0,
      width:    '100%',
      height:   1,
      tags:     true,
      style:    { fg: 'white', bg: 'black' },
      content:  this.phaseContent(),
    });
  }

  private phaseContent(): string {
    const phaseStr = PHASE[this.phase]();
    const elapsed  = stylize(S.dim, fmtElapsed(Date.now() - this.startMs));
    const mode    = stylize(S.dim, String(_executionMode));
    const left    = `${phaseStr}${mode}`;
    const right   = `tokens:${stylize(S.blue, this.tokens.toLocaleString())}  elapsed:${elapsed}`;
    const pad     = Math.max(1, 80 - strip(left).length - strip(right).length);
    return `${left}${' '.repeat(pad)}${right}`;
  }

  // ── event wiring ────────────────────────────────────────────────────────────

  private wire() {
    this.liaison     = new Liaison(this.agent);
    this.orchestrator = new Orchestrator(this.agent);

    tuiEvents.on('message', (msg: TUIMessage) => {
      const type = msg.type === 'user_input'   ? S.white
                 : msg.type === 'l1_stream'     ? S.cyan
                 : msg.type === 'decomposition' ? stylize(S.bold, S.blue)
                 : msg.type === 'done'          ? S.green
                 : msg.type === 'error'         ? S.red
                 : msg.type === 'warn'          ? S.yellow
                 : msg.type === 'step'          ? stylize(S.bold, S.blue)
                 : S.dim;
      this.put(`${type}${esc(msg.text)}{/}`, false);
    });

    tuiEvents.on('task_start',  ({ id, label }) => this.onTaskStart(id, label));
    tuiEvents.on('task_update', ({ id, status, label }) => this.onTaskUpdate(id, status, label));
    tuiEvents.on('abort',       () => this.onAbort());
  }

  // ── keyboard ────────────────────────────────────────────────────────────────

  private keyboard() {
    // Ctrl+C → abort or quit
    this.screen.key('C-c', () => {
      if (this.running) {
        this.put(stylize(S.yellow, '^C — aborting…'));
        this.abort();
      } else {
        process.exit(0);
      }
    });

    // Ctrl+L → clear
    this.screen.key('C-l', () => {
      this.logPane.setContent('');
    });

    // Escape / q → quit
    this.screen.key(['escape', 'q'], () => process.exit(0));

    // Ctrl+F → fake-search (highlights term in log pane)
    this.screen.key('C-f', () => {
      this.put(stylize(S.yellow, '(search: type /tasks to view task tree)'));
    });

    // Any printable key when not running → readline prompt
    this.readline();
  }

  // ── readline input (overlaid on status bar) ─────────────────────────────────

  private readline() {
    const input = blessed.textbox({
      parent:   this.screen,
      bottom:   0,
      left:     0,
      width:    '100%',
      height:   1,
      inputOnFocus: true,
      border:   { type: 'line' },
      style:    { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
      value:    '',
    });

    input.key('up',   () => this.histUp(input));
    input.key('down', () => this.histDown(input));

    input.on('submit', async (value: string) => {
      const raw = value.trim();
      input.clearValue();
      this.histDown(input); // reset index
      if (raw) await this.handleCommand(raw);
    });

    input.focus();
  }

  // ── history ─────────────────────────────────────────────────────────────────

  private histUp(input: blessed.Widgets.TextboxElement) {
    if (this.history.length === 0) return;
    this.historyIdx = Math.min(this.historyIdx + 1, this.history.length - 1);
    input.setValue(this.history[this.history.length - 1 - this.historyIdx] ?? '');
    input.emit('keypress', null, { full: 'right' } as any);
  }

  private histDown(input: blessed.Widgets.TextboxElement) {
    if (this.historyIdx <= 0) { this.historyIdx = -1; input.clearValue(); }
    else { this.historyIdx--; input.setValue(this.history[this.history.length - 1 - this.historyIdx] ?? ''); }
  }

  private pushHistory(cmd: string) {
    if (!cmd) return;
    this.history = this.history.filter(c => c !== cmd);
    this.history.push(cmd);
    this.historyIdx = -1;
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.historyPath, cmd + '\n');
    } catch { /* ignore */ }
  }

  // ── task tree ────────────────────────────────────────────────────────────────

  private onTaskStart(id: string, label: string) {
    const parts = label.split(' > ');
    let parent = _taskRoot.children;
    for (let i = 0; i < parts.length - 1; i++) {
      let n = parent.find(n => n.label === parts[i] && n.status !== 'done');
      if (!n) { n = { id: `p${i}-${parts[i]}`, label: parts[i], status: 'running', children: [] }; parent.push(n); }
      parent = n.children;
    }
    parent.push({ id, label, status: 'running', children: [] });
  }

  private onTaskUpdate(id: string, status: TUITaskNodeStatus, label?: string) {
    const find = (nodes: any[]): boolean => {
      for (const n of nodes) {
        if (n.id === id) { n.status = status; if (label) n.label = label; return true; }
        if (find(n.children)) return true;
      }
      return false;
    };
    find(_taskRoot.children);
  }

  private onAbort() {
    this.running = false;
    this.setPhase('aborted');
  }

  // ── phase / status helpers ──────────────────────────────────────────────────

  private setPhase(k: PhaseKey) {
    this.phase = k;
    this.statusBar.setContent(this.phaseContent());
    this.screen.render();
  }

  // ── public API ──────────────────────────────────────────────────────────────

  public isRunning()  { return this.running; }
  public isTracing()  { return _traceMode; }
  public getMode()    { return _executionMode; }
  public setExecutionMode(m: ExecutionMode) { _executionMode = m; }

  public getLog()      { return this.logPane; }
  public getLogPane()  { return this.logPane; }
  public getInput() { return null; } // backward compat

  public log(msg: string) { this.put(msg, true); }
  public put(msg: string, flush = true) {
    this.logPane.log(msg);
    if (flush) this.screen.render();
  }

  public start() {
    this.put(stylize(S.green, 'MEOW') + ` ${stylize(S.dim, 'layered agency — type /help for commands')}`);
    this.put(stylize(S.dim, 'L1 liaison  ·  L2 orchestrator  ·  L3 agents  ·  L4 auditor'));
    this.put(''); // blank line
    this.screen.render();
  }

  // ── main command handler ─────────────────────────────────────────────────────

  public async handleCommand(raw: string) {
    this.pushHistory(raw);
    this.running = true;
    this.abortCtrl = new AbortController();
    this.startMs = Date.now();
    this.setPhase('parsing');

    // Echo user input as a styled prompt line
    this.put(`${stylize(S.bold, '›')} ${stylize(S.white, esc(raw))}`);
    this.screen.render();

    if (raw.startsWith('/')) {
      const [name, ...argParts] = raw.slice(1).split(' ');
      const args = argParts.join(' ');
      if (name === 'clear') {
        this.logPane.setContent('');
        this.running = false;
        this.setPhase('ready');
        return;
      }
      const cmd = CMDS.find(c => c.name === name.toLowerCase());
      if (cmd) {
        await cmd.fn({
          log:      (msg) => this.put(msg),
          setPhase: (k)   => this.setPhase(k),
          abort:    ()    => this.abort(),
        }, args);
      } else {
        this.put(stylize(S.red, `unknown: /${name}  (try /help)`));
      }
      this.running = false;
      this.setPhase('ready');
      return;
    }

    try {
      const brief = await this.liaison.chat(
        raw,
        (chunk) => {
          if (!chunk.done && chunk.text) tuiEvents.emitMessage('l1_stream', chunk.text);
        },
        (status) => tuiEvents.emitMessage('info', status),
      );

      // Low complexity → respond directly, done
      if (brief.brief.complexity <= 60) {
        tuiEvents.emitMessage('done', brief.text);
        this.put(brief.text);
        this.running = false;
        this.setPhase('ready');
        return;
      }

      // High complexity → L2 orchestration
      this.setPhase('orch');
      const result = await this.orchestrator.execute(raw, {
        mode: _executionMode,
        onStatus: (update: StatusUpdate) => {
          tuiEvents.fromStatusUpdate(update);
          if (_traceMode) this.put(stylize(S.dim, `[${update.level}] ${update.message}`));
        },
      });

      if (result.success) {
        this.setPhase('success');
        this.put(stylize(S.green, '✓ orchestration complete'));
      } else {
        this.setPhase('error');
        this.put(stylize(S.red, '✗ orchestration failed'));
      }

      if (result.summary) this.put(result.summary);
      if (result.details) {
        const detail = result.details as any;
        this.tokens += detail.tokensUsed ?? 0;
        this.statusBar.setContent(this.phaseContent());
        if (detail.taskResults?.length) {
          for (const tr of detail.taskResults as any[]) {
            const icon = tr.success ? stylize(S.green, '✓') : stylize(S.red, '✗');
            this.put(`${icon} ${esc(tr.taskLabel ?? tr.taskId)}`);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.put(stylize(S.red, `error: ${msg}`));
      this.setPhase('error');
    }

    this.running = false;
    this.setPhase('ready');
    this.screen.render();
  }

  public abort() {
    this.abortCtrl?.abort();
    tuiEvents.emitAbort();
    this.running = false;
    this.setPhase('aborted');
  }
}

// ── type re-export for internal use ─────────────────────────────────────────

type TUITaskNodeStatus = 'pending' | 'running' | 'done' | 'failed';