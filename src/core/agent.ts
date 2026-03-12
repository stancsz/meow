import OpenAI from "openai";
import { loadSkillsContext } from "./skills.ts";
import { executeNativeTool } from "./executor.ts";
import "dotenv/config";
import { loadLongTermMemory, updateMemory } from "./memory.ts";

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
  const maxIterations = options.maxIterations || 15;
  
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
    // ... rest of tools
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

  const messages: any[] = [
    { 
      role: "system", 
      content: `You are SimpleClaw, an advanced autonomous agent with a long-term memory. 
      
      **Operating Instructions:**
      1. **Thinking & Reasoning**: Before taking any action, state your reasoning.
      2. **Memory Usage**: You have access to your long-term memory. Use it to provide context-aware responses. If you learn something important about the user or project, use the 'remember' tool.
      3. **Browser Skills**: Use the browser tool to search and find information. Always navigate first, then snapshot to see the page, then interact.
      4. **Multi-Step Tasks**: If a task requires multiple steps, use as many tool calls as needed.
      5. **Final Output**: Your final response should be detailed, professional, and include URLs for reference. Do not be sloppy.
      
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
      console.log(`🛠️ [CORE AGENT] Iteration ${iterations}: Executing ${aiMessage.tool_calls.length} tools...`);
      
      for (const toolCall of aiMessage.tool_calls as any[]) {
        const { name, arguments: argsString } = toolCall.function;
        const args = JSON.parse(argsString);
        
        if (options.onIteration) {
          await options.onIteration(`🛠️ Executing ${name}...`);
        }

        let result;
        if (name === "remember") {
          result = await updateMemory(args.info);
        } else {
          result = await executeNativeTool(name, args);
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
    completed: iterations < maxIterations
  };
}
