// Worker pool execution engine

import { Task, TaskResult, TaskEvents } from './Task';
import { TaskQueue } from './TaskQueue';
import { FileCoordinator } from './FileCoordinator';
import { Agent, AgentConfig } from '../agent/agent';
import { McpManager } from '../agent/mcp';
import { SkillManager } from '../agent/skills';
import { DEFAULT_TOOLS } from '../types/tool';
import { MeowKernel } from '../kernel/kernel';
import { DatabasePort } from '../extensions/database/manifest';

export interface WorkerConfig {
  workerId: string;
  agentConfig: AgentConfig;
  mcpManager?: McpManager;
  skillManager?: SkillManager;
  kernel: MeowKernel;
  db: DatabasePort;
}

export interface ExecutorConfig {
  maxWorkers: number;
  taskTimeoutMs: number;
  enableParallelTools: boolean;
}

export class ParallelExecutor {
  private queue: TaskQueue;
  private coordinator: FileCoordinator;
  private workers: Map<string, WorkerConfig> = new Map();
  private executorConfig: ExecutorConfig;
  private taskEvents?: TaskEvents;
  private runningTasks: Map<string, { task: Task; workerId: string; timeout: NodeJS.Timeout }> = new Map();
  private taskChildProcesses: Map<string, any[]> = new Map();
  private activeTaskCount: number = 0;
  private runResolve?: (value: Map<string, TaskResult>) => void;
  private runResults?: Map<string, TaskResult>;
  private backoffCounts: Map<string, number> = new Map();

  constructor(
    queue: TaskQueue,
    coordinator: FileCoordinator,
    executorConfig: ExecutorConfig,
    taskEvents?: TaskEvents
  ) {
    this.queue = queue;
    this.coordinator = coordinator;
    this.executorConfig = executorConfig;
    this.taskEvents = taskEvents;
  }

  registerWorker(worker: WorkerConfig): void {
    this.workers.set(worker.workerId, worker);
  }

  async run(): Promise<Map<string, TaskResult>> {
    return new Promise((resolve) => {
      this.runResolve = resolve;
      this.runResults = new Map<string, TaskResult>();
      this.activeTaskCount = 0;

      const checkDone = () => {
        if (this.activeTaskCount > 0) return;
        if (this.queue.canAcceptWork()) return;
        this.runResolve?.(this.runResults!);
      };

      const startTask = (task: Task, worker: WorkerConfig) => {
        this.backoffCounts.delete(task.id);
        this.activeTaskCount++;
        const timeout = setTimeout(() => {
          this.handleTaskTimeout(task.id);
        }, task.timeoutMs || this.executorConfig.taskTimeoutMs);

        this.runningTasks.set(task.id, { task, workerId: worker.workerId, timeout });
        this.taskEvents?.onStatusChange?.(task.id, 'running');

        this.executeTask(task, worker).then((result: TaskResult) => {
          if (!this.runningTasks.has(task.id)) return; // Already timed out
          
          this.runResults?.set(task.id, result);
          clearTimeout(timeout);
          this.runningTasks.delete(task.id);
          this.taskEvents?.onStatusChange?.(task.id, result.success ? 'completed' : 'failed');
          this.taskEvents?.onResult?.(task.id, result);
          this.activeTaskCount--;
          dispatch();
          checkDone();
        }).catch((error: any) => {
          if (!this.runningTasks.has(task.id)) return; // Already timed out

          const failedResult: TaskResult = {
            taskId: task.id,
            success: false,
            error: error.message || String(error),
          };
          this.runResults?.set(task.id, failedResult);
          clearTimeout(timeout);
          this.runningTasks.delete(task.id);
          this.taskEvents?.onStatusChange?.(task.id, 'failed');
          this.taskEvents?.onResult?.(task.id, failedResult);
          this.activeTaskCount--;
          dispatch();
          checkDone();
        });
      };

      const dispatch = () => {
        // Track if we're making progress to prevent spin loops
        let noWorkerAvailableCount = 0;

        while (this.queue.canAcceptWork()) {
          const task = this.queue.dequeue();
          if (!task) break;

          // Convert required/produced files to FileArtifact format for lock checking
          const taskArtifacts: any[] = [];
          if (task.requiredFiles) {
            for (const path of task.requiredFiles) {
              taskArtifacts.push({ path, operation: 'update' });
            }
          }
          if (task.producedFiles) {
            for (const artifact of task.producedFiles) {
              taskArtifacts.push(artifact);
            }
          }

          // Check if there's any conflicting active lock
          const conflicts = this.coordinator.wouldConflict(task.id, taskArtifacts);
          if (conflicts.length > 0) {
            // Trigger conflict event
            this.taskEvents?.onFileConflict?.(task.id, conflicts);

            const currentBackoff = this.backoffCounts.get(task.id) || 0;
            const delay = Math.min(50 * Math.pow(2, currentBackoff), 1000);
            this.backoffCounts.set(task.id, currentBackoff + 1);

            // Re-enqueue the task to let others proceed
            task.status = 'pending';
            (this.queue as any).running.delete(task.id);
            this.queue.enqueue(task);

            // Schedule a dispatch check after the backoff delay
            setTimeout(() => {
              dispatch();
            }, delay);

            break;
          }

          const worker = this.selectWorker(task);
          if (!worker) {
            // No worker can accept this task - re-enqueue and stop this dispatch round
            task.status = 'pending';
            (this.queue as any).running.delete(task.id);
            this.queue.enqueue(task);
            noWorkerAvailableCount++;
            // If multiple tasks in a row can't find workers, stop dispatching
            // to avoid spinning when all workers are at capacity
            if (noWorkerAvailableCount >= 2) break;
            continue;
          }

          noWorkerAvailableCount = 0; // Reset on successful dispatch

          // Check file access before starting (requeue with backoff if denied)
          const access = this.coordinator.requestAccess(task.id, taskArtifacts);
          if (!access.allowed) {
            this.taskEvents?.onFileConflict?.(task.id, access.conflicts);

            const currentBackoff = this.backoffCounts.get(task.id) || 0;
            const delay = Math.min(50 * Math.pow(2, currentBackoff), 1000);
            this.backoffCounts.set(task.id, currentBackoff + 1);

            // Re-enqueue the task to let others proceed
            task.status = 'pending';
            (this.queue as any).running.delete(task.id);
            this.queue.enqueue(task);

            // Schedule a dispatch check after the backoff delay
            setTimeout(() => {
              dispatch();
            }, delay);

            break;
          }

          startTask(task, worker);

          // If we just started a task, there may be more work to do
          // But don't hog the event loop - let other async operations proceed
          if (this.activeTaskCount >= this.executorConfig.maxWorkers) {
            break;
          }
        }
      };

      dispatch();
      checkDone();
    });
  }

  private checkDone(): void {
    if (this.activeTaskCount > 0) return;
    if (this.queue.canAcceptWork()) return;
    this.runResolve?.(this.runResults!);
  }

  private async executeTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    try {
      let result: TaskResult;

      if (task.toolName) {
        result = await this.executeToolTask(task, worker);
      } else {
        result = await this.executeAgentTask(task, worker);
      }

      if (task.validationContract) {
        const validation = await this.runValidationContract(task);
        result.passes = validation.passes;
        task.passes = validation.passes;
        if (!validation.passes) {
          result.success = false;
          result.error = (result.error ? result.error + '\n' : '') + `Validation contract failed:\n${validation.output}`;
        } else {
          result.output = (result.output ? result.output + '\n' : '') + `Validation contract passed:\n${validation.output}`;
        }
      }

      this.coordinator.release(task.id);
      this.queue.complete(task.id, result);
      return result;

    } catch (error: any) {
      const failedResult: TaskResult = {
        taskId: task.id,
        success: false,
        error: error.message || String(error),
      };

      this.coordinator.release(task.id);
      this.queue.complete(task.id, failedResult);
      return failedResult;
    } finally {
      this.taskChildProcesses.delete(task.id);
    }
  }

  private isCommandUnsafe(cmd: string): boolean {
    const unsafePatterns = [
      /\brm\s+-(?:r[fd]|d?rf)\b/i,
      /\bdel\b.*\b\/(?:f|q|s)\b/i,
      /\brd\b.*\b\/s\b/i,
      /\brmdir\b.*\b\/s\b/i,
      /\bformat\b\s+[a-z]:/i,
      /\b>:?\s*\/dev\/(?:null|sd[a-z]|hd[a-z]|console|zero)/i,
      /\bmkfs\b/i,
      /\bdd\b.*\bof=/i
    ];
    return unsafePatterns.some(pattern => pattern.test(cmd));
  }

  private async runValidationContract(task: Task): Promise<{ passes: boolean; output: string }> {
    const contract = task.validationContract;
    if (!contract) return { passes: true, output: 'No validation contract defined.' };

    if (contract.validationScript && this.isCommandUnsafe(contract.validationScript)) {
      console.error(`🚨 [Sandbox Gate] Unsafe command rejected: "${contract.validationScript}"`);
      return { passes: false, output: `[Sandbox Gate Fail]: Validation script "${contract.validationScript}" was blocked as unsafe.` };
    }

    let passes = true;
    let output = '';

    const { exec } = await import('child_process');

    const runCmd = (cmd: string): Promise<{ success: boolean; stdout: string; stderr: string }> => {
      return new Promise((resolve) => {
        const child = exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
          resolve({
            success: !error,
            stdout,
            stderr
          });
        });
        if (!this.taskChildProcesses.has(task.id)) {
          this.taskChildProcesses.set(task.id, []);
        }
        this.taskChildProcesses.get(task.id)!.push(child);
      });
    };

    if (contract.validationScript) {
      console.log(`🧪 [Validation] Running custom validation script: ${contract.validationScript}`);
      const res = await runCmd(contract.validationScript);
      output += `[Script stdout]:\n${res.stdout}\n[Script stderr]:\n${res.stderr}\n`;
      if (!res.success) {
        passes = false;
      }
    }

    if (contract.testSuite) {
      console.log(`🧪 [Validation] Running test suite: ${contract.testSuite}`);
      const res = await runCmd(`npx vitest run ${contract.testSuite}`);
      output += `[Test suite stdout]:\n${res.stdout}\n[Test suite stderr]:\n${res.stderr}\n`;
      if (!res.success) {
        passes = false;
      }
    }

    if (contract.expectedOutputs) {
      console.log(`🧪 [Validation] Asserting expected outputs...`);
      for (const expected of contract.expectedOutputs) {
        if (!output.includes(expected)) {
          passes = false;
          output += `[Assertion Fail]: Expected string "${expected}" was not found in outputs.\n`;
        }
      }
    }

    return { passes, output };
  }

  private async executeAgentTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    const agent = new Agent({
      ...worker.agentConfig,
      ...task.agentConfig,
      kernel: worker.kernel,
      db: worker.db
    });

    if (worker.skillManager) {
      agent.skillManager = worker.skillManager;
    }
    if (worker.mcpManager) {
      agent.mcpManager = worker.mcpManager;
    }

    if (task.requiredFiles) {
      task.requiredFiles.forEach(f => agent.addFile(f));
    }

    let chatInput = task.description;
    if (task.feedbackHistory && task.feedbackHistory.length > 0) {
      const latestFeedback = task.feedbackHistory[task.feedbackHistory.length - 1];
      chatInput += `\n\n--- ⚠️ SELF-CORRECTION PROTOCOL (Iteration ${latestFeedback.iteration + 1}) ---
Your previous attempt failed our automated Quality Gates (Quality Score: ${latestFeedback.qualityScore}%).

Please carefully review the following errors and critiques from your last execution, refactor the affected files, and resolve all issues:

### Failed Quality Gates
${latestFeedback.failedGates.map(g => `- ${g}`).join('\n')}

### Compiler, Linter, & Runtime Issues
${latestFeedback.issues.map(i => `- ${i}`).join('\n')}

${latestFeedback.testFailures && latestFeedback.testFailures.length > 0 ? `
### Automated Test Failures
\`\`\`text
${latestFeedback.testFailures.join('\n')}
\`\`\`
` : ''}

### Strategy to Fix
1. Read the affected files to see your previous edits.
2. Analyze the specific errors listed above.
3. Surgical fix: rewrite ONLY what is necessary to pass the tests/gates. Do not add speculative code or stubs.
4. Verify your solution using the 'run' or 'test' tools.`;
    }

    const output = await agent.chat(
      chatInput,
      false,
      undefined,
      (status) => this.taskEvents?.onProgress?.(task.id, status)
    );

    const artifacts = agent.getEditedFiles().map(path => ({
      path,
      operation: 'update' as const,
    }));

    return {
      taskId: task.id,
      success: true,
      output,
      artifacts,
    };
  }

  private async executeToolTask(task: Task, worker: WorkerConfig): Promise<TaskResult> {
    const tool = DEFAULT_TOOLS.find(t => t.name === task.toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${task.toolName}`);
    }

    const output = await tool.execute(task.toolArgs || '', undefined);

    return {
      taskId: task.id,
      success: true,
      output,
    };
  }

  private selectWorker(task: Task): WorkerConfig | null {
    const available = Array.from(this.workers.values());
    if (available.length === 0) return null;

    let eligible = available;
    if (task.assignedWorker) {
      const matched = available.filter(w => w.workerId === task.assignedWorker);
      if (matched.length > 0) {
        eligible = matched;
      }
    }

    const workerLoads = eligible.map(w => {
      let count = 0;
      for (const exec of this.runningTasks.values()) {
        if (exec.workerId === w.workerId) count++;
      }
      return { worker: w, load: count };
    });

    workerLoads.sort((a, b) => a.load - b.load);
    return workerLoads[0].load < this.executorConfig.maxWorkers ? workerLoads[0].worker : null;
  }

  private handleTaskTimeout(taskId: string): void {
    const execution = this.runningTasks.get(taskId);
    if (!execution) return;

    this.coordinator.release(taskId);

    const timeoutResult: TaskResult = {
      taskId,
      success: false,
      error: `Task timed out after ${execution.task.timeoutMs || this.executorConfig.taskTimeoutMs}ms`,
    };

    this.runResults?.set(taskId, timeoutResult);
    this.queue.complete(taskId, timeoutResult);
    this.taskEvents?.onStatusChange?.(taskId, 'failed');
    this.taskEvents?.onResult?.(taskId, timeoutResult);
    this.runningTasks.delete(taskId);
    this.activeTaskCount--;
    
    // Notify the worker to abort if possible
    this.abortTask(taskId);

    // Check if we can dispatch more or if we are done
    this.checkDone();
  }

  private abortTask(taskId: string): void {
    const children = this.taskChildProcesses.get(taskId);
    if (children && children.length > 0) {
      console.log(`[ParallelExecutor] Aborting task ${taskId} - terminating ${children.length} spawned child processes recursively.`);
      const { execSync } = require('child_process');
      for (const child of children) {
        if (child.pid) {
          try {
            if (process.platform === 'win32') {
              execSync(`taskkill /pid ${child.pid} /f /t`, { stdio: 'ignore' });
            } else {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch (err) {
            try {
              child.kill('SIGKILL');
            } catch {}
          }
        }
      }
      this.taskChildProcesses.delete(taskId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeToolsParallel(
    tools: Array<{ name: string; args: string }>
  ): Promise<Array<{ name: string; result: string; error?: string }>> {
    const results = await Promise.allSettled(
      tools.map(async ({ name, args }) => {
        const tool = DEFAULT_TOOLS.find(t => t.name === name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        return { name, result: await tool.execute(args, undefined) };
      })
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { name: tools[i].name, result: r.value.result };
      }
      return { name: tools[i].name, result: '', error: String(r.reason) };
    });
  }
}