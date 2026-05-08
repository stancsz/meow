import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHeadlessTUI, getElementText } from '../utils/tui-harness';
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

  it('should initialize with a log pane', () => {
    const { tui } = createHeadlessTUI(agent);
    expect(tui.getLogPane()).toBeDefined();
  });

  it('should log system messages to the log pane', async () => {
    const { tui } = createHeadlessTUI(agent);
    const logPane = tui.getLogPane();

    (tui as any).log('Test system message');

    const text = getElementText(logPane);
    expect(text).toContain('Test system message');
  });

  it('should clear logs via /clear command', async () => {
    const { tui } = createHeadlessTUI(agent);
    const logPane = tui.getLogPane();

    (tui as any).log('Persistent message');
    expect(getElementText(logPane)).toContain('Persistent message');

    await tui.handleCommand('/clear');
    expect(getElementText(logPane)).toBe('');
  });

  it('should handle /help command', async () => {
    const { tui } = createHeadlessTUI(agent);
    const logPane = tui.getLogPane();

    await tui.handleCommand('/help');
    const text = getElementText(logPane);
    expect(text).toContain('Commands');
    expect(text).toContain('/exit');
  });
});
