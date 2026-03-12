import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
import { loadLongTermMemory, updateMemory } from "./memory.ts";
import os from "node:os";

// Initialize OpenAI with configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

export interface AgentOptions {
  model?: string;
  maxIterations?: number;
  onIteration?: (message: string) => Promise<void> | void;
}

export async function runAgentLoop(userMessage: string, options: AgentOptions = {}) {
  const model = options.model || process.env.AGENT_MODEL || "gpt-5-nano";
  const maxIterations = options.maxIterations || 10; // Lower default for responsiveness
  
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
      
      **Tool Usage Policy**:
      1. **Optionality**: You have access to tools, but you are NOT required to use them. Use a tool ONLY if you decide it is necessary to fulfill the user's request (e.g., searching for real-time data, reading a local file, or executing a command).
      2. **Direct First**: If you can answer the user's question or complete their request using your baseline knowledge, do so directly. 
      3. **Discretion**: You decide when a tool is helpful. Do not force tool usage for simple conversational turns, greetings, or common knowledge.
      4. **Efficiency**: Aim for the most direct and helpful path. One good direct answer is better than a multi-step tool loop that leads to the same place.
      
      ${memoryContext}
      ${skillsContext}` 
    },
    { role: "user", content: userMessage }
  ];

  let iterations = 0;
  let finalContent = "";

  while (iterations < maxIterations) {
    iterations++;
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools as any,
    });

    const aiMessage = response.choices[0]?.message;
    if (!aiMessage) break;

    messages.push(aiMessage);

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      console.log(`🛠️ Iteration ${iterations}: Executing ${aiMessage.tool_calls.length} tools...`);
      
      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);
        
        if (options.onIteration) {
          await options.onIteration(`🛠️ Using ${name}...`);
        }

        let result;
        try {
          if (name === "remember") {
            result = await updateMemory(args.info);
          } else {
            result = await executeNativeTool(name, args);
          }
        } catch (err: any) {
          result = `TOOL_ERROR: ${err.message}`;
        }
        
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    } else {
      finalContent = aiMessage.content || "";
      break;
    }
  }

  return {
    content: finalContent,
    iterations: iterations,
    messages: messages,
    completed: iterations < maxIterations || finalContent !== ""
  };
}
