import blessed from 'blessed';
import { Readable, Writable } from 'stream';
import { MeowTUI } from '../../src/cli/tui';
import { Agent } from '../../src/agent/agent';

export interface HeadlessTUI {
  tui: MeowTUI;
  screen: blessed.Widgets.Screen;
  output: string[];
}

/**
 * Creates a headless MEOW TUI instance for testing.
 */
export function createHeadlessTUI(agent: Agent): HeadlessTUI {
  const outputLines: string[] = [];
  
  const screen = blessed.screen({
    smartCSR: true,
    terminal: 'xterm-256color',
    fullUnicode: true,
    input: new Readable({ read() {} }),
    output: new Writable({
      write(chunk, encoding, callback) {
        outputLines.push(chunk.toString());
        callback();
      }
    }),
  });

  const tui = new MeowTUI(agent, screen);
  
  return {
    tui,
    screen,
    output: outputLines,
  };
}

/**
 * Extracts visible text from a blessed element, stripping ANSI codes.
 */
export function getElementText(element: any): string {
  if (!element || !element.content) return '';
  // Strip ANSI escape codes
  return element.content.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Simulates a command being entered in the TUI.
 */
export async function simulateCommand(tui: MeowTUI, command: string) {
  // Simulate a message via the input
  await tui.handleCommand(command);
  // Wait for any async processing
  await new Promise(resolve => setTimeout(resolve, 10));
}
