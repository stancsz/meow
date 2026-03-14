import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import { loadLongTermMemory, updateMemory } from "./memory.ts";
import {
  buildSystemPrompt,
  resolveAgentTaskKind,
  shouldAllowMemoryWrite,
  shouldEnableBootstrapProtocol,
  shouldPreferDirectResponse,
} from "./policy.ts";
import os from "node:os";

export interface HeartbeatAgentOutcome {
  status: "noop" | "invoked";
  reason: string;
}

export type AgentEvent =
  | { type: "taskStarted"; prompt: string; historyLength: number; model: string; maxIterations: number }
  | { type: "iterationStarted"; iteration: number }
  | { type: "iterationProgress"; iteration: number; message: string }
  | { type: "toolStarted"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { type: "toolCompleted"; iteration: number; toolName: string; result: string }
  | { type: "toolFailed"; iteration: number; toolName: string; error: string }
  | { type: "finalResponse"; iteration: number; content: string }
  | { type: "maxIterationsReached"; iterations: number }
  | { type: "heartbeatEvaluated"; outcome: HeartbeatAgentOutcome }
  | { type: "heartbeatNoop"; outcome: HeartbeatAgentOutcome }
  | { type: "heartbeatSkipped"; reason: string }
  | { type: "autonomousTaskCompleted"; content: string };

export interface AgentLoopResult {
  content: string;
  iterations: number;
  messages: any[];
  completed: boolean;
}

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
  source?: string;
  onIteration?: (message: string) => Promise<void> | void;
  emitEvent?: (event: AgentEvent) => Promise<void> | void;
  heartbeat?: {
    enabled: boolean;
    intervalMs?: number;
    maxIterations?: number;
    onTickStart?: () => Promise<void> | void;
    onTickSkip?: () => Promise<void> | void;
    onTickComplete?: (outcome: { status: "noop" | "invoked"; reason: string }) => Promise<void> | void;
    onTickError?: (error: Error) => Promise<void> | void;
  };
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type OpenAIClient = {
  chat: {
    completions: {
      create: (input: {
        model: string;
        messages: any[];
        tools: any;
      }) => Promise<{
        choices: Array<{
          message?: {
            content?: string | null;
            tool_calls?: any[];
          };
        }>;
      }>;
    };
  };
};

let openaiClientPromise: Promise<OpenAIClient> | undefined;

async function getOpenAIClient(): Promise<OpenAIClient> {
  if (!openaiClientPromise) {
    openaiClientPromise = import("openai").then(({ default: OpenAI }) => {
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      }) as OpenAIClient;
    });
  }

  return await openaiClientPromise;
}

function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

async function emitAgentEvent(options: AgentOptions, event: AgentEvent): Promise<void> {
  await options.emitEvent?.(event);
}

function buildToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "remember",
        description: "Store a new piece of information in long-term memory. Use this only for important facts, preferences, or project updates.",
        parameters: {
          type: "object",
          properties: { info: { type: "string", description: "The information to remember" } },
          required: ["info"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shell",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { cmd: { type: "string" } },
          required: ["cmd"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read",
        description: "Read a file from disk",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write",
        description: "Write content to a file on disk",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file" },
            content: { type: "string", description: "Content to write" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "browser",
        description: "Interact with the web browser",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["navigate", "click", "type", "snapshot", "screenshot", "wait"],
              description: "The action to perform",
            },
            url: { type: "string", description: "The URL for navigate action" },
            selector: { type: "string", description: "CSS selector for click/type action" },
            text: { type: "string", description: "Text for type action" },
          },
          required: ["action"],
        },
      },
    },
  ];
}

let dotenvConfigPromise: Promise<unknown> | undefined;

async function ensureDotenvLoaded(): Promise<void> {
  if (!dotenvConfigPromise) {
    dotenvConfigPromise = import("dotenv/config").catch(() => undefined);
  }

  await dotenvConfigPromise;
}

export async function runAgentLoop(
  userMessage: string,
  options: AgentOptions = {},
  history: ConversationMessage[] = [],
): Promise<AgentLoopResult> {
  await ensureDotenvLoaded();

  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10;
  const toolDefinitions = buildToolDefinitions();

  const skillsContext = await loadSkillsContext();
  const memoryContext = await loadLongTermMemory();
  const platform = os.platform();
  const taskKind = resolveAgentTaskKind({
    source: options.source,
    prompt: userMessage,
  });
  const preferDirectResponse = shouldPreferDirectResponse({
    source: options.source,
    prompt: userMessage,
  });
  const systemPrompt = buildSystemPrompt({
    kind: taskKind,
    platform,
    memoryContext,
    skillsContext,
  });

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...(preferDirectResponse
      ? [{ role: "system", content: "This is a simple interactive prompt. Answer directly unless tool use is clearly necessary." }]
      : []),
    ...(shouldEnableBootstrapProtocol(taskKind)
      ? [{ role: "system", content: "Bootstrap and `.agents/comm` coordination are enabled for this task when relevant." }]
      : []),
    ...history,
    { role: "user", content: userMessage },
  ];

  const activeTools = toolDefinitions.filter((tool) =>
    shouldAllowMemoryWrite(taskKind, tool.function.name),
  );

  let iterations = 0;
  let finalContent = "";

  await emitAgentEvent(options, {
    type: "taskStarted",
    prompt: userMessage,
    historyLength: history.length,
    model,
    maxIterations,
  });

  const openai = await getOpenAIClient();

  while (iterations < maxIterations) {
    iterations++;
    await emitAgentEvent(options, {
      type: "iterationStarted",
      iteration: iterations,
    });

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: activeTools as any,
    });

    const aiMessage = response.choices[0]?.message;
    if (!aiMessage) {
      break;
    }

    messages.push(aiMessage);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      await emitAgentEvent(options, {
        type: "iterationProgress",
        iteration: iterations,
        message: `Executing ${aiMessage.tool_calls.length} tool(s)`,
      });

      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);

        if (options.onIteration) {
          await options.onIteration(`🛠️ Using ${name}...`);
        }

        await emitAgentEvent(options, {
          type: "toolStarted",
          iteration: iterations,
          toolName: name,
          args: sanitizeToolArgs(args),
        });

        let result: unknown;
        try {
          if (name === "remember") {
            if (!shouldAllowMemoryWrite(taskKind, name)) {
              result = "TOOL_ERROR: remember is not allowed for this task policy";
            } else {
              result = await updateMemory(args.info);
            }
          } else {
            result = await executeNativeTool(name, args);
          }

          if (String(result).startsWith("TOOL_ERROR:")) {
            await emitAgentEvent(options, {
              type: "toolFailed",
              iteration: iterations,
              toolName: name,
              error: String(result),
            });
          } else {
            await emitAgentEvent(options, {
              type: "toolCompleted",
              iteration: iterations,
              toolName: name,
              result: stringifyToolResult(result),
            });
          }
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          result = `TOOL_ERROR: ${message}`;
          await emitAgentEvent(options, {
            type: "toolFailed",
            iteration: iterations,
            toolName: name,
            error: message,
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: stringifyToolResult(result),
        });
      }
      continue;
    }

    finalContent = aiMessage.content || "";
    await emitAgentEvent(options, {
      type: "finalResponse",
      iteration: iterations,
      content: finalContent,
    });
    break;
  }

  if (!finalContent && iterations >= maxIterations) {
    await emitAgentEvent(options, {
      type: "maxIterationsReached",
      iterations,
    });
  }

  return {
    content: finalContent,
    iterations,
    messages,
    completed: iterations < maxIterations || finalContent !== "",
  };
}
