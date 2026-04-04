/**
 * CLI entry point for Meow
 *
 * Usage:
 *   bun run start                    # Interactive mode
 *   bun run start "your prompt"     # Single task mode
 *   bun run start --dangerous "cmd"  # Single task with shell auto-approve
 *   bun run start --resume           # Resume last session
 *   bun run start --auto "task"     # Autonomous mode (OODA loop)
 *   bun run start --tick "task"     # Continuous mode with tick heartbeats
 */
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runLeanAgent, runLeanAgentSimpleStream, type LeanAgentOptions } from "../src/core/lean-agent.ts";
import { registerSignalHandlers, getInterruptController } from "../src/sidecars/auto-mode.ts";
import { runAutoLoop, formatAutoLoopSummary, formatTickStatus } from "../src/sidecars/auto-loop.ts";
import { initializeToolRegistry, getAllTools } from "../src/sidecars/tool-registry.ts";
import { listTasks, addTask, completeTask, formatTasks } from "../src/core/task-store.ts";
import { createSession, appendToSession, loadSession, listSessions, formatSessions, getLastSessionId, compactSession } from "../src/core/session-store.ts";
import { skills, getAllSkills, findSkill, formatSkillsList } from "../src/skills/index.ts";
import { initI18n, t } from "../src/sidecars/i18n/index.ts";
import { setMCPToolRegistrar, loadMCPConfig } from "../src/sidecars/mcp-client.ts";

// Initialize i18n
initI18n();

// Load .env file if present
function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join("=").trim();
        }
      }
    }
  }
}
loadEnv();

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const prefix = `${colors.cyan}${colors.bold}${t("prompt")}${colors.reset}`;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ============================================================================
// AbortController for interrupting
// ============================================================================

let abortController: AbortController | null = null;
let isThinking = false;
let isStreaming = false;  // Toggle for streaming mode

function interrupt(): void {
  if (abortController) {
    abortController.abort();
    console.log(`\n${colors.yellow}${t("interrupted")}${colors.reset}`);
  }
}

// ============================================================================
// CLI Helpers
// ============================================================================

function setCursorVisible(visible: boolean): void {
  process.stdout.write(visible ? "\x1B[?25h" : "\x1B[?25l");
}

function eraseLine(): void {
  process.stdout.write("\x1B[2K");
}

function formatUsage(usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } | undefined): string {
  if (!usage || usage.totalTokens === 0) return "";
  const cost = usage.estimatedCost < 1 ? `$${usage.estimatedCost.toFixed(3)}` : `$${usage.estimatedCost.toFixed(2)}`;
  return `${colors.dim}[${usage.totalTokens} tokens · ~${cost}]${colors.reset}`;
}

async function withSpinner<T>(
  promise: Promise<T>,
  message: string = "thinking...",
  onAbort?: () => void
): Promise<T> {
  let frame = 0;
  let interrupted = false;

  const spin = async () => {
    while (!interrupted && isThinking) {
      process.stdout.write(`${colors.dim}${spinnerFrames[frame % spinnerFrames.length]} ${t("thinking")}${colors.reset}\r`);
      frame++;
      await new Promise((r) => setTimeout(r, 80));
    }
    if (!interrupted) {
      eraseLine();
    }
  };

  abortController = new AbortController();
  isThinking = true;
  const spinPromise = spin();

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        abortController!.signal.addEventListener("abort", () => {
          reject(new Error("INTERRUPTED"));
        })
      ),
    ]);
    interrupted = true;
    isThinking = false;
    await spinPromise;
    return result;
  } catch (e: any) {
    interrupted = true;
    isThinking = false;
    await spinPromise;
    if (e.message === "INTERRUPTED") {
      onAbort?.();
      throw new Error("Interrupted");
    }
    throw e;
  } finally {
    abortController = null;
  }
}

// ============================================================================
// Session Management
// ============================================================================

let currentSessionId: string | null = null;
let currentSessionMessages: { role: string; content: string; timestamp: string }[] = [];

function saveSession(): void {
  if (currentSessionId && currentSessionMessages.length > 0) {
    appendToSession(currentSessionId, currentSessionMessages);
  }
}

// ============================================================================
// Session Compaction (LLM-powered context management)
// ============================================================================

const MAX_SESSION_TOKENS = 60000; // Compact when session exceeds this

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function checkAndCompact(): Promise<void> {
  if (!currentSessionId) return;

  let totalTokens = 0;
  for (const msg of currentSessionMessages) {
    totalTokens += estimateTokens(msg.content) + 10;
  }

  if (totalTokens < MAX_SESSION_TOKENS) return;

  console.log(`\n${colors.dim}📦 ${t("compacting")}${colors.reset}`);

  try {
    const result = await compactSession(currentSessionId, {
      maxTokens: MAX_SESSION_TOKENS,
      summarizeFn: async (oldMessages) => {
        // Build a summary prompt for the LLM
        const conversationText = oldMessages
          .filter((m) => m.role !== "system")
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        // Use the agent to summarize
        const summaryResult = await runLeanAgent(
          `Summarize this conversation concisely, preserving key facts, decisions, and context:\n\n${conversationText.slice(0, 8000)}`,
          { maxIterations: 1 }
        );

        return summaryResult.content;
      },
    });

    if (result.summary) {
      console.log(`${colors.green}✓ ${t("compacted", { old: result.originalCount, new: result.compactedCount })}${colors.reset}`);

      // Update local session messages with the compacted version
      currentSessionMessages = result.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      // Rebuild conversation array from compacted session
      conversation.length = 0;
      const systemPrompt = buildSystemPrompt();
      conversation.push({ role: "system", content: systemPrompt });
      for (const msg of currentSessionMessages) {
        if (msg.role !== "system" || !msg.content.includes("[Previous conversation summarized]")) {
          conversation.push({ role: msg.role as "system" | "user" | "assistant", content: msg.content });
        }
      }
    }
  } catch (e: any) {
    console.log(`${colors.yellow}⚠️ Session compaction failed: ${e.message}${colors.reset}`);
  }
}

// ============================================================================
// Message History (Conversation Context)
// ============================================================================

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const conversation: Message[] = [];

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(): string {
  return `You are Meow, a lean sovereign agent.

You have access to tools:
- read(path) → read file contents
- write(path, content) → write content to a file
- shell(cmd) → execute shell command (requires --dangerous flag)
- git(cmd) → execute git command
- glob(pattern) → find files by name pattern
- grep(pattern, path?) → search file contents

When using tools:
1. Parse the user's intent
2. Use minimal necessary tools
3. Prefer safe, read operations when possible
4. Always confirm destructive actions

Respond directly unless tool use is clearly necessary.`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let dangerous = false;
  let resumeSession = false;
  let autoMode = false;
  let tickMode = false;

  // Parse flags
  const filteredArgs = args.filter((arg) => {
    if (arg === "--dangerous" || arg === "-d") {
      dangerous = true;
      return false;
    }
    if (arg === "--resume" || arg === "-r") {
      resumeSession = true;
      return false;
    }
    if (arg === "--auto" || arg === "-a") {
      autoMode = true;
      return false;
    }
    if (arg === "--tick" || arg === "-t") {
      tickMode = true;
      return false;
    }
    return true;
  });

  // Initialize tools and skills
  await initializeToolRegistry();

  // Initialize checkpointing sidecar (wraps write/edit tools with auto-checkpoint)
  const { initializeCheckpointing } = await import("../src/sidecars/checkpointing.ts");
  await initializeCheckpointing();

  // Initialize MCP client sidecar — wire its tools into the tool registry
  const { registerTool } = await import("../src/sidecars/tool-registry.ts");
  setMCPToolRegistrar(registerTool);
  await loadMCPConfig();

  const tools = getAllTools();
  console.log(`${colors.dim}${t("tools_loaded", { n: tools.length, m: skills.length })}${colors.reset}`);

  // Handle --resume flag
  if (resumeSession) {
    const lastSessionId = getLastSessionId();
    if (!lastSessionId) {
      console.log(`${colors.yellow}No sessions to resume.${colors.reset}`);
      process.exit(0);
    }
    currentSessionId = lastSessionId;
    currentSessionMessages = loadSession(lastSessionId);
    console.log(`${colors.dim}Resumed session: ${lastSessionId}${colors.reset}`);
    if (currentSessionMessages.length > 0) {
      const lastUser = [...currentSessionMessages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        console.log(`${colors.dim}Preview: ${lastUser.content?.slice(0, 60)}...${colors.reset}`);
      }
    }
    console.log();
  }

  if (filteredArgs.length > 0) {
    // Single task mode
    const prompt = filteredArgs.join(" ");

    // Handle bare "help" command (no leading slash, e.g. --dangerous "help")
    if (filteredArgs[0].toLowerCase() === "help") {
      const skill = findSkill("help");
      if (skill) {
        const result = await skill.execute(filteredArgs.slice(1).join(" "), { cwd: process.cwd(), dangerous });
        if (result.error) {
          console.error(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${result.content}\n`);
        }
        return;
      }
    }

    // On Windows Git Bash, /mcp connect args → "C:/Program Files/Git/mcp" + "connect" + "args..."
    // Since the shell splits the mangled path at spaces, "C:/Program Files/Git/mcp" becomes
    // separate args. Check if the FIRST filteredArg itself starts with the mangled path pattern.
    const firstArg = filteredArgs[0] || "";
    const startsWithMangledPrefix =
      firstArg.startsWith("C:/Program Files/Git/") ||
      firstArg.startsWith("C:\\Program Files\\Git\\") ||
      (firstArg.length > 1 && firstArg[1] === ":" && /[A-Za-z]/.test(firstArg[0]) && firstArg.includes("Program Files") && firstArg.includes("Git"));

    if (prompt.startsWith("/") && !startsWithMangledPrefix) {
      // Normal slash command: /mcp help → prompt="/mcp help"
      const parts = prompt.slice(1).split(/\s+/);
      const skillName = parts[0];
      const skillArgs = parts.slice(1).join(" ");

      const skill = findSkill(skillName);
      if (skill) {
        console.log(`${colors.dim}Running skill: /${skill.name}${colors.reset}`);
        const result = await skill.execute(skillArgs, { cwd: process.cwd(), dangerous });
        if (result.error) {
          console.error(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${result.content}\n`);
        }
        return;
      }
    }

    if (startsWithMangledPrefix) {
      // Windows Git Bash mangled the skill command.
      // The first arg contains the full "C:/Program Files/Git/<skill> [args...]".
      // " /" (space + slash) marks the boundary between skill name and args.
      // If there's no space after the skill name (just "/mcp"), use last "/" as separator.
      const spaceSlashIdx = firstArg.indexOf(" /");
      let skillName: string;
      let remainingFirstArg: string;
      if (spaceSlashIdx >= 0) {
        // Has args: "C:/Program Files/Git/mcp connect..." → skillName="mcp", remaining="connect..."
        remainingFirstArg = firstArg.slice(spaceSlashIdx + 2); // skip " /"
        const spaceIdx2 = remainingFirstArg.indexOf(" ");
        skillName = spaceIdx2 >= 0 ? remainingFirstArg.slice(0, spaceIdx2) : remainingFirstArg;
      } else {
        // No args: "C:/Program Files/Git/mcp" → skillName="mcp"
        const lastSlash = firstArg.lastIndexOf("/");
        skillName = lastSlash >= 0 ? firstArg.slice(lastSlash + 1) : firstArg;
        remainingFirstArg = "";
      }
      // Remaining args from firstArg after the skill name, plus extra filteredArgs
      const afterSkillName = spaceSlashIdx >= 0
        ? (remainingFirstArg.indexOf(" ") >= 0 ? remainingFirstArg.slice(remainingFirstArg.indexOf(" ") + 1) : "")
        : "";
      const extraArgs = filteredArgs.slice(1).join(" ");
      const fullArgs = [afterSkillName, extraArgs].filter(Boolean).join(" ");

      const skill = findSkill(skillName);
      if (skill) {
        console.log(`${colors.dim}Running skill: /${skill.name} (via Windows path mangle)${colors.reset}`);
        const result = await skill.execute(fullArgs, { cwd: process.cwd(), dangerous });
        if (result.error) {
          console.error(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${result.content}\n`);
        }
        return;
      }
    }

    // Handle bare "help" command (without leading slash)
    if (prompt.toLowerCase() === "help") {
      const skill = findSkill("help");
      if (skill) {
        const result = await skill.execute("", { cwd: process.cwd(), dangerous });
        if (result.error) {
          console.error(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${result.content}\n`);
        }
        return;
      }
    }

    console.log(`${colors.dim}🐱 meow${colors.reset}\n`);
    console.log(`${colors.dim}Prompt: ${prompt}${colors.reset}\n`);

    // Auto/Tick mode - OODA loop autonomous operation
    if (autoMode || tickMode) {
      console.log(`${colors.cyan}⚡ Auto mode${tickMode ? " (tick)" : ""} - OODA loop engaged${colors.reset}\n`);
      console.log(`${colors.dim}Press Ctrl+C or send SIGTERM to interrupt${tickMode ? " after current tick" : ""}${colors.reset}\n`);

      // Register global signal handlers (handles SIGINT + SIGTERM)
      registerSignalHandlers();
      const ic = getInterruptController();
      ic.reset(); // clear any stale state from a previous run

      // Wire SIGINT to the interrupt controller
      const sigintHandler = () => {
        if (!ic.shouldStop()) {
          console.log(`\n${colors.yellow}⏹ Interrupt requested — stopping after current tick...${colors.reset}`);
          ic.stopAfterTick();
        }
      };
      process.on("SIGINT", sigintHandler);

      setCursorVisible(false);
      try {
        const result = await withSpinner(
          runAutoLoop(prompt, {
            dangerous,
            tickMode,
            ghostMode: true,
            autoCommit: dangerous,
            autoPush: dangerous,
            confidenceThreshold: 0.7,
            abortSignal: ic.signal,
            onTick: (progress) => {
              // Live tick progress feedback
              process.stdout.write("\r" + colors.dim + formatTickStatus(progress) + " ".repeat(20) + colors.reset + "\r");
            },
          }),
          tickMode ? "autonomous..." : "thinking...",
          () => { ic.stopNow(); }
        );

        eraseLine();

        if (result.interrupted) {
          console.log(`${colors.yellow}⏹ Interrupted after ${result.ticks} tick(s) (${Math.round(result.elapsedMs / 1000)}s)${colors.reset}`);
        } else {
          console.log(`${colors.green}✅ Autonomous operation complete${colors.reset}`);
          console.log(`${colors.dim}Ticks: ${result.ticks} | Iterations: ${result.finalResult.iterations}${colors.reset}`);
          console.log(formatUsage(result.finalResult.usage));
        }

        if (result.actions.length > 0 || result.pauseReason) {
          console.log(`\n${colors.bold}━━━ OODA Loop Summary ━━━${colors.reset}`);
          console.log(formatAutoLoopSummary(result));
        }

        console.log(`\n--- Output ---\n${result.finalResult.content}`);
      } catch (e: any) {
        if (e.message === "Interrupted") {
          process.exit(130);
        }
        console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}`);
        process.exit(1);
      } finally {
        process.off("SIGINT", sigintHandler);
        setCursorVisible(true);
      }
      return;
    }

    setCursorVisible(false);
    try {
      const result = await withSpinner(
        runLeanAgent(prompt, { dangerous }),
        "thinking..."
      );
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(formatUsage(result.usage));
      console.log(`\n--- Output ---\n${result.content}`);
    } catch (e: any) {
      if (e.message === "Interrupted") {
        process.exit(130);
      }
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}`);
      process.exit(1);
    } finally {
      setCursorVisible(true);
    }
    return;
  }

  // Interactive mode
  console.log(`${colors.blue}${colors.bold}🐱 meow — lean sovereign agent${colors.reset}`);
  console.log(`${colors.dim}Type /help for commands. Type /exit to quit.${colors.reset}\n`);

  // Initialize session - auto-resume last session
  if (!currentSessionId) {
    const lastSessionId = getLastSessionId();
    if (lastSessionId) {
      const messages = loadSession(lastSessionId);
      if (messages.length > 0) {
        currentSessionId = lastSessionId;
        currentSessionMessages = messages;
        // Rebuild conversation from session
        messages.forEach((m) => {
          if (m.role !== "tool") {
            conversation.push({ role: m.role as "system" | "user" | "assistant", content: m.content });
          }
        });
        console.log(`${colors.green}📜 Resumed last session${colors.reset}\n`);
      } else {
        currentSessionId = createSession();
      }
    } else {
      currentSessionId = createSession();
    }
  }

  const systemPrompt = buildSystemPrompt();
  conversation.push({ role: "system", content: systemPrompt });

  const rl = readline.createInterface({
    input,
    output,
    historySize: 100,  // Keep last 100 commands in history
  });

  // Command history navigation
  let historyIndex = -1;
  let currentInput = "";

  const getHistoryCommand = (direction: "up" | "down"): string => {
    const history = rl.history;
    if (history.length === 0) return "";

    if (direction === "up") {
      if (historyIndex === -1) {
        historyIndex = history.length - 1;
        currentInput = "";
      } else if (historyIndex > 0) {
        historyIndex--;
      }
    } else {
      if (historyIndex !== -1) {
        historyIndex++;
        if (historyIndex >= history.length) {
          historyIndex = -1;
          return "";
        }
      }
    }

    return historyIndex >= 0 ? history[historyIndex] : "";
  };

  const printHelp = () => {
    console.log(`${colors.bold}Commands:${colors.reset}`);
    console.log(`  ${colors.green}/help${colors.reset}       Show this help`);
    console.log(`  ${colors.green}/exit${colors.reset}      Exit meow`);
    console.log(`  ${colors.green}/clear${colors.reset}     Clear screen and conversation`);
    console.log(`  ${colors.green}/plan${colors.reset}      Plan mode: show intent before executing`);
    console.log(`  ${colors.green}/dangerous${colors.reset} Toggle dangerous mode (auto-approve shell)`);
    console.log(`  ${colors.green}/stream${colors.reset}    Toggle streaming mode (show tokens as they arrive)`);
    console.log();
    console.log(`${colors.bold}Auto Mode (OODA Loop):${colors.reset}`);
    console.log(`  ${colors.green}/auto${colors.reset}       Run autonomous OODA loop (single pass)`);
    console.log(`  ${colors.green}/tick${colors.reset}      Continuous autonomous mode with heartbeats`);
    console.log();
    console.log(`${colors.bold}Tasks:${colors.reset}`);
    console.log(`  ${colors.green}/tasks${colors.reset}     List all tasks`);
    console.log(`  ${colors.green}/add${colors.reset}       Add a new task (e.g., /add Write tests)`);
    console.log(`  ${colors.green}/done${colors.reset}      Complete a task (e.g., /done t123)`);
    console.log();
    console.log(`${colors.bold}Sessions:${colors.reset}`);
    console.log(`  ${colors.green}/sessions${colors.reset}  List saved sessions`);
    console.log(`  ${colors.green}/resume${colors.reset}    Resume a session (e.g., /resume session_123)`);
    console.log();
    console.log(`${colors.bold}Skills:${colors.reset}`);
    for (const skill of skills) {
      console.log(`  ${colors.green}/${skill.name}${colors.reset}   ${skill.description}`);
    }
    console.log();
  };

  const runAgent = async (prompt: string, options: LeanAgentOptions = {}) => {
    setCursorVisible(false);
    try {
      // Pass conversation messages to agent for multi-turn context
      const agentMessages = conversation.filter(m => m.role !== "system").map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await withSpinner(
        runLeanAgent(prompt, { dangerous, ...options, abortSignal: abortController?.signal, messages: agentMessages }),
        "thinking...",
        () => {
          console.log(`\n${colors.yellow}⏹️ Stopped thinking${colors.reset}`);
        }
      );
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset}`);
      console.log(`\n--- ---\n${result.content}\n`);
      console.log(formatUsage(result.usage));
      if (result.usage) console.log();

      // Update conversation for next turn
      conversation.push({ role: "user", content: prompt });
      conversation.push({ role: "assistant", content: result.content });

      // Save to session
      currentSessionMessages.push(
        { role: "user", content: prompt, timestamp: new Date().toISOString() },
        { role: "assistant", content: result.content, timestamp: new Date().toISOString() }
      );
      saveSession();

      // Check if session needs compaction
      await checkAndCompact();

      return result;
    } catch (e: any) {
      if (e.message === "Interrupted") {
        console.log(`${colors.yellow}⏹️ Cancelled${colors.reset}\n`);
        return;
      }
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
      throw e;
    } finally {
      setCursorVisible(true);
    }
  };

  const runAgentStream = async (prompt: string, options: LeanAgentOptions = {}) => {
    // Streaming mode - shows tokens as they arrive
    process.stdout.write(`${colors.dim}`);
    let lastFrame = 0;
    let aborted = false;

    const onToken = (token: string) => {
      process.stdout.write(token);
      lastFrame++;
      if (lastFrame % 10 === 0) {
        process.stdout.write(`${colors.reset}${colors.dim}`);
      }
    };

    abortController = new AbortController();
    const signal = abortController.signal;

    signal.addEventListener("abort", () => {
      aborted = true;
    });

    try {
      const result = await runLeanAgentSimpleStream(prompt, { dangerous, ...options }, onToken);
      console.log(`${colors.reset}`);
      const tokenCount = result.usage?.totalTokens || lastFrame;
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset} ${colors.dim}(${tokenCount} tokens)${colors.reset}`);
      console.log(formatUsage(result.usage));
      console.log();

      currentSessionMessages.push(
        { role: "user", content: prompt, timestamp: new Date().toISOString() },
        { role: "assistant", content: result.content, timestamp: new Date().toISOString() }
      );
      saveSession();
      await checkAndCompact();

      return result;
    } catch (e: any) {
      console.log(`${colors.reset}`);
      if (aborted) {
        console.log(`${colors.yellow}⏹️ Cancelled${colors.reset}\n`);
      } else {
        console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
      }
      throw e;
    } finally {
      abortController = null;
    }
  };

  const runPlanMode = async (prompt: string) => {
    const planPrompt = `You are in PLAN MODE. Only output a structured plan of what you would do. Do NOT execute anything. Format your response as:

## Plan
1. [Step description]
2. [Step description]
...

## Tools to use
- list only the tools you'll use

## Risks
- note any destructive or risky operations

Respond with ONLY the plan.`;

    conversation.push({ role: "user", content: prompt });
    conversation.push({ role: "assistant", content: planPrompt });

    setCursorVisible(false);
    try {
      const result = await withSpinner(
        runLeanAgent(planPrompt, { dangerous, systemPrompt }),
        "planning..."
      );

      console.log(`\n${colors.bold}${colors.yellow}━━━ Plan ━━━${colors.reset}\n`);
      console.log(result.content);
      console.log();

      // Ask for confirmation
      const rlConfirm = readline.createInterface({ input, output });
      const answer = await new Promise<string>((resolve) => {
        rlConfirm.question(
          `${colors.bold}Execute this plan? [y/N] ${colors.reset}`,
          (ans) => resolve(ans)
        );
      });
      rlConfirm.close();

      if (answer.toLowerCase() === "y") {
        // Remove plan prompt and assistant response, add user prompt
        conversation.pop();
        conversation.pop();
        conversation.push({ role: "user", content: prompt });
        await runAgent(prompt);
      } else {
        console.log(`${colors.dim}Plan cancelled.${colors.reset}\n`);
        // Remove plan prompt from conversation
        conversation.pop();
        conversation.pop();
      }
    } catch (e: any) {
      console.error(`\n${colors.red}❌ Error: ${e.message}${colors.reset}\n`);
    } finally {
      setCursorVisible(true);
    }
  };

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Built-in commands
    if (trimmed === "/exit") {
      saveSession();
      console.log(`${colors.yellow}${t("goodbye")}${colors.reset}`);
      rl.close();
      return;
    }

    if (trimmed === "/help") {
      printHelp();
      return;
    }

    if (trimmed === "/clear") {
      console.clear();
      console.log(`${colors.blue}${colors.bold}🐱 meow — lean sovereign agent${colors.reset}\n`);
      conversation.length = 0;
      conversation.push({ role: "system", content: buildSystemPrompt() });
      return;
    }

    if (trimmed === "/dangerous") {
      dangerous = !dangerous;
      console.log(
        `${dangerous ? colors.red : colors.green}Dangerous mode: ${dangerous ? "ON" : "OFF"}${colors.reset}\n`
      );
      return;
    }

    if (trimmed === "/stream") {
      isStreaming = !isStreaming;
      console.log(
        `${isStreaming ? colors.cyan : colors.dim}Streaming mode: ${isStreaming ? "ON" : "OFF"}${colors.reset}\n`
      );
      return;
    }

    // Auto mode commands
    if (trimmed === "/auto") {
      console.log(`${colors.cyan}⚡ Enter autonomous mode (OODA loop)${colors.reset}`);
      console.log(`${colors.dim}Type a task and I'll observe-orient-decide-act autonomously${colors.reset}\n`);
      return;
    }

    if (trimmed === "/tick") {
      console.log(`${colors.cyan}⚡⚡ Enter tick mode (continuous OODA loop)${colors.reset}`);
      console.log(`${colors.dim}I'll run continuously with tick heartbeats until done${colors.reset}\n`);
      return;
    }

    if (trimmed === "/skills") {
      console.log(formatSkillsList());
      console.log();
      return;
    }

    // Task commands
    if (trimmed === "/tasks") {
      const tasks = listTasks();
      console.log(formatTasks(tasks));
      console.log();
      return;
    }

    if (trimmed.startsWith("/add ")) {
      const content = trimmed.slice(5);
      if (!content) {
        console.log(`${colors.red}Usage: /add <task description>${colors.reset}\n`);
        return;
      }
      const task = addTask(content);
      console.log(`${colors.green}Added task [${task.id}]: ${task.content}${colors.reset}\n`);
      return;
    }

    if (trimmed.startsWith("/done ")) {
      const id = trimmed.slice(6);
      if (!id) {
        console.log(`${colors.red}Usage: /done <task-id>${colors.reset}\n`);
        return;
      }
      const task = completeTask(id);
      if (task) {
        console.log(`${colors.green}Completed task [${task.id}]: ${task.content}${colors.reset}\n`);
      } else {
        console.log(`${colors.red}Task not found: ${id}${colors.reset}\n`);
      }
      return;
    }

    // Session commands
    if (trimmed === "/sessions") {
      const sessions = listSessions();
      console.log(formatSessions(sessions));
      console.log();
      return;
    }

    if (trimmed.startsWith("/resume ")) {
      const sessionId = trimmed.slice(8);
      if (!sessionId) {
        console.log(`${colors.red}Usage: /resume <session-id>${colors.reset}\n`);
        return;
      }
      const messages = loadSession(sessionId);
      if (messages.length === 0) {
        console.log(`${colors.red}Session not found: ${sessionId}${colors.reset}\n`);
        return;
      }
      currentSessionId = sessionId;
      currentSessionMessages = messages;
      conversation.length = 0;
      // Rebuild conversation from session
      messages.forEach((m) => {
        if (m.role !== "tool") {
          conversation.push({ role: m.role as "system" | "user" | "assistant", content: m.content });
        }
      });
      console.log(`${colors.green}Resumed session: ${sessionId}${colors.reset}\n`);
      return;
    }

    if (trimmed.startsWith("/plan ")) {
      const prompt = trimmed.slice(6);
      await runPlanMode(prompt);
      return;
    }

    // Check for skill commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(/\s+/);
      const skillName = parts[0];
      const skillArgs = parts.slice(1).join(" ");

      const skill = findSkill(skillName);
      if (skill) {
        console.log(`${colors.dim}Running skill: /${skill.name}${colors.reset}`);
        const result = await skill.execute(skillArgs, { cwd: process.cwd(), dangerous });
        if (result.error) {
          console.error(`${colors.red}${result.error}${colors.reset}`);
        } else {
          console.log(`\n${result.content}\n`);
        }
        return;
      }
    }

    // Run agent with conversation context
    conversation.push({ role: "user", content: trimmed });
    try {
      if (isStreaming) {
        await runAgentStream(trimmed);
      } else {
        await runAgent(trimmed);
      }
    } catch (e) {
      // Error already printed
    }
  };

  const promptUser = () => {
    let line = "";
    let cursorPos = 0;

    const redrawLine = () => {
      eraseLine();
      process.stdout.write(prefix + line);
      // Move cursor back to correct position
      const cursorBack = line.length - cursorPos;
      if (cursorBack > 0) {
        process.stdout.write(`\x1B[${cursorBack}D`);
      }
    };

    const handleKeypress = (char: string, key: { name?: string; sequence?: string }) => {
      if (key?.name === "return") {
        // Enter - submit command
        process.stdout.write("\n");
        rl.history.push(line);
        historyIndex = -1;
        const cmd = line;
        line = "";
        cursorPos = 0;
        rl.off("keypress", handleKeypress);
        handleLine(cmd).then(() => {
          if (!rl.closed) {
            promptUser();
          }
        });
        return;
      }

      if (key?.name === "ctrl-c") {
        process.stdout.write("^C\n");
        line = "";
        cursorPos = 0;
        redrawLine();
        return;
      }

      if (key?.name === "backspace") {
        if (cursorPos > 0) {
          line = line.slice(0, cursorPos - 1) + line.slice(cursorPos);
          cursorPos--;
          redrawLine();
        }
        return;
      }

      if (key?.name === "delete") {
        if (cursorPos < line.length) {
          line = line.slice(0, cursorPos) + line.slice(cursorPos + 1);
          redrawLine();
        }
        return;
      }

      if (key?.name === "left") {
        if (cursorPos > 0) {
          cursorPos--;
          process.stdout.write("\x1B[D");
        }
        return;
      }

      if (key?.name === "right") {
        if (cursorPos < line.length) {
          cursorPos++;
          process.stdout.write("\x1B[C");
        }
        return;
      }

      if (key?.name === "up") {
        const prevCmd = getHistoryCommand("up");
        if (prevCmd !== "") {
          // Erase current line
          eraseLine();
          process.stdout.write(prefix);
          line = prevCmd;
          cursorPos = line.length;
          process.stdout.write(line);
        }
        return;
      }

      if (key?.name === "down") {
        const nextCmd = getHistoryCommand("down");
        eraseLine();
        process.stdout.write(prefix);
        line = nextCmd;
        cursorPos = line.length;
        process.stdout.write(line);
        return;
      }

      if (key?.name === "home") {
        cursorPos = 0;
        process.stdout.write(`\x1B[${prefix.length}D`);
        return;
      }

      if (key?.name === "end") {
        if (cursorPos < line.length) {
          process.stdout.write(`\x1B[${line.length - cursorPos}C`);
          cursorPos = line.length;
        }
        return;
      }

      // Regular character
      if (char && char.length === 1) {
        line = line.slice(0, cursorPos) + char + line.slice(cursorPos);
        cursorPos++;
        // Write the new character and all characters after it
        process.stdout.write(prefix + line);
        // Move cursor back to correct position
        const cursorBack = line.length - cursorPos;
        if (cursorBack > 0) {
          process.stdout.write(`\x1B[${cursorBack}D`);
        }
      }
    };

    rl.on("keypress", handleKeypress);
    process.stdout.write(prefix);
  };

  rl.on("close", () => {
    saveSession();
    setCursorVisible(true);
    process.stdout.write("\n");
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    if (isThinking) {
      interrupt();
    } else {
      saveSession();
      setCursorVisible(true);
      console.log(`\n${colors.yellow}Interrupted. Use /exit to quit.${colors.reset}\n`);
    }
  });

  promptUser();
}

main();
