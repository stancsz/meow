import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHeadlessTUI, getElementText, simulateCommand } from '../utils/tui-harness';
import { Agent } from '../../src/agent/agent';
import { MeowKernel } from '../../src/kernel/kernel';
import { DatabasePort } from '../../src/extensions/database/manifest';

describe('MeowTUI', () => {
  let mockDb: any;
  let mockKernel: any;
  let agent: Agent;

  beforeEach(() => {
    mockDb = {
      getMissions: vi.fn(),
      saveMission: vi.fn(),
    };
    mockKernel = {
      start: vi.fn(),
      shutdown: vi.fn(),
    };
    agent = new Agent({
      model: 'test-model',
      db: mockDb as unknown as DatabasePort,
      kernel: mockKernel as unknown as MeowKernel,
    });
  });

  it('should initialize with 4 panes by default', () => {
    const { tui } = createHeadlessTUI(agent);
    expect(tui.getSplitCount()).toBe(4);
    expect(tui.getWorkerPanes().length).toBe(4);
  });

  it('should change split count via /split command', async () => {
    const { tui } = createHeadlessTUI(agent);
    
    await tui.handleCommand('/split 1');
    expect(tui.getSplitCount()).toBe(1);
    expect(tui.getWorkerPanes().length).toBe(1);

    await tui.handleCommand('/split 2');
    expect(tui.getSplitCount()).toBe(2);
    expect(tui.getWorkerPanes().length).toBe(2);
  });

  it('should log system messages to the console', async () => {
    const { tui } = createHeadlessTUI(agent);
    const consolePane = tui.getConsole();
    
    // Simulate a message
    (tui as any).log('Test system message');
    
    const text = getElementText(consolePane);
    expect(text).toContain('Test system message');
  });

  it('should clear logs via /clear command', async () => {
    const { tui } = createHeadlessTUI(agent);
    const consolePane = tui.getConsole();
    
    (tui as any).log('Persistent message');
    expect(getElementText(consolePane)).toContain('Persistent message');
    
    await tui.handleCommand('/clear');
    expect(getElementText(consolePane)).toBe('');
  });
});
