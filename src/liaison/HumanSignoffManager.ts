// Human signoff request and approval management

import { HumanSignoff } from "../orchestrator/Task";

export interface PendingSignoff {
  taskId: string;
  deliverable: string;
  requestedAt: number;
}

export class HumanSignoffManager {
  private pending: Map<string, PendingSignoff> = new Map();
  private history: HumanSignoff[] = [];

  public async requestSignoff(
    taskId: string,
    deliverable: string,
    _taskSpec: { description: string }
  ): Promise<HumanSignoff> {
    const pendingEntry: PendingSignoff = {
      taskId,
      deliverable,
      requestedAt: Date.now(),
    };
    this.pending.set(taskId, pendingEntry);

    return {
      approved: false,
      approver: "",
      timestamp: 0,
      feedback: undefined,
    };
  }

  public approve(taskId: string, approver: string, feedback?: string): void {
    this.pending.delete(taskId);

    const signoff: HumanSignoff = {
      approved: true,
      approver,
      timestamp: Date.now(),
      feedback,
    };
    this.history.push(signoff);
  }

  public reject(taskId: string, approver: string, feedback: string): void {
    this.pending.delete(taskId);

    const signoff: HumanSignoff = {
      approved: false,
      approver,
      timestamp: Date.now(),
      feedback,
    };
    this.history.push(signoff);
  }

  public getPendingSignoffs(): PendingSignoff[] {
    return Array.from(this.pending.values());
  }

  public getSignoffHistory(): HumanSignoff[] {
    return [...this.history];
  }
}