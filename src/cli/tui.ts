import blessed from 'blessed';
import * as contrib from 'blessed-contrib';
import { Orchestrator, StatusUpdate } from '../orchestrator/Orchestrator';
import { Agent } from '../agent/agent';
import { DatabasePort } from '../extensions/database/manifest';

export interface PaneState {
  orchestrator: Orchestrator;
  agent: Agent;
  input: blessed.Widgets.TextboxElement;
}

export class MeowTUI {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private workerPanes: any[] = [];
  private console!: any;
  private header!: blessed.Widgets.BoxElement;
  private panes: PaneState[] = [];
  private splitCount: number = 4;
  private activePane: number = 0;

  constructor(agents: Agent | Agent[], screen?: blessed.Widgets.Screen) {
    this.screen = screen || blessed.screen({
      smartCSR: true,
      title: 'MEOW Dashboard',
      fullUnicode: true,
    });

    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Support both single agent (backward compat) and array of agents
    const agentArray: Agent[] = Array.isArray(agents) ? agents : [agents];

    // Create orchestrators for each agent
    this.panes = agentArray.map(agent => ({
      orchestrator: new Orchestrator(agent),
      agent,
      input: null as any
    }));

    // Initialize UI
    this.renderLayout();
    this.setupEvents();
  }

  private renderLayout() {
    // Clear existing widgets if any
    [...this.screen.children].forEach(child => child.detach());
    this.workerPanes = [];
    this.paneInputs = [];

    // Header (Row 0, Span 12)
    this.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: ` {bold}MEOW{/bold} | {cyan-fg}Sovereign Orchestrator{/cyan-fg} | Splits: ${this.splitCount} | Status: {green-fg}ACTIVE{/green-fg} {black-fg}[AGENT:S:${this.splitCount}:A]{/black-fg}`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
      border: { type: 'line', fg: 'white' }
    });

    // Dynamic Worker Panes
    const startRow = 1;
    const endRow = 9;
    const height = endRow - startRow;

    if (this.splitCount === 1) {
      this.addWorkerPane(startRow, 0, height, 12, 1);
    } else if (this.splitCount === 2) {
      this.addWorkerPane(startRow, 0, height, 6, 1);
      this.addWorkerPane(startRow, 6, height, 6, 2);
    } else if (this.splitCount === 4) {
      const halfHeight = Math.floor(height / 2);
      this.addWorkerPane(startRow, 0, halfHeight, 6, 1);
      this.addWorkerPane(startRow, 6, halfHeight, 6, 2);
      this.addWorkerPane(startRow + halfHeight, 0, halfHeight, 6, 3);
      this.addWorkerPane(startRow + halfHeight, 6, halfHeight, 6, 4);
    }

    // Global Console (Row 9, Span 12)
    this.console = this.grid.set(9, 0, 2, 12, blessed.log, {
      label: ' [ SYSTEM LOGS ] ',
      border: { type: 'line' },
      style: { border: { fg: 'gray' }, label: { fg: 'white', bold: true } },
      scrollable: true,
      alwaysScroll: true,
      tags: true
    });

    // Input Area (Row 11, Span 12)
    // Single input for commands, routed to active pane
    const inputLabel = this.splitCount > 1 ? ` [ INPUT -> PANE ${this.activePane + 1} ] ` : ' [ INPUT ] ';
    const input = this.grid.set(11, 0, 1, 12, blessed.textbox, {
      label: inputLabel,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } },
      inputOnFocus: true,
    });

    input.on('submit', async (value: string) => {
      const cmd = value.trim();
      input.clearValue();
      input.focus();
      if (cmd) await this.handleCommand(cmd);
      this.screen.render();
    });

    input.focus();
    this.screen.render();
  }

  private paneInputs: blessed.Widgets.TextboxElement[] = [];

  private addWorkerPane(row: number, col: number, rowSpan: number, colSpan: number, id: number) {
    const pane = this.grid.set(row, col, rowSpan, colSpan, blessed.log, {
      label: ` WORKER ${id} `,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true }
      },
      scrollable: true,
      alwaysScroll: true,
      tags: true
    });
    this.workerPanes.push(pane);
  }

  private setupEvents() {
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    // Tab to cycle through panes
    this.screen.key(['tab'], () => {
      if (this.splitCount > 1) {
        this.activePane = (this.activePane + 1) % this.splitCount;
        this.updateHeaderForPane();
      }
    });

    // Number keys 1-4 to select pane directly
    for (let i = 1; i <= 4; i++) {
      const paneIdx = i - 1;
      this.screen.key([String(i)], () => {
        if (paneIdx < this.splitCount) {
          this.activePane = paneIdx;
          this.updateHeaderForPane();
        }
      });
    }
  }

  private updateHeaderForPane() {
    const color = this.panes[this.activePane] ? 'green' : 'red';
    this.header.setContent(
      ` {bold}MEOW{/bold} | {cyan-fg}Sovereign Orchestrator{/cyan-fg} | ` +
      `Splits: ${this.splitCount} | Active: {${color}-fg}PANE ${this.activePane + 1}{/${color}-fg} ` +
      `{black-fg}[AGENT:S:${this.splitCount}:P${this.activePane + 1}]{/black-fg}`
    );
    this.screen.render();
  }

  public async handleCommand(cmd: string) {
    this.log(`{bold}>>{/bold} ${cmd}`);

    if (cmd.startsWith('/')) {
      const parts = cmd.slice(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1);

      switch (command) {
        case 'split':
          const count = parseInt(args[0]);
          if ([1, 2, 4].includes(count)) {
            this.splitCount = count;
            if (this.activePane >= this.splitCount) {
              this.activePane = 0;
            }
            this.renderLayout();
            this.log(`Layout updated to {bold}${count}{/bold} panes.`);
          } else {
            this.log('{red-fg}Invalid split count. Use 1, 2, or 4.{/red-fg}');
          }
          break;
        case 'exit':
          process.exit(0);
          break;
        case 'clear':
          this.console.setContent('');
          this.workerPanes.forEach(p => p.setContent(''));
          break;
        case 'help':
          this.log('{bold}Commands:{/bold}');
          this.log('  /split [1|2|4] - Change layout');
          this.log('  /1, /2, /3, /4 - Select active pane');
          this.log('  /clear         - Clear all logs');
          this.log('  /exit          - Quit MEOW');
          this.log('{cyan-fg}Tip: Tab cycles panes, 1-4 selects directly{/cyan-fg}');
          break;
        case '1': case '2': case '3': case '4':
          const paneNum = parseInt(command) - 1;
          if (paneNum < this.splitCount) {
            this.activePane = paneNum;
            this.updateHeaderForPane();
            this.log(`Switched to {bold}PANE ${paneNum + 1}{/bold}`);
          }
          break;
        default:
          this.log(`{red-fg}Unknown command: ${command}{/red-fg}`);
      }
      return;
    }

    // Route to the active pane's orchestrator
    const pane = this.panes[this.activePane];
    if (!pane) {
      this.log(`{red-fg}No pane configured for slot ${this.activePane + 1}{/red-fg}`);
      return;
    }

    try {
      this.updateHeader('ORCHESTRATING', 'yellow');
      const result = await pane.orchestrator.execute(cmd, {
        onStatus: (update: StatusUpdate) => {
          this.handleStatusUpdate(update);
        }
      });
      this.updateHeaderForPane();
      this.log(`{bold}Task Result:{/bold} ${result.success ? '{green-fg}SUCCESS{/green-fg}' : '{red-fg}FAILED{/red-fg}'}`);
      this.log(result.summary);
    } catch (err: any) {
      this.updateHeader('ERROR', 'red');
      this.log(`{red-fg}Error: ${err.message}{/red-fg}`);
    }
  }

  private handleStatusUpdate(update: StatusUpdate) {
    const time = new Date(update.timestamp).toLocaleTimeString([], { hour12: false });
    const color = update.level === 'error' ? 'red-fg' : update.level === 'warning' ? 'yellow-fg' : 'white-fg';
    const message = `[{gray-fg}${time}{/gray-fg}] {${color}}${update.message}{/${color}}`;

    if (update.taskId) {
      const paneIndex = this.getPaneForTask(update.taskId);
      if (this.workerPanes[paneIndex]) {
        this.workerPanes[paneIndex].log(message);
      } else {
        this.log(message);
      }
    } else {
      this.log(message);
    }
    this.screen.render();
  }

  private taskPaneMap: Map<string, number> = new Map();
  private nextPane = 0;

  private getPaneForTask(taskId: string): number {
    if (!this.taskPaneMap.has(taskId)) {
      this.taskPaneMap.set(taskId, this.nextPane);
      this.nextPane = (this.nextPane + 1) % Math.max(1, this.splitCount);
    }
    return this.taskPaneMap.get(taskId)!;
  }

  private log(msg: string) {
    this.console.log(msg);
    this.screen.render();
  }

  private updateHeader(status: string, color: string) {
    this.header.setContent(
      ` {bold}MEOW{/bold} | {cyan-fg}Sovereign Orchestrator{/cyan-fg} | ` +
      `Splits: ${this.splitCount} | Status: {${color}-fg}${status}{/${color}-fg} ` +
      `{black-fg}[AGENT:S:${this.splitCount}:${status[0]}]{/black-fg}`
    );
    this.screen.render();
  }

  public start() {
    this.log('{cyan-fg}MEOW Dashboard Online.{/cyan-fg}');
    this.log(`{bold}${this.panes.length}{/bold} agent swarm(s) ready.`);
    this.log('Type your request to begin parallel orchestration.');
    if (this.splitCount > 1) {
      this.log('Use {bold}/1, /2, /3, /4{/bold} to switch between panes, or {bold}Tab{/bold} to cycle.');
    }
    this.screen.render();
  }

  // Testing Helpers
  public getScreen() { return this.screen; }
  public getWorkerPanes() { return this.workerPanes; }
  public getConsole() { return this.console; }
  public getInput() { return null; } // Single input is internal, no direct access
  public getSplitCount() { return this.splitCount; }
  public getActivePane() { return this.activePane; }
  public setActivePane(idx: number) { this.activePane = idx; }
}
