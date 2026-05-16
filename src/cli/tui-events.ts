import { EventEmitter } from 'events';
import { StatusUpdate } from '../orchestrator/Orchestrator';

/**
 * Unified event types emitted by the TUI for status display.
 */
export type TUIMessageType =
  | 'user_input'
  | 'l1_stream'
  | 'l2_stream'
  | 'l3_stream'
  | 'l4_stream'
  | 'info'
  | 'step'
  | 'done'
  | 'error'
  | 'warn'
  | 'task_start'
  | 'task_update'
  | 'task_done'
  | 'task_fail'
  | 'decomposition'
  | 'aborted'
  | 'mode_change'
  | 'system';

export interface TUIMessage {
  type: TUIMessageType;
  text: string;
  taskId?: string;
  timestamp: number;
}

export interface TUITaskNode {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  children: TUITaskNode[];
  expanded?: boolean;
}

export interface TUIStatusBar {
  mode: string;
  tokens: number;
  elapsed: string;
  tasksDone: number;
  tasksTotal: number;
  running: boolean;
}

/**
 * Central TUI event bus.
 * Orchestrator, Liaison, and Agent emit events here;
 * the MeowTUI instance subscribes and renders them.
 */
export class TUIEventBus extends EventEmitter {
  private static _instance: TUIEventBus;

  static get instance(): TUIEventBus {
    if (!TUIEventBus._instance) TUIEventBus._instance = new TUIEventBus();
    return TUIEventBus._instance;
  }

  emitMessage(type: TUIMessageType, text: string, taskId?: string) {
    this.emit('message', { type, text, taskId, timestamp: Date.now() } satisfies TUIMessage);
  }

  emitTaskStart(id: string, label: string) {
    this.emit('task_start', { id, label });
  }

  emitTaskUpdate(id: string, status: TUITaskNode['status'], label?: string) {
    this.emit('task_update', { id, status, label });
  }

  emitAbort() {
    this.emit('abort');
  }

  emitModeChange(mode: string) {
    this.emit('mode_change', mode);
  }

  fromStatusUpdate(update: StatusUpdate) {
    if (update.level === 'error') {
      this.emitMessage('error', update.message, update.taskId);
    } else if (update.level === 'warning') {
      this.emitMessage('warn', update.message, update.taskId);
    } else if (update.level === 'success') {
      this.emitMessage('done', update.message, update.taskId);
    } else if (update.progress) {
      this.emitMessage('step', `${update.progress.label}: ${update.progress.current}/${update.progress.total}`, update.taskId);
    } else {
      this.emitMessage('info', update.message, update.taskId);
    }
  }
}

export const tuiEvents = TUIEventBus.instance;