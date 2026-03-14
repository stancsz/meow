import { randomUUID } from "node:crypto";
import {
  runAgentLoop,
  type AgentEvent,
  type AgentLoopResult,
  type AgentOptions,
  type ConversationMessage,
} from "./agent.ts";

export interface AgentDispatchSubmitInput {
  source: string;
  prompt: string;
  scope: string;
  history?: ConversationMessage[];
  model?: string;
  maxIterations?: number;
  metadata?: Record<string, unknown>;
  onEvent?: (event: RuntimeDispatchEvent) => Promise<void> | void;
  dedupeKey?: string;
}

export interface DispatchTaskHandle {
  id: string;
  source: string;
  scope: string;
  prompt: string;
  startedAt: number;
  promise: Promise<AgentLoopResult>;
}

export type RuntimeDispatchEvent =
  | { type: "taskQueued"; taskId: string; source: string; scope: string; prompt: string }
  | { type: "taskStarted"; taskId: string; source: string; scope: string; prompt: string }
  | { type: "taskCompleted"; taskId: string; source: string; scope: string; result: AgentLoopResult }
  | { type: "taskFailed"; taskId: string; source: string; scope: string; error: Error }
  | { type: "taskDeduped"; taskId: string; source: string; scope: string; dedupeKey: string }
  | ({ taskId: string; source: string; scope: string } & AgentEvent);

export interface AgentDispatcher {
  submit: (input: AgentDispatchSubmitInput) => Promise<AgentLoopResult>;
  getInFlightTasks: () => DispatchTaskHandle[];
  hasConflictingTask: (scope: string, dedupeKey?: string) => boolean;
}

interface ScopeQueueState {
  tail: Promise<unknown>;
}

export function createAgentDispatcher(): AgentDispatcher {
  const scopeQueues = new Map<string, ScopeQueueState>();
  const inFlightTasks = new Map<string, DispatchTaskHandle>();
  const activeDedupeKeys = new Set<string>();

  const emit = async (
    input: AgentDispatchSubmitInput,
    event: RuntimeDispatchEvent,
  ): Promise<void> => {
    await input.onEvent?.(event);
  };

  const hasConflictingTask = (scope: string, dedupeKey?: string) => {
    if (dedupeKey && activeDedupeKeys.has(`${scope}:${dedupeKey}`)) {
      return true;
    }

    return Array.from(inFlightTasks.values()).some((task) => task.scope === scope);
  };

  return {
    submit: async (input) => {
      const taskId = randomUUID();
      const dedupeToken = input.dedupeKey ? `${input.scope}:${input.dedupeKey}` : undefined;

      if (dedupeToken && activeDedupeKeys.has(dedupeToken)) {
        await emit(input, {
          type: "taskDeduped",
          taskId,
          source: input.source,
          scope: input.scope,
          dedupeKey: input.dedupeKey!,
        });
        return {
          content: "",
          iterations: 0,
          messages: input.history ?? [],
          completed: true,
        };
      }

      if (dedupeToken) {
        activeDedupeKeys.add(dedupeToken);
      }

      await emit(input, {
        type: "taskQueued",
        taskId,
        source: input.source,
        scope: input.scope,
        prompt: input.prompt,
      });

      const scopeState = scopeQueues.get(input.scope) ?? { tail: Promise.resolve() };
      scopeQueues.set(input.scope, scopeState);

      const run = async (): Promise<AgentLoopResult> => {
        await emit(input, {
          type: "taskStarted",
          taskId,
          source: input.source,
          scope: input.scope,
          prompt: input.prompt,
        });

        const agentOptions: AgentOptions = {
          model: input.model,
          maxIterations: input.maxIterations,
          emitEvent: async (event) => {
            await emit(input, {
              ...event,
              taskId,
              source: input.source,
              scope: input.scope,
            });
          },
          onIteration: async (message) => {
            await emit(input, {
              type: "iterationProgress",
              iteration: 0,
              message,
              taskId,
              source: input.source,
              scope: input.scope,
            });
          },
        };

        const promise = runAgentLoop(input.prompt, agentOptions, input.history ?? []);
        const handle: DispatchTaskHandle = {
          id: taskId,
          source: input.source,
          scope: input.scope,
          prompt: input.prompt,
          startedAt: Date.now(),
          promise,
        };
        inFlightTasks.set(taskId, handle);

        try {
          const result = await promise;
          await emit(input, {
            type: "taskCompleted",
            taskId,
            source: input.source,
            scope: input.scope,
            result,
          });
          return result;
        } catch (error: any) {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          await emit(input, {
            type: "taskFailed",
            taskId,
            source: input.source,
            scope: input.scope,
            error: normalizedError,
          });
          throw normalizedError;
        } finally {
          inFlightTasks.delete(taskId);
          if (dedupeToken) {
            activeDedupeKeys.delete(dedupeToken);
          }
        }
      };

      const scheduled = scopeState.tail.then(run, run);
      scopeState.tail = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    },
    getInFlightTasks: () => Array.from(inFlightTasks.values()),
    hasConflictingTask,
  };
}
