import blessed from 'blessed';
import * as contrib from 'blessed-contrib';
import { Orchestrator, StatusUpdate } from '../orchestrator/Orchestrator';
import { Agent } from '../agent/agent';
import { Liaison } from '../liaison/Liaison';

export class MeowTUI {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private logPane!: blessed.Widgets.Log;
  private input!: blessed.Widgets.TextboxElement;
  private header!: blessed.Widgets.BoxElement;
  private orchestrator: Orchestrator;
  private liaison: Liaison;

  constructor(agent: Agent, screen?: blessed.Widgets.Screen) {
    this.orchestrator = new Orchestrator(agent);
    this.liaison = new Liaison(agent);

    this.screen = screen || blessed.screen({
      smartCSR: true,
      title: 'MEOW Dashboard',
      fullUnicode: true,
    });

    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });
    this.renderLayout();
    this.setupEvents();
  }

  private renderLayout() {
    // Header
    this.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: ` {bold}MEOW{/bold} | {cyan-fg}Sovereign Orchestrator{/cyan-fg} | Status: {green-fg}READY{/green-fg}`,
      tags: true,
      style: { fg: 'white', bg: 'black' },
      border: { type: 'line', fg: 'white' }
    });

    // Main Log Pane (Rows 1-10)
    this.logPane = this.grid.set(1, 0, 10, 12, blessed.log, {
      label: ' [ OUTPUT ] ',
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } },
      scrollable: true,
      alwaysScroll: true,
      tags: true
    });

    // Input Area (Rows 11-12)
    this.input = this.grid.set(11, 0, 1, 12, blessed.textbox, {
      label: ' [ INPUT ] ',
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } },
      inputOnFocus: true,
    });

    this.input.on('submit', async (value: string) => {
      const cmd = value.trim();
      this.input.clearValue();
      this.input.focus();
      if (cmd) await this.handleCommand(cmd);
      this.screen.render();
    });

    this.input.focus();
    this.screen.render();
  }

  private setupEvents() {
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    this.screen.key(['tab'], () => {
      this.input.focus();
    });
  }

  public async handleCommand(cmd: string) {
    this.log(`{bold}>>{/bold} ${cmd}`);

    if (cmd.startsWith('/')) {
      const parts = cmd.slice(1).split(' ');
      const command = parts[0];

      switch (command) {
        case 'exit':
          process.exit(0);
          break;
        case 'clear':
          this.logPane.setContent('');
          break;
        case 'help':
          this.log('{bold}Commands:{/bold}');
          this.log('  /clear - Clear output');
          this.log('  /exit  - Quit MEOW');
          break;
        default:
          this.log(`{red-fg}Unknown command: ${command}{/red-fg}`);
      }
      return;
    }

    try {
      this.updateHeader('L1: PARSING', 'cyan');

      // L1 Path: Use Liaison for fast-path interaction
      const liaisonResponse = await this.liaison.chat(
        cmd,
        // Stream callback
        (chunk) => {
          if (!chunk.done && chunk.text) {
            process.stdout.write(chunk.text);
          }
        },
        // Status callback
        (status) => {
          this.log(`{gray-fg}[${status}]{/gray-fg}`);
        }
      );

      this.log(`{cyan-fg}[Intent: ${liaisonResponse.brief.intent}] [Domain: ${liaisonResponse.brief.domain}] [Complexity: ${liaisonResponse.brief.complexity}]{/cyan-fg}`);

      // If complexity is high, hand off to L2 Architect
      if (liaisonResponse.brief.complexity > 60) {
        this.updateHeader('L2: ORCHESTRATING', 'yellow');
        this.log('{yellow-fg}Complex request detected. Handing off to Architect (L2)...{/yellow-fg}');

        const result = await this.orchestrator.execute(cmd, {
          onStatus: (update: StatusUpdate) => {
            this.handleStatusUpdate(update);
          }
        });

        this.updateHeader('READY', 'green');
        this.log(`{bold}Result:{/bold} ${result.success ? '{green-fg}SUCCESS{/green-fg}' : '{red-fg}FAILED{/red-fg}'}`);
        this.log(result.summary);
      } else {
        this.updateHeader('READY', 'green');
        this.log(liaisonResponse.text);
      }
    } catch (err: any) {
      this.updateHeader('ERROR', 'red');
      this.log(`{red-fg}Error: ${err.message}{/red-fg}`);
    }
  }

  private handleStatusUpdate(update: StatusUpdate) {
    const time = new Date(update.timestamp).toLocaleTimeString([], { hour12: false });
    const color = update.level === 'error' ? 'red-fg' : update.level === 'warning' ? 'yellow-fg' : 'white-fg';
    const message = `[{gray-fg}${time}{/gray-fg}] {${color}}${update.message}{/${color}}`;
    this.logPane.log(message);
    this.screen.render();
  }

  private log(msg: string) {
    this.logPane.log(msg);
    this.screen.render();
  }

  private updateHeader(status: string, color: string) {
    this.header.setContent(
      ` {bold}MEOW{/bold} | {cyan-fg}Sovereign Orchestrator{/cyan-fg} | Status: {${color}-fg}${status}{/${color}-fg}`
    );
    this.screen.render();
  }

  public start() {
    this.log('{cyan-fg}MEOW Layered Agency System Online.{/cyan-fg}');
    this.log('L1: Liaison | L2: Architect | L3: Swarm | L4: Auditor');
    this.log('Type your request to begin orchestration.');
    this.screen.render();
  }

  // Testing Helpers
  public getScreen() { return this.screen; }
  public getLogPane() { return this.logPane; }
  public getConsole() { return this.logPane; }
  public getInput() { return this.input; }
}
