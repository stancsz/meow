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
import { createSession, appendToSession, loadSession, listSessions, formatSessions, getLastSessionId, compactSession, nameSession, getSessionName } from "../src/core/session-store.ts";
import { skills, getAllSkills, findSkill, formatSkillsList } from "../src/skills/index.ts";
import { initI18n, t } from "../src/sidecars/i18n/index.ts";
import { setMCPToolRegistrar, loadMCPConfig } from "../src/sidecars/mcp-client.ts";
import { startACPServer } from "../src/sidecars/acp.ts";
import { parseAndExecute as parseSlashCommand } from "../src/sidecars/slash-commands.ts";
import { initMemory, setMemory, getMemory, remember, listMemoryKeys, deleteMemory, getMemoryStats, formatMemoryStats, listMemoryStores, autoLearnFromConversation } from "../src/sidecars/memory.ts";
import { createTUI, type TUI } from "../src/sidecars/tui.ts";
import { printError as printBeautifulError, formatError } from "../src/sidecars/error-formatter.ts";
import { formatToolOutput } from "../src/sidecars/tool-output-formatter.ts";
import {
  trackSessionStart, trackSessionEnd, trackTokenUsage, trackError, trackToolCall,
  setCurrentSession, getAggregatedStats, formatAnalyticsReport
} from "../src/sidecars/analytics.ts";

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
let tui: TUI | null = null;

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
  let acpMode = false;

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
    if (arg === "--acp") {
      acpMode = true;
      return false;
    }
    return true;
  });

  // ACP mode: start JSON-RPC stdio server
  if (acpMode) {
    await startACPServer();
    return;
  }

  // Initialize tools and skills
  await initializeToolRegistry();

  // Initialize workspace trust — BLOCK if running in untrusted directory
  const { initWorkspaceTrust, checkWorkspaceTrust, isPromptNeeded, recordPromptShown, trustWorkspace, distrustWorkspace } = await import("../src/sidecars/workspace-trust.ts");
  initWorkspaceTrust(process.cwd());

  const handleTrustPrompt = async (): Promise<boolean> => {
    const trustStatus = checkWorkspaceTrust();
    if (trustStatus.trusted) return true;

    console.log(`${colors.yellow}[!] Workspace Trust — This directory is not trusted${colors.reset}`);
    const reason = trustStatus.reason || "This directory is not trusted.";
    console.log("  " + reason);
    console.log();
    console.log(`  ${colors.cyan}Current directory: ${process.cwd()}${colors.reset}`);
    console.log();
    console.log(`  ${colors.dim}Options:${colors.reset}`);
    console.log(`    ${colors.green}trust${colors.reset}   - Trust this directory permanently`);
    console.log(`    ${colors.red}deny${colors.reset}    - Do not trust (exit)`);
    console.log(`    ${colors.dim}continue${colors.reset} - Proceed without changes (single session only)`);
    console.log();

    const rlTrust = readline.createInterface({ input, output });
    const answer = await new Promise<string>((resolve) => {
      rlTrust.question(
        `${colors.bold}Choice (trust/deny/continue): ${colors.reset}`,
        (ans) => resolve(ans.trim().toLowerCase())
      );
    });
    rlTrust.close();

    if (answer === "trust") {
      trustWorkspace();
      console.log(`${colors.green}✓ Directory trusted permanently${colors.reset}\n`);
      return true;
    }

    if (answer === "deny") {
      console.log(`${colors.red}✗ Exiting at your request${colors.reset}\n`);
      process.exit(0);
    }

    // "continue" or anything else - session only, no permanent trust
    recordPromptShown();
    console.log(`${colors.dim}Proceeding without permanent trust (this prompt will recur)${colors.reset}\n`);
    return true;
  };

  // BLOCKING: wait for trust decision before any tool execution
  if (isPromptNeeded()) {
    await handleTrustPrompt();
  }

  // Initialize checkpointing sidecar (wraps write/edit tools with auto-checkpoint)
  const { initializeCheckpointing } = await import("../src/sidecars/checkpointing.ts");
  await initializeCheckpointing();

  // Initialize MCP client sidecar — wire its tools into the tool registry
  const { registerTool } = await import("../src/sidecars/tool-registry.ts");
  setMCPToolRegistrar(registerTool);
  await loadMCPConfig();

  const tools = getAllTools();
  console.log(`${colors.dim}${t("tools_loaded", { n: tools.length, m: skills.length })}${colors.reset}`);

  // Initialize memory sidecar
  await initMemory();
  const memStores = listMemoryStores();
  if (memStores.length > 0) {
    console.log(`${colors.dim}Memory: ${memStores.join(", ")}${colors.reset}`);
  }

  // First-run onboarding experience
  const { checkOnboarding, markOnboardingSeen, printWelcome, isTutorialCompleted } = await import("../src/sidecars/onboarding.ts");
  const onboarding = checkOnboarding();
  if (onboarding.showOnboarding && !resumeSession && filteredArgs.length === 0) {
    printWelcome();
    markOnboardingSeen();
    console.log();
  }

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

    // Initialize TUI for single task
    const singleTui = createTUI({ mode: "compact", showStatusBar: true });
    singleTui.setStatus({ mode: "single-task", dangerous });
    singleTui.printHeader();
    singleTui.printUser(prompt);
    singleTui.startThinking();

    // Handle bare "help" command (no leading slash, e.g. --dangerous "help")
    if (filteredArgs[0].toLowerCase() === "help") {
      const skill = findSkill("help");
      if (skill) {
        const result = await skill.execute(filteredArgs.slice(1).join(" "), { cwd: process.cwd(), dangerous });
        if (result.error) {
          singleTui.printError(result.error);
        } else {
          singleTui.stopThinking("skill complete");
          console.log(`\n${formatToolOutput(result)}\n`);
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

    // Detect split-mangle: Git Bash split "C:/Program Files/Git/skill" into
    // ["C:/Program", "Files/Git/skill", ...] — firstArg="C:/Program", secondArg starts with "Files/Git/"
    const secondArg = filteredArgs[1] || "";
    const splitMangleMatch =
      /^[A-Za-z]:[\/\\]?$/.test(firstArg) && secondArg.startsWith("Program Files/Git/") ||
      /^([A-Za-z]:[\/\\][^\s\\\/]+)$/.test(firstArg) && secondArg.startsWith("Program Files/Git/");

    // Reassemble a split Windows Git Bash mangled path
    function reassembleSplitMangle(): string {
      // e.g. ["C:/Program", "Files/Git/exec", "echo", "hello"] → "C:/Program Files/Git/exec"
      const prefix = firstArg.replace(/[\/\\]+$/, ""); // strip trailing slashes
      return prefix + "/" + secondArg;
    }

    if (prompt.startsWith("/") && !startsWithMangledPrefix && !splitMangleMatch) {
      // Normal slash command: /mcp help → prompt="/mcp help"
      const parts = prompt.slice(1).split(/\s+/);
      const skillName = parts[0];
      const skillArgs = parts.slice(1).join(" ");

      const skill = findSkill(skillName);
      if (skill) {
        singleTui.updateStatus(`Running /${skill.name}...`);
        const result = await skill.execute(skillArgs, { cwd: process.cwd(), dangerous });
        singleTui.stopThinking("skill complete");
        if (result.error) {
          singleTui.printError(result.error);
        } else {
          singleTui.printSuccess("skill complete");
          console.log(`\n${formatToolOutput(result)}\n`);
        }
        return;
      }
      // Skill not found - fall through to agent
    }

    if (startsWithMangledPrefix || splitMangleMatch) {
      // Windows Git Bash mangled the skill command.
      // The first arg contains the full "C:/Program Files/Git/<skill> [args...]".
      // Git Bash auto-completes /mcp to C:/Program Files/Git/mcp
      const effectiveFirstArg = splitMangleMatch ? reassembleSplitMangle() : firstArg;

      // Strategy: Find known skill by searching for skill name patterns in the mangled string
      // Skills are: simplify, review, commit, learn, mcp, perms, permissions, help, auto, exec, database, context7
      const knownSkills = ["simplify", "review", "commit", "learn", "mcp", "perms", "permissions", "help", "auto", "exec", "database", "context7"];

      // Look for a known skill followed by space (skill name followed by args)
      // or at the end of the string (skill name alone)
      let skillName = "";
      let remainingFirstArg = "";

      for (const skill of knownSkills) {
        // Pattern 1: skill followed by space and args - "Git/simplify args"
        const skillWithSpaceIdx = effectiveFirstArg.indexOf(skill + " ");
        if (skillWithSpaceIdx >= 0) {
          skillName = skill;
          remainingFirstArg = effectiveFirstArg.slice(skillWithSpaceIdx + skill.length + 1).trim();
          break;
        }
        // Pattern 2: skill at end of string or followed by path - "Git/skill"
        const skillEndIdx = effectiveFirstArg.indexOf(skill);
        if (skillEndIdx >= 0) {
          const afterSkill = effectiveFirstArg.slice(skillEndIdx + skill.length);
          // Skill found, and it's followed by end of string, slash, or space
          if (afterSkill === "" || afterSkill.startsWith("/") || afterSkill.startsWith(" ")) {
            skillName = skill;
            remainingFirstArg = afterSkill.startsWith(" ") ? afterSkill.slice(1).trim() : "";
            break;
          }
        }
      }

      // Build fullArgs from remainingFirstArg and extra filteredArgs
      const extraArgs = splitMangleMatch
        ? filteredArgs.slice(2).join(" ")
        : filteredArgs.slice(1).join(" ");
      const fullArgs = [remainingFirstArg, extraArgs].filter(Boolean).join(" ");

      const skill = findSkill(skillName);
      if (skill) {
        singleTui.updateStatus(`Running /${skill.name}...`);
        const result = await skill.execute(fullArgs, { cwd: process.cwd(), dangerous });
        singleTui.stopThinking("skill complete");
        if (result.error) {
          singleTui.printError(result.error);
        } else {
          singleTui.printSuccess("skill complete");
          console.log(`\n${formatToolOutput(result)}\n`);
        }
        return;
      }

      // Not a skill — try slash commands from mangled path
      const mangledPrompt = `/${skillName}${fullArgs ? " " + fullArgs : ""}`;
      const cmdResult2 = await parseSlashCommand(mangledPrompt, { cwd: process.cwd(), dangerous });
      if (cmdResult2.handled) {
        return;
      }
      if (cmdResult2.error) {
        singleTui.printError(cmdResult2.error);
        return;
      }
    }

    // Handle bare "help" command (without leading slash)
    if (prompt.toLowerCase() === "help") {
      const skill = findSkill("help");
      if (skill) {
        const result = await skill.execute("", { cwd: process.cwd(), dangerous });
        singleTui.stopThinking("help shown");
        if (result.error) {
          singleTui.printError(result.error);
        } else {
          singleTui.printSuccess("help shown");
          console.log(`\n${formatToolOutput(result)}\n`);
        }
        return;
      }
    }

    singleTui.updateStatus(`Running task...`);

    // Auto/Tick mode - OODA loop autonomous operation
    if (autoMode || tickMode) {
      singleTui.updateStatus(`Auto mode${tickMode ? " (tick)" : ""} — OODA loop engaged`);
      setCursorVisible(false);

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
          singleTui.stopThinking(`interrupted after ${result.ticks} tick(s)`);
        } else {
          singleTui.stopThinking("autonomous complete");
          singleTui.printAssistant(result.finalResult.content);
          singleTui.printSuccess(`Done in ${result.finalResult.iterations} iteration(s), ${result.ticks} tick(s)`);
        }

        if (result.actions.length > 0 || result.pauseReason) {
          console.log(`\n${colors.bold}━━━ OODA Loop Summary ━━━${colors.reset}`);
          console.log(formatAutoLoopSummary(result));
        }
      } catch (e: any) {
        if (e.message === "Interrupted") {
          process.exit(130);
        }
        printBeautifulError(e);
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
      singleTui.stopThinking("complete");
      singleTui.printAssistant(formatToolOutput(result));
      singleTui.printSuccess(`Done in ${result.iterations} iteration(s)`);
      if (result.usage) singleTui.printInfo(formatUsage(result.usage).trim());
      singleTui.setStatus({ tokens: result.usage?.totalTokens });
      singleTui.printStatusBar();
    } catch (e: any) {
      if (e.message === "Interrupted") {
        process.exit(130);
      }
      printBeautifulError(e);
      process.exit(1);
    } finally {
      setCursorVisible(true);
    }
    return;
  }

  // Interactive mode — initialize TUI
  tui = createTUI({ mode: "compact", showStatusBar: true });
  tui.setStatus({ mode: "interactive", dangerous: false });
  tui.printHeader();
  tui.printStatusBar();
  tui.printInfo("Type /help for commands. Type /exit to quit.");

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
    console.log(`  ${colors.green}/name${colors.reset}      Name this session (e.g., /name my-project)`);
    console.log();
    console.log(`${colors.bold}Memory:${colors.reset}`);
    console.log(`  ${colors.green}/remember${colors.reset}  Remember a fact (e.g., /remember I use TypeScript)`);
    console.log(`  ${colors.green}/forget${colors.reset}    Forget a memory key (e.g., /forget key_name)`);
    console.log(`  ${colors.green}/memory${colors.reset}    Show memory stats`);
    console.log(`  ${colors.green}/facts${colors.reset}     Show all remembered facts`);
    console.log();
    console.log(`${colors.bold}Getting Started:${colors.reset}`);
    console.log(`  ${colors.green}/tutorial${colors.reset}   Run the interactive tutorial walkthrough`);
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

      // Show user message in TUI bubble
      if (tui) tui.printUser(prompt);

      const result = await withSpinner(
        runLeanAgent(prompt, { dangerous, ...options, abortSignal: abortController?.signal, messages: agentMessages }),
        "thinking...",
        () => {
          if (tui) tui.printWarning("Stopped thinking");
        }
      );

      // Show assistant response in TUI bubble
      if (tui) tui.printAssistant(formatToolOutput(result));
      if (tui) tui.printSuccess(`Done in ${result.iterations} iteration(s)`);
      const usageLine = formatUsage(result.usage);
      if (usageLine && tui) tui.printInfo(usageLine.trim());
      if (tui) { tui.setStatus({ tokens: result.usage?.totalTokens }); tui.printStatusBar(); }

      // Update conversation for next turn
      conversation.push({ role: "user", content: prompt });
      conversation.push({ role: "assistant", content: formatToolOutput(result) });

      // Save to session
      currentSessionMessages.push(
        { role: "user", content: prompt, timestamp: new Date().toISOString() },
        { role: "assistant", content: formatToolOutput(result), timestamp: new Date().toISOString() }
      );
      saveSession();

      // Auto-learn from conversation
      const conversationSlice = conversation.filter(m => m.role !== "system" && m.role !== "tool");
      autoLearnFromConversation("user", conversationSlice);

      // Check if session needs compaction
      await checkAndCompact();

      return result;
    } catch (e: any) {
      if (e.message === "Interrupted") {
        if (tui) tui.printWarning("Cancelled");
        return;
      }
      if (tui) tui.printError(`Error: ${e.message}`);
      throw e;
    } finally {
      setCursorVisible(true);
    }
  };

  const runAgentStream = async (prompt: string, options: LeanAgentOptions = {}) => {
    // Streaming mode - shows tokens as they arrive with buffering
    const { createBufferedStream } = await import("../src/sidecars/streaming.ts");
    process.stdout.write(`${colors.dim}`);
    let lastFrame = 0;
    let aborted = false;

    const bufferedStream = createBufferedStream(
      (text) => {
        process.stdout.write(text);
        lastFrame++;
      },
      { bufferSize: 15, flushIntervalMs: 30 }
    );

    const onToken = (token: string) => {
      bufferedStream.write(token);
    };

    abortController = new AbortController();
    const signal = abortController.signal;

    signal.addEventListener("abort", () => {
      aborted = true;
    });

    try {
      const result = await runLeanAgentSimpleStream(prompt, { dangerous, ...options }, onToken);
      bufferedStream.close();
      console.log(`${colors.reset}`);
      const tokenCount = result.usage?.totalTokens || lastFrame;
      console.log(`\n${colors.green}✅ Done in ${result.iterations} iteration(s)${colors.reset} ${colors.dim}(${tokenCount} tokens)${colors.reset}`);
      console.log(formatUsage(result.usage));
      console.log();

      currentSessionMessages.push(
        { role: "user", content: prompt, timestamp: new Date().toISOString() },
        { role: "assistant", content: formatToolOutput(result), timestamp: new Date().toISOString() }
      );
      saveSession();
      autoLearnFromConversation("user", conversation.filter(m => m.role !== "system" && m.role !== "tool"));
      await checkAndCompact();

      return result;
    } catch (e: any) {
      console.log(`${colors.reset}`);
      if (aborted) {
        console.log(`${colors.yellow}⏹️ Cancelled${colors.reset}\n`);
      } else {
        printBeautifulError(e);
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
      console.log(formatToolOutput(result));
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
      printBeautifulError(e);
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
      if (tui) { tui.destroy(); tui = null; }
      console.log(`${colors.yellow}${t("goodbye")}${colors.reset}`);
      rl.close();
      return;
    }

    if (trimmed === "/help") {
      printHelp();
      return;
    }

    if (trimmed === "/clear") {
      if (tui) tui.clear(); else console.clear();
      conversation.length = 0;
      conversation.push({ role: "system", content: buildSystemPrompt() });
      return;
    }

    if (trimmed === "/dangerous") {
      dangerous = !dangerous;
      console.log(
        `${dangerous ? colors.red : colors.green}Dangerous mode: ${dangerous ? "ON" : "OFF"}${colors.reset}\n`
      );
      if (tui) tui.setStatus({ dangerous });
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

    if (trimmed === "/tutorial" || trimmed.startsWith("/tutorial ")) {
      const { runTutorial, isTutorialCompleted, getTutorialSteps, formatTutorialStep } = await import("../src/sidecars/onboarding.ts");
      const isRestart = trimmed.includes("restart");
      const completed = isTutorialCompleted();
      const steps = getTutorialSteps();

      if (completed && !isRestart) {
        console.log(`${colors.dim}Tutorial already completed! Use /tutorial restart to redo it.${colors.reset}\n`);
        console.log(`${colors.bold}Quick recap:${colors.reset}`);
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${step.title.split(" ").slice(1).join(" ")}`);
        }
        console.log();
        return;
      }

      if (isRestart) {
        const { resetOnboarding, markTutorialCompleted } = await import("../src/sidecars/onboarding.ts");
        resetOnboarding();
        markTutorialCompleted();
        console.log(`${colors.dim}Tutorial reset. Starting...${colors.reset}\n`);
      }

      await runTutorial(false);
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

    if (trimmed.startsWith("/name")) {
      const args = trimmed.slice(5).trim();
      if (!args) {
        const currentName = currentSessionId ? getSessionName(currentSessionId) : null;
        if (currentName) {
          console.log(`${colors.green}Session name: "${currentName}"${colors.reset}\n`);
        } else {
          console.log(`${colors.dim}This session has no name. Use /name <name> to name it.${colors.reset}\n`);
        }
        return;
      }
      if (!currentSessionId) {
        console.log(`${colors.red}No active session${colors.reset}\n`);
        return;
      }
      if (args.length > 50) {
        console.log(`${colors.red}Session name too long (max 50 characters)${colors.reset}\n`);
        return;
      }
      nameSession(currentSessionId, args);
      console.log(`${colors.green}Session renamed to "${args}"${colors.reset}\n`);
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
      const sessionName = getSessionName(sessionId);
      const nameStr = sessionName ? ` "${sessionName}"` : "";
      console.log(`${colors.green}Resumed session: ${sessionId}${nameStr}${colors.reset}\n`);
      return;
    }

    // Memory commands
    if (trimmed.startsWith("/remember ")) {
      const content = trimmed.slice(10);
      if (!content) {
        console.log(`${colors.red}Usage: /remember <fact>${colors.reset}\n`);
        return;
      }
      const key = `fact_${Date.now()}`;
      remember("user", key, content, { source: "user" });
      console.log(`${colors.green}💡 Remembered: ${content}${colors.reset}\n`);
      return;
    }

    if (trimmed.startsWith("/forget ")) {
      const key = trimmed.slice(8).trim();
      if (!key) {
        console.log(`${colors.red}Usage: /forget <key>${colors.reset}\n`);
        return;
      }
      const deleted = deleteMemory("user", key);
      if (deleted) {
        console.log(`${colors.yellow}Forgotten: ${key}${colors.reset}\n`);
      } else {
        console.log(`${colors.red}Key not found: ${key}${colors.reset}\n`);
      }
      return;
    }

    if (trimmed === "/memory") {
      for (const store of listMemoryStores()) {
        console.log(formatMemoryStats(store));
        console.log();
      }
      return;
    }

    if (trimmed === "/facts") {
      const keys = listMemoryKeys("user");
      if (keys.length === 0) {
        console.log(`${colors.dim}No memories yet. Use /remember to add facts.${colors.reset}\n`);
        return;
      }
      console.log(`${colors.bold}💭 Memories:${colors.reset}`);
      for (const key of keys.sort()) {
        const value = getMemory("user", key);
        console.log(`  ${colors.cyan}${key}${colors.reset}: ${JSON.stringify(value)}`);
      }
      console.log();
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
        singleTui.updateStatus(`Running /${skill.name}...`);
        const result = await skill.execute(skillArgs, { cwd: process.cwd(), dangerous });
        singleTui.stopThinking("skill complete");
        if (result.error) {
          singleTui.printError(result.error);
        } else {
          singleTui.printSuccess("skill complete");
          console.log(`\n${formatToolOutput(result)}\n`);
        }
        return;
      }
    }

    // Interactive confirmation for dangerous patterns (skip if already in dangerous mode)
    if (!dangerous) {
      const DANGEROUS_PATTERNS = [
        { pattern: /^\s*(rm|del|format|rd)\s+[^-]/i, desc: "file deletion" },
        { pattern: /^\s*git\s+push.*(-f|--force)/i, desc: "force push" },
        { pattern: /^\s*git\s+reset.*(--hard|--mixed)/i, desc: "git reset" },
        { pattern: /;\s*(rm|del|format)/i, desc: "destructive command in chain" },
        { pattern: /\|.*(rm|del|format)/i, desc: "destructive command in pipe" },
      ];

      for (const { pattern, desc } of DANGEROUS_PATTERNS) {
        if (pattern.test(trimmed)) {
          console.log(`${colors.yellow}⚠️  Warning: This command may cause ${desc}${colors.reset}`);
          const rlWarn = readline.createInterface({ input, output });
          const answer = await new Promise<string>((resolve) => {
            rlWarn.question(`${colors.bold}Proceed anyway? [y/N] ${colors.reset}`, (ans) => resolve(ans.trim().toLowerCase()));
          });
          rlWarn.close();
          if (answer !== "y") {
            console.log(`${colors.dim}Cancelled.${colors.reset}\n`);
            conversation.pop(); // Remove the user message we added
            return;
          }
          break; // Only prompt once
        }
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

  // Multi-line input state
  let multiLineBuffer: string[] = [];
  let isMultiLineMode = false;
  const MULTI_LINE_TRIGGERS = [":", "{", "(", "=>", "->"];
  const MULTI_LINE_INDENT = /^\s{2,}/;

  // Tab completion state
  let tabCompleteIndex = -1;
  let tabCompletions: string[] = [];

  function getCompletions(partial: string): string[] {
    if (!partial.startsWith("/")) return [];
    const cmd = partial.slice(1).toLowerCase();
    const slashCommands = ["/exit", "/clear", "/help", "/plan", "/dangerous", "/stream", "/auto", "/tick", "/tasks", "/add", "/done", "/sessions", "/resume", "/remember", "/forget", "/facts", "/memory", "/tutorial", "/clear"];
    const matches = slashCommands.filter(c => c.slice(1).startsWith(cmd));
    // Also add skill commands
    for (const skill of skills) {
      const name = "/" + skill.name;
      if (name.slice(1).startsWith(cmd) && !matches.includes(name)) {
        matches.push(name);
      }
    }
    return matches.sort();
  }

  const promptUser = () => {
    let line = "";
    let cursorPos = 0;

    const redrawLine = () => {
      eraseLine();
      process.stdout.write((isMultiLineMode ? "│ " : prefix) + line);
      // Move cursor back to correct position
      const cursorBack = line.length - cursorPos;
      if (cursorBack > 0) {
        process.stdout.write(`\x1B[${cursorBack}D`);
      }
    };

    const handleKeypress = (char: string, key: { name?: string; sequence?: string }) => {
      if (key?.name === "return") {
        // Enter - submit command (or continue multi-line)
        process.stdout.write("\n");

        const trimmedLine = line.trim();
        const isIndentContinued = MULTI_LINE_INDENT.test(line) && isMultiLineMode;
        const endsWithTrigger = MULTI_LINE_TRIGGERS.some(t => trimmedLine.endsWith(t));
        const isEmpty = trimmedLine === "";

        // In multi-line mode, double-enter (empty line) submits, or indent continues
        if (isMultiLineMode) {
          if (isEmpty) {
            // Double-enter: submit multi-line command
            rl.history.push(multiLineBuffer.join("\n"));
            historyIndex = -1;
            const cmd = multiLineBuffer.join("\n");
            multiLineBuffer = [];
            isMultiLineMode = false;
            rl.off("keypress", handleKeypress);
            handleLine(cmd).then(() => {
              if (!rl.closed) promptUser();
            });
            return;
          } else if (isIndentContinued || endsWithTrigger) {
            // Continue multi-line
            multiLineBuffer.push(line);
            line = "";
            cursorPos = 0;
            process.stdout.write("│ ");
            return;
          }
        }

        // Check if this starts multi-line mode
        if (endsWithTrigger || (isIndentContinued && trimmedLine.length > 0)) {
          multiLineBuffer.push(line);
          isMultiLineMode = true;
          line = "";
          cursorPos = 0;
          process.stdout.write("│ ");
          return;
        }

        // Single line: submit normally
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
        if (isMultiLineMode) {
          // Cancel multi-line input
          process.stdout.write("^C\n");
          multiLineBuffer = [];
          isMultiLineMode = false;
          line = "";
          cursorPos = 0;
          redrawLine();
        } else {
          process.stdout.write("^C\n");
          line = "";
          cursorPos = 0;
          redrawLine();
        }
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

      if (key?.name === "tab") {
        // Tab completion for slash commands
        const beforeCursor = line.slice(0, cursorPos);
        const wordMatch = beforeCursor.match(/(\/\S*)$/);
        if (wordMatch) {
          const partial = wordMatch[1];
          const completions = getCompletions(partial);
          if (completions.length === 0) return;
          if (completions.length === 1) {
            // Single match - complete it
            const afterCursor = line.slice(cursorPos);
            const completion = completions[0];
            // Replace the partial with the full completion
            line = line.slice(0, cursorPos - partial.length) + completion + afterCursor;
            cursorPos = line.length - afterCursor.length;
            eraseLine();
            process.stdout.write((isMultiLineMode ? "│ " : prefix) + line);
            process.stdout.write(`\x1B[${line.length - cursorPos}D`);
          } else {
            // Multiple matches - cycle through
            if (tabCompleteIndex === -1 || tabCompleteIndex >= completions.length - 1) {
              tabCompleteIndex = 0;
            } else {
              tabCompleteIndex++;
            }
            // Show completions
            eraseLine();
            process.stdout.write((isMultiLineMode ? "│ " : prefix) + line + "\n");
            process.stdout.write(`${colors.dim}  completions: ${completions.join(", ")}${colors.reset}\n`);
            process.stdout.write((isMultiLineMode ? "│ " : prefix));
          }
          tabCompletions = completions;
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
