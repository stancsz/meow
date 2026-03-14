import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
import { loadLongTermMemory, updateMemory } from "./memory.ts";
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

async function emitAgentEvent(
  options: AgentOptions,
  event: AgentEvent,
): Promise<void> {
  await options.emitEvent?.(event);
}

function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

// Initialize OpenAI with configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
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

export async function runAgentLoop(
  userMessage: string,
  options: AgentOptions = {},
  history: ConversationMessage[] = [],
): Promise<AgentLoopResult> {
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10;

  const tools = [
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
            content: { type: "string", description: "Content to write" }
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
              description: "The action to perform" 
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

  const skillsContext = await loadSkillsContext();
  const memoryContext = await loadLongTermMemory();
  const platform = os.platform();

  const messages: any[] = [
    { 
      role: "system", 
      content: `You are SimpleClaw, an autonomous versatile agent.
      
      **Current Platform**: ${platform}
      
      **Operational Protocol**:
      1. **Self-Initialize**: If \`.agents/comm/OUTBOX.md\` or \`.agents/comm/INBOX.md\` do not exist, create them immediately to establish your operational channel.
      2. **Check Context**: Read \`.agents/comm/OUTBOX.md\` for pending instructions and \`.agents/comm/INBOX.md\` for recent status/learnings before acting.
      3. **Bias for Action**: If a task is assigned in OUTBOX, START. If no task is found, monitor for updates or check logs.
      4. **Report Back**: Document progress, results, or new patterns in \`.agents/comm/INBOX.md\`. 
      5. **Shared Knowledge**: If you implement a fix or hit a blocker, update \`🧠 System Learnings\` in \`.agents/comm/INBOX.md\`.
      5. **Assume & Execute**: Make reasonable assumptions for missing details.
      6. **Tool First for Data**: If a task involves real-world data, use the 'browser' tool immediately.
      7. **Extreme Autonomy**: You have 'read', 'write', and 'shell' tools. If built-in tools fail, write custom scripts to disk and execute them. Never say "I can't fix it".
      8. **Conciseness**: Keep conversational output minimal.
      9. **Tool Restraint**: For simple conversational prompts that do not require filesystem, shell, browser, or memory changes, respond directly without using tools.
      10. **One-Time Bootstrap**: Do not repeatedly check or recreate \`.agents/comm\` files unless the user explicitly asks or a task depends on them.

      ${memoryContext}
      ${skillsContext}`
    },
    ...history,
    { role: "user", content: userMessage }
  ];

  let iterations = 0;
  let finalContent = "";

  await emitAgentEvent(options, {
    type: "taskStarted",
    prompt: userMessage,
    historyLength: history.length,
    model,
    maxIterations,
  });

  while (iterations < maxIterations) {
    iterations++;
    await emitAgentEvent(options, {
      type: "iterationStarted",
      iteration: iterations,
    });

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: tools as any,
    });

    const aiMessage = response.choices[0]?.message;
    if (!aiMessage) break;

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
            result = await updateMemory(args.info);
          } else {
            result = await executeNativeTool(name, args);
          }
          await emitAgentEvent(options, {
            type: "toolCompleted",
            iteration: iterations,
            toolName: name,
            result: stringifyToolResult(result),
          });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
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
    } else {
      finalContent = aiMessage.content || "";
      await emitAgentEvent(options, {
        type: "finalResponse",
        iteration: iterations,
        content: finalContent,
      });
      break;
    }
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
