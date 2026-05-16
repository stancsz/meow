import * as blessed from 'blessed';
import * as contrib from 'blessed-contrib';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../agent/agent';
import { Liaison } from '../liaison/Liaison';
import { Orchestrator, StatusUpdate } from '../orchestrator/Orchestrator';
import { ExecutionMode } from '../orchestrator/ExecutionMode';
import { tuiEvents, TUIMessage, TUITaskNode } from './tui-events';

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

type StyleTag = string;
const STYLE: Record<string, StyleTag> = {
  user_input: '{bold}{white-fg}',
  l1:         '{cyan-fg}',
  l2:         '{yellow-fg}',
  l3:         '{magenta-fg}',
  l4:         '{dim}',
  info:       '{blue-fg}',
  step:       '{bold}{blue-fg}',
  done:       '{bold}{green-fg}',
  error:      '{bold}{red-fg}',
  warn:       '{bold}{yellow-fg}',
  system:     '{dim}',
  reset:      '{/}',
};

function styled(type: string, text: string): string {
  const open  = STYLE[type] ?? '';
  const close = open ? '{/}' : '';
  return `${open}${text}${close}`;
}

/** Escape brace tags so user input never breaks blessed rendering */
function escapeTags(text: string): string {
  return text.replace(/\{/g, '\\{');
}

// ─── Task tree rendering ───────────────────────────────────────────────────────

function renderTaskTree(nodes: TUITaskNode[]): string {
  if (nodes.length === 0) return styled('system', '(no active tasks)');
  const lines: string[] = [];
  function walk(nodes: TUITaskNode[], depth = 0) {
    for (const node of nodes) {
      const pad = '  '.repeat(depth);
      const icon =
        node.status === 'running' ? styled('l1', '▸') :
        node.status === 'done'    ? styled('done', '✓') :
        node.status === 'failed'  ? styled('error', '✗') :
                                    styled('system', '○');
      lines.push(`${pad}${icon} ${escapeTags(node.label)}`);
      if (node.expanded) walk(node.children, depth + 1);
    }
  }
  walk(nodes);
  return lines.join('\n');
}

// ─── Slash commands ────────────────────────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  execute(ctx: CommandContext): Promise<void>;
}

interface CommandContext {
  tui: MeowTUI;
  args: string;
  log(msg: string, type?: string): void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'help', aliases: ['?'],
    description: 'Show command palette',
    async execute({ log }) {
      log(styled('system', 'Commands:'));
      for (const cmd of SLASH_COMMANDS) {
        const names = [cmd.name, ...(cmd.aliases ?? [])].map(n => `/${n}`).join(', ');
        log(`  ${styled('info', names)}  ${cmd.description}`);
      }
    },
  },
  {
    name: 'clear',
    description: 'Clear output pane',
    async execute({ tui }) {
      tui.getOutput().setContent('');
      tui.render();
    },
  },
  {
    name: 'abort',
    description: 'Abort the current task',
    async execute({ tui, log }) {
      if (!tui.isRunning()) {
        log(styled('warn', 'No task in progress.'));
        return;
      }
      tui.abort();
      log(styled('error', '[ABORTED] Task cancelled.'));
    },
  },
  {
    name: 'status',
    description: 'Show task + token status',
    async execute({ tui, log }) {
      const s = tui.getStatus();
      log(styled('info', `Mode: ${s.mode} | Tokens: ${s.tokens.toLocaleString()} | Elapsed: ${s.elapsed}`));
      log(styled('info', `Tasks: ${s.tasksDone}/${s.tasksTotal} | Running: ${s.running ? 'yes' : 'no'}`));
    },
  },
  {
    name: 'mode',
    description: 'Set mode: ship | sequential | parallel | audit',
    async execute({ tui, args, log }) {
      const m = args.trim().toUpperCase();
      const modes: Record<string, ExecutionMode> = {
        SHIP:       ExecutionMode.SHIP,
        SEQUENTIAL: ExecutionMode.SEQUENTIAL,
        PARALLEL:   ExecutionMode.PARALLEL,
        AUDIT_ONLY: ExecutionMode.AUDIT_ONLY,
      };
      if (!modes[m]) {
        log(styled('error', `Unknown mode: ${m}. Options: ship, sequential, parallel, audit`));
        return;
      }
      tui.setExecutionMode(modes[m]);
      log(styled('done', `Mode → ${m}`));
      tuiEvents.emitModeChange(m);
    },
  },
  {
    name: 'parallel',
    description: 'Toggle parallel execution mode',
    async execute({ tui, log }) {
      tui.toggleParallel();
      log(styled('info', `Parallel mode: ${tui.isParallel() ? 'ON' : 'OFF'}`));
    },
  },
  {
    name: 'trace',
    description: 'Toggle detailed trace output',
    async execute({ tui, log }) {
      tui.toggleTrace();
      log(styled('info', `Trace mode: ${tui.isTracing() ? 'ON' : 'OFF'}`));
    },
  },
  {
    name: 'history',
    description: 'Show command history',
    async execute({ tui, log }) {
      const hist = tui.getHistory();
      if (hist.length === 0) { log(styled('warn', 'No history.')); return; }
      hist.forEach((cmd, i) => log(styled('system', `  ${String(i + 1).padStart(3, ' ')}  ${cmd}`)));
    },
  },
  {
    name: 'reset',
    description: 'Reset context and history',
    async execute({ tui, log }) {
      tui.reset();
      log(styled('done', 'Context and history cleared.'));
    },
  },
  {
    name: 'tasks',
    description: 'Show task tree',
    async execute({ tui, log }) {
      const tree = tui.getTaskTree();
      log(renderTaskTree(tree));
    },
  },
  {
    name: 'exit',
    description: 'Exit MEOW',
    async execute() { process.exit(0); },
  },
];

// ─── Main TUI ─────────────────────────────────────────────────────────────────

export class MeowTUI {
  // Widgets
  private screen!: blessed.Widgets.Screen;
  private headerBox!: blessed.Widgets.BoxElement;
  private taskTreeBox!: blessed.Widgets.BoxElement;
  private outputLog!: blessed.Widgets.Log;
  private inputBox!: blessed.Widgets.TextboxElement;
  private statusBox!: blessed.Widgets.BoxElement;
  private searchOverlay!: blessed.Widgets.BoxElement;
  private searchBar!: blessed.Widgets.TextboxElement;

  // State
  private agent: Agent;
  private liaison!: Liaison;
  private orchestrator!: Orchestrator;
  private tasks: TUITaskNode[] = [];
  private taskIndex = 0;
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private historyPath: string;
  private abortController?: AbortController;
  private _isRunning = false;
  private _executionMode = ExecutionMode.SHIP;
  private _parallelMode = false;
  private _traceMode = false;
  private tokenCount = 0;
  private startTime = Date.now();
  private searchMode = false;
  private searchQuery = '';

  constructor(agent: Agent, screen?: blessed.Widgets.Screen) {
    this.agent = agent;
    this.historyPath = path.join(
      process.env.HOME ?? '/tmp',
      '.meow', 'history.txt'
    );
    this.screen = screen ?? blessed.screen({
      smartCSR: true,
      title: 'MEOW',
      fullUnicode: true,
    });
    this.buildLayout();
    this.wireEvents();
    this.wireKeyboard();
  }

  // ─── Layout builder ────────────────────────────────────────────────────────

  private buildLayout() {
    const screen = this.screen;

    // Header (1 row)
    this.headerBox = blessed.box({
      parent: screen,
      top: 0, left: 0,
      width: '100%', height: 1,
      content: this.buildHeader(),
      tags: true,
      style: { fg: 'white', bg: 'black' },
    });

    // Task Tree (left 30%)
    this.taskTreeBox = blessed.box({
      parent: screen,
      top: 1, left: 0,
      width: '30%', height: '100%-2',
      label: ' TASKS ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
        fg: 'white',
      },
      content: renderTaskTree([]),
      tags: true,
      scrollable: true,
      alwaysScroll: false,
    });

    // Output Log (right 70%, minus status row)
    this.outputLog = blessed.log({
      parent: screen,
      top: 1, left: '30%',
      width: '70%', height: '100%-2',
      label: ' OUTPUT ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
        fg: 'white',
      },
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      input: false,
    });

    // Status Bar (bottom)
    this.statusBox = blessed.box({
      parent: screen,
      bottom: 0, left: 0,
      width: '100%', height: 1,
      content: this.buildStatusBar(),
      tags: true,
      style: { fg: 'white', bg: 'blue' },
    });

    // Input box (above status bar)
    this.inputBox = blessed.textbox({
      parent: screen,
      bottom: 1, left: 0,
      width: '100%', height: 1,
      label: ' INPUT ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
        fg: 'white',
      },
      inputOnFocus: true,
      tags: true,
    });

    // Search overlay (hidden until Ctrl+F)
    this.searchOverlay = blessed.box({
      parent: screen,
      top: 'center', left: 'center',
      width: '80%', height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' }, bg: 'black' },
      content: '',
      hidden: true,
    });

    this.searchBar = blessed.textbox({
      parent: this.searchOverlay,
      top: 0, left: 0, width: '100%', height: 1,
      bg: 'black', fg: 'yellow',
      border: { type: 'bg' },
      inputOnFocus: true,
      name: 'search',
    });
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────

  private wireEvents() {
    this.liaison = new Liaison(this.agent);
    this.orchestrator = new Orchestrator(this.agent);

    // TUI event bus
    tuiEvents.on('message',    (msg: TUIMessage) => this.onTuiMessage(msg));
    tuiEvents.on('task_start', (data: { id: string; label: string }) => this.onTaskStart(data.id, data.label));
    tuiEvents.on('task_update', (data: { id: string; status: TUITaskNode['status']; label?: string }) =>
      this.onTaskUpdate(data.id, data.status, data.label));
    tuiEvents.on('abort', () => this.abort());

    // Input submit
    this.inputBox.on('submit', async (value: string) => {
      const cmd = value.trim();
      this.inputBox.clearValue();
      this.render();
      if (cmd) await this.handleCommand(cmd);
    });

    // Search bar
    this.searchBar.on('submit', () => this.exitSearch());
    this.searchBar.key(['escape'], () => this.exitSearch());
    this.searchBar.on('keypress', (_: any, data: { full: string }) => {
      if (data.full === 'C-f') this.exitSearch();
    });
  }

  private wireKeyboard() {
    // Quit on Ctrl+C
    this.screen.key(['C-c'], () => {
      if (this._isRunning) {
        this.log(styled('error', '^C — aborting...'), 'error');
        this.abort();
      } else {
        process.exit(0);
      }
    });

    // Search
    this.screen.key(['C-f'], () => this.enterSearch());

    // Clear output
    this.screen.key(['C-l'], () => {
      this.outputLog.setContent('');
      this.render();
    });

    // Command history navigation
    this.inputBox.key(['up'],   () => this.historyUp());
    this.inputBox.key(['down'], () => this.historyDown());

    // Quit on Escape or q
    this.screen.key(['escape', 'q'], () => process.exit(0));

    // Tab focuses input
    this.screen.key(['tab'], () => { this.inputBox.focus(); this.render(); });
  }

  // ─── Command history ──────────────────────────────────────────────────────

  private historyUp() {
    if (this.commandHistory.length === 0) return;
    this.historyIndex = Math.min(this.historyIndex + 1, this.commandHistory.length - 1);
    const cmd = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex] ?? '';
    this.inputBox.setValue(cmd);
    this.render();
  }

  private historyDown() {
    if (this.historyIndex <= 0) {
      this.historyIndex = -1;
      this.inputBox.clearValue();
    } else {
      this.historyIndex--;
      const cmd = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex] ?? '';
      this.inputBox.setValue(cmd);
    }
    this.render();
  }

  private pushHistory(cmd: string) {
    if (!cmd) return;
    this.commandHistory = this.commandHistory.filter(c => c !== cmd);
    this.commandHistory.push(cmd);
    this.historyIndex = -1;
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.historyPath, cmd + '\n');
    } catch { /* ignore */ }
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  private enterSearch() {
    this.searchMode = true;
    this.searchQuery = '';
    this.searchOverlay.show();
    this.searchBar.setValue('');
    this.searchBar.focus();
    this.searchOverlay.setContent('');
    this.render();
  }

  private exitSearch() {
    this.searchMode = false;
    this.searchOverlay.hide();
    this.inputBox.focus();
    this.render();
  }

  private doSearch(query: string) {
    this.searchQuery = query;
    if (!query) return;
    const raw = this.outputLog.getContent();
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const lines = raw.split('\n');
      const highlighted = lines.map(line =>
        regex.test(line) ? line.replace(regex, '{yellow-fg}{bold}$1{/yellow-fg}{/bold}') : line
      ).join('\n');
      this.outputLog.setContent(highlighted);
    } catch { /* invalid regex */ }
  }

  // ─── TUI event handlers ───────────────────────────────────────────────────

  private onTuiMessage(msg: TUIMessage) {
    const type = msg.type === 'user_input' ? 'user_input'
               : msg.type === 'l1_stream'  ? 'l1'
               : msg.type === 'l2_stream'  ? 'l2'
               : msg.type === 'l3_stream'  ? 'l3'
               : msg.type === 'l4_stream'  ? 'l4'
               : msg.type === 'decomposition' ? 'step'
               : msg.type;
    this.log(styled(type, msg.text), type);
  }

  private onTaskStart(id: string, label: string) {
    const parts = label.split(' > ');
    let parent = this.tasks;
    for (let i = 0; i < parts.length - 1; i++) {
      let node = parent.find(n => n.label === parts[i] && n.status !== 'done');
      if (!node) {
        node = { id: `task-${++this.taskIndex}`, label: parts[i], status: 'running', children: [], expanded: true };
        parent.push(node);
      }
      parent = node.children;
    }
    parent.push({ id, label, status: 'running', children: [], expanded: true });
    this.refreshTaskTree();
  }

  private onTaskUpdate(id: string, status: TUITaskNode['status'], label?: string) {
    this.findAndUpdate(this.tasks, id, status, label);
    this.refreshTaskTree();
    this.updateStatusBar();
  }

  private findAndUpdate(nodes: TUITaskNode[], id: string, status: TUITaskNode['status'], label?: string): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        node.status = status;
        if (label) node.label = label;
        return true;
      }
      if (this.findAndUpdate(node.children, id, status, label)) return true;
    }
    return false;
  }

  private refreshTaskTree() {
    this.taskTreeBox.setContent(renderTaskTree(this.tasks));
    this.render();
  }

  // ─── Status builders ──────────────────────────────────────────────────────

  private buildHeader(): string {
    const phase = this._isRunning
      ? this.styledPhase('RUNNING', 'yellow')
      : this.styledPhase('READY', 'green');
    return `{center}{bold}MEOW{/bold} | tiered agency | ${phase}{/center}`;
  }

  private styledPhase(text: string, color: string): string {
    return `{${color}-fg}{bold}${text}{/bold}{/${color}-fg}`;
  }

  private buildStatusBar(): string {
    const elapsed = this.elapsed();
    const mode = ExecutionMode[this._executionMode] ?? 'SHIP';
    return `{center}${styled('system', '━'.repeat(60))}{/center}` +
      `{center}[${mode}]  tokens:${styled('info', this.tokenCount.toLocaleString())}  ` +
      `elapsed:${styled('info', elapsed)}  tasks:${styled('info', this.taskCount().join('/'))}` +
      `  ${this._parallelMode ? styled('done', '⫸parallel') : ''}` +
      `  ${this._traceMode   ? styled('warn',  '◆trace')   : ''}{/center}`;
  }

  private elapsed(): string {
    const ms = Date.now() - this.startTime;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return h > 0 ? `${h}h${m}m` : `${m}m${String(s).padStart(2, '0')}s`;
  }

  private taskCount(): [number, number] {
    const done = this.countByStatus(this.tasks, 'done');
    const total = this.countTotal(this.tasks);
    return [done, total];
  }

  private countByStatus(nodes: TUITaskNode[], status: TUITaskNode['status']): number {
    return nodes.reduce((n, n_) =>
      n + (n_.status === status ? 1 : 0) + this.countByStatus(n_.children, status), 0);
  }

  private countTotal(nodes: TUITaskNode[]): number {
    return nodes.reduce((n, n_) => n + 1 + this.countTotal(n_.children), 0);
  }

  // ─── Public API (used by slash commands) ─────────────────────────────────

  isRunning(): boolean { return this._isRunning; }
  isParallel(): boolean { return this._parallelMode; }
  isTracing(): boolean { return this._traceMode; }

  getOutput(): blessed.Widgets.Log { return this.outputLog; }
  getStatus(): { mode: string; tokens: number; elapsed: string; tasksDone: number; tasksTotal: number; running: boolean } {
    const [done, total] = this.taskCount();
    const mode = ExecutionMode[this._executionMode] ?? 'SHIP';
    return { mode, tokens: this.tokenCount, elapsed: this.elapsed(), tasksDone: done, tasksTotal: total, running: this._isRunning };
  }

  getHistory(): string[] { return [...this.commandHistory]; }
  getTaskTree(): TUITaskNode[] { return this.tasks; }

  setExecutionMode(mode: ExecutionMode) { this._executionMode = mode; }
  toggleParallel() { this._parallelMode = !this._parallelMode; }
  toggleTrace() { this._traceMode = !this._traceMode; }

  abort() {
    this.abortController?.abort();
    tuiEvents.emitAbort();
    this._isRunning = false;
    this.updatePhase('ABORTED', 'yellow');
  }

  reset() {
    this.tasks = [];
    this.tokenCount = 0;
    this.startTime = Date.now();
    this.commandHistory = [];
    this.historyIndex = -1;
    this.outputLog.setContent('');
    this.refreshTaskTree();
    this.updateStatusBar();
  }

  // ─── Main command handler ─────────────────────────────────────────────────

  public async handleCommand(raw: string) {
    this.pushHistory(raw);
    this._isRunning = true;
    this.abortController = new AbortController();
    this.log(styled('user_input', `>> ${escapeTags(raw)}`), 'user_input');
    this.updateStatusBar();
    this.render();

    if (raw.startsWith('/')) {
      const [name, ...argParts] = raw.slice(1).split(' ');
      const args = argParts.join(' ');
      const cmd = SLASH_COMMANDS.find(c => c.name === name || c.aliases?.includes(name));
      if (cmd) {
        await cmd.execute({ tui: this, args, log: (msg, type) => this.log(msg, type ?? 'info') });
      } else {
        this.log(styled('error', `Unknown command: /${name}. Try /help`), 'error');
      }
      this.render();
      this._isRunning = false;
      return;
    }

    // L1 parsing
    this.updatePhase('L1: PARSING', 'cyan');
    this.render();

    try {
      const brief = await this.liaison.chat(
        raw,
        (chunk) => {
          if (!chunk.done && chunk.text) {
            tuiEvents.emitMessage('l1_stream', chunk.text);
          }
        },
        (status) => {
          tuiEvents.emitMessage('info', status);
        }
      );

      this.log(styled('info', `[Intent: ${brief.brief.intent}] [Domain: ${brief.brief.domain}] [Complexity: ${brief.brief.complexity}]`));

      if (brief.brief.complexity <= 60 && !raw.startsWith('/')) {
        // Simple: respond directly
        this.log(brief.text, 'l1');
        this.updatePhase('READY', 'green');
      } else {
        // Complex: L2 orchestrator
        this.updatePhase('L2: ORCHESTRATING', 'yellow');
        this.log(styled('info', 'Complex request — handing off to L2 orchestrator...'));

        const result = await this.orchestrator.execute(raw, {
          mode: this._executionMode,
          onStatus: (update: StatusUpdate) => {
            tuiEvents.fromStatusUpdate(update);
            if (this._traceMode) {
              this.log(styled('step', `[${update.level.toUpperCase()}] ${update.message}`));
            }
          },
        });

        if (result.success) {
          this.log(styled('done', '[DONE] Orchestration complete.'));
        } else {
          this.log(styled('error', '[ERROR] Orchestration failed.'));
        }

        this.log(result.summary ?? '', 'l2');

        // Aggregate tokens
        if (result.details) {
          const detail = result.details as any;
          this.tokenCount += detail.tokensUsed ?? 0;
          if (detail.taskResults) {
            for (const tr of detail.taskResults as any[]) {
              const icon = tr.success ? styled('done', '✓') : styled('error', '✗');
              this.log(`${icon} ${escapeTags(tr.taskLabel ?? tr.taskId)}`, tr.success ? 'done' : 'error');
            }
          }
        }

        this.updatePhase('READY', 'green');
        this.updateStatusBar();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(styled('error', `Error: ${msg}`), 'error');
      this.updatePhase('ERROR', 'red');
    }

    this._isRunning = false;
    this.render();
  }

  private updatePhase(phase: string, color: string) {
    this.headerBox.setContent(this.buildHeader());
    this.statusBox.setContent(this.buildStatusBar());
    this.render();
  }

  private updateStatusBar() {
    this.statusBox.setContent(this.buildStatusBar());
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  log(msg: string, _type?: string) {
    this.outputLog.log(msg);
    this.render();
  }

  render() {
    this.screen.render();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  public start() {
    this.log(styled('info', 'MEOW Layered Agency System Online'));
    this.log(styled('system', 'L1: Liaison  L2: Architect  L3: Swarm  L4: Auditor'));
    this.log(styled('system', 'Try /help for slash commands · Ctrl+F to search · Ctrl+C to abort'));
    this.render();
  }

  // ─── Test helpers ────────────────────────────────────────────────────────

  public getScreen()   { return this.screen; }
  public getLogPane()  { return this.outputLog; }
  public getConsole()  { return this.outputLog; }
  public getInput()    { return this.inputBox; }
}