// Priority queue with dependency tracking

import { Task, TaskStatus, TaskDependency } from './Task';

export interface QueueConfig {
  maxConcurrent: number;
  maxQueued: number;
}

export class TaskQueue {
  private pending: Task[] = [];
  private running: Map<string, Task> = new Map();
  private completed: Map<string, Task> = new Map();
  private failed: Map<string, Task> = new Map();

  private config: QueueConfig;

  constructor(config: QueueConfig = { maxConcurrent: 4, maxQueued: 100 }) {
    this.config = config;
  }

  enqueue(task: Task): void {
    if (this.pending.length + this.running.size >= this.config.maxQueued) {
      throw new Error('Task queue is full');
    }
    this.pending.push(task);
    this.sortByPriority();
  }

  dequeue(): Task | null {
    for (let i = 0; i < this.pending.length; i++) {
      const task = this.pending[i];
      if (this.areDependenciesMet(task)) {
        this.pending.splice(i, 1);
        task.status = 'running';
        task.startedAt = Date.now();
        this.running.set(task.id, task);
        return task;
      }
    }
    return null;
  }

  private areDependenciesMet(task: Task): boolean {
    for (const dep of task.dependencies) {
      // Check completed, running, AND failed maps
      const depTask = this.completed.get(dep.taskId) || this.running.get(dep.taskId) || this.failed.get(dep.taskId);
      if (!depTask) return false;
      if (dep.required && !depTask.result?.success) return false;
      // Soft dependencies (required: false) proceed regardless of success/failure
      // as long as the dependency exists (was attempted)
    }
    return true;
  }

  complete(taskId: string, result: Task['result']): void {
    const task = this.running.get(taskId);
    if (!task) return;

    this.running.delete(taskId);
    task.status = result?.success ? 'completed' : 'failed';
    task.completedAt = Date.now();
    task.result = result;

    if (result?.success) {
      this.completed.set(taskId, task);
    } else {
      this.failed.set(taskId, task);
    }
  }

  getRunningCount(): number {
    return this.running.size;
  }

  canAcceptWork(): boolean {
    return this.running.size < this.config.maxConcurrent && this.pending.length > 0;
  }

  cancel(taskId: string): boolean {
    const idx = this.pending.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      this.pending[idx].status = 'cancelled';
      this.pending.splice(idx, 1);
      return true;
    }
    return false;
  }

  private sortByPriority(): void {
    const order = { high: 0, medium: 1, low: 2 };
    this.pending.sort((a, b) => order[a.priority] - order[b.priority]);
  }

  getStatus(): { pending: Task[]; running: Task[]; completed: number; failed: number } {
    return {
      pending: this.pending,
      running: Array.from(this.running.values()),
      completed: this.completed.size,
      failed: this.failed.size,
    };
  }

  getTask(taskId: string): Task | undefined {
    return this.running.get(taskId) || this.completed.get(taskId) || this.failed.get(taskId) || this.pending.find(t => t.id === taskId);
  }
}