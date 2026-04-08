/**
 * onboarding.ts — First-Run Experience & Tutorial Walkthrough
 *
 * Detects first-run, shows welcome message with key features,
 * and optionally runs a tutorial walkthrough.
 *
 * First-run detection: checks ~/.meow/sessions/ for any session files
 * Onboarding state persists in ~/.meow/config.json (has_seen_onboarding)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// ============================================================================
// Paths
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow test override via env var - resolved dynamically
function getMeowDir(): string {
  return process.env.MEOW_DIR || join(homedir(), ".meow");
}
function getSessionsDir(): string {
  return join(getMeowDir(), "sessions");
}
function getConfigFile(): string {
  return join(getMeowDir(), "config.json");
}

// ============================================================================
// Types
// ============================================================================

interface OnboardingConfig {
  has_seen_onboarding?: boolean;
  onboarding_version?: number;
  tutorial_completed?: boolean;
  locale?: string;
  [key: string]: unknown;
}

export interface OnboardingResult {
  isFirstRun: boolean;
  showOnboarding: boolean;
  tutorialMode: boolean;
}

// ============================================================================
// Config Management
// ============================================================================

function ensureMeowDir(): void {
  const dir = getMeowDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadConfig(): OnboardingConfig {
  ensureMeowDir();
  const configFile = getConfigFile();
  if (!existsSync(configFile)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configFile, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: OnboardingConfig): void {
  ensureMeowDir();
  writeFileSync(getConfigFile(), JSON.stringify(config, null, 2));
}

// ============================================================================
// First-Run Detection
// ============================================================================

function hasExistingSessions(): boolean {
  try {
    const sessionsDir = getSessionsDir();
    if (!existsSync(sessionsDir)) return false;
    const files = readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl"));
    return files.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Onboarding Content
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

const MEOW_ASCII = `
${COLORS.magenta}    /\\_____/\\
   /  o   o  \\
  ( ==  ^  == )
   )         (
  (           )
 ( (  )   (  ) )
(__(__)___(__)__)${COLORS.reset}
`;

const WELCOME_MESSAGE = `
${MEOW_ASCII}
${COLORS.bold}${COLORS.cyan}Welcome to Meow! 🐱${COLORS.reset}

I'm your lean sovereign agent companion. Let me show you around!

${COLORS.bold}Quick Start:${COLORS.reset}
  ${COLORS.green}1.${COLORS.reset} Ask me anything — "Explain this codebase"
  ${COLORS.green}2.${COLORS.reset} Use tools — I'll read files, run commands, edit code
  ${COLORS.green}3.${COLORS.reset} Manage tasks — /add, /tasks, /done
  ${COLORS.green}4.${COLORS.reset} Sessions persist — /sessions, /resume

${COLORS.bold}Key Commands:${COLORS.reset}
  ${COLORS.green}/help${COLORS.reset}     Show all commands
  ${COLORS.green}/skills${COLORS.reset}   List available skills
  ${COLORS.green}/plan${COLORS.reset}     Plan mode (shows intent before acting)
  ${COLORS.green}/auto${COLORS.reset}     Autonomous OODA loop mode
  ${COLORS.green}/stream${COLORS.reset}   Toggle streaming responses

${COLORS.bold}Safety:${COLORS.reset}
  ${COLORS.yellow}Dangerous commands${COLORS.reset} (rm, git push --force) require confirmation.
  Use ${COLORS.green}--dangerous${COLORS.reset} flag to auto-approve shell commands.

${COLORS.bold}Tips:${COLORS.reset}
  • Multi-line input: end a line with ${COLORS.cyan}:${COLORS.reset} ${COLORS.cyan}${COLORS.reset} ${COLORS.cyan}{${COLORS.reset} ${COLORS.cyan}(${COLORS.reset} ${COLORS.cyan}=>${COLORS.reset} ${COLORS.cyan}->${COLORS.reset} to continue
  • Tab completion for slash commands
  • Up/Down arrows for command history
  • Type ${COLORS.green}/exit${COLORS.reset} to save and quit

${COLORS.dim}Run /tutorial for an interactive walkthrough!${COLORS.reset}
`;

const TUTORIAL_STEPS = [
  {
    title: "Let's read a file! 📖",
    instruction: "Try asking me to read a file. For example:",
    example: 'read package.json',
    tip: "The read tool shows file contents without editing anything.",
  },
  {
    title: "Let's search! 🔍",
    instruction: "Search across files with grep. Try:",
    example: 'grep "function" src/',
    tip: "Glob finds files by name, grep finds content by pattern.",
  },
  {
    title: "Let's run a command! ⚡",
    instruction: "Execute shell commands (requires --dangerous):",
    example: '--dangerous "ls -la"',
    tip: "Shell commands are auto-blocked for safety. Use --dangerous to approve.",
  },
  {
    title: "Let's add a task! ✅",
    instruction: "Track things to do with the task system:",
    example: "/add Write documentation",
    tip: "Tasks persist in .meow/tasks.json and survive restarts.",
  },
  {
    title: "You're ready! 🚀",
    instruction: "That's the basics! Remember:",
    example: "",
    tip: "• Ask questions freely  • /help shows all commands  • Sessions auto-save",
  },
];

// ============================================================================
// Public API
// ============================================================================

const CURRENT_ONBOARDING_VERSION = 1;

/**
 * Check if we should show onboarding
 */
export function checkOnboarding(): OnboardingResult {
  const config = loadConfig();
  const hasSessions = hasExistingSessions();
  const isFirstRun = !config.has_seen_onboarding && !hasSessions;

  return {
    isFirstRun,
    showOnboarding: isFirstRun || config.has_seen_onboarding !== true,
    tutorialMode: false,
  };
}

/**
 * Mark onboarding as seen
 */
export function markOnboardingSeen(): void {
  const config = loadConfig();
  config.has_seen_onboarding = true;
  config.onboarding_version = CURRENT_ONBOARDING_VERSION;
  saveConfig(config);
}

/**
 * Mark tutorial as completed
 */
export function markTutorialCompleted(): void {
  const config = loadConfig();
  config.tutorial_completed = true;
  saveConfig(config);
}

/**
 * Check if tutorial was completed
 */
export function isTutorialCompleted(): boolean {
  const config = loadConfig();
  return config.tutorial_completed === true;
}

/**
 * Get the welcome message (for display)
 */
export function getWelcomeMessage(): string {
  return WELCOME_MESSAGE;
}

/**
 * Get tutorial steps
 */
export function getTutorialSteps() {
  return TUTORIAL_STEPS;
}

/**
 * Format a tutorial step for display
 */
export function formatTutorialStep(step: typeof TUTORIAL_STEPS[0], index: number, total: number): string {
  let output = `\n${COLORS.bold}${COLORS.cyan}[Tutorial ${index + 1}/${total}] ${step.title}${COLORS.reset}\n\n`;
  output += `${step.instruction}\n`;
  if (step.example) {
    output += `  ${COLORS.green}${step.example}${COLORS.reset}\n`;
  }
  output += `\n${COLORS.dim}💡 ${step.tip}${COLORS.reset}\n`;
  return output;
}

/**
 * Print welcome banner
 */
export function printWelcome(): void {
  console.log(WELCOME_MESSAGE);
}

/**
 * Print tutorial
 */
export async function runTutorial(interactive: boolean = false): Promise<void> {
  if (isTutorialCompleted()) {
    console.log(`${COLORS.dim}You've already completed the tutorial! Use /tutorial restart to redo it.${COLORS.reset}`);
    return;
  }

  console.log(`\n${COLORS.bold}${COLORS.magenta}━━━ Tutorial ━━━${COLORS.reset}`);
  console.log(`${COLORS.dim}I'll walk you through the basics. Press Enter after each step.${COLORS.reset}\n`);

  const readline = await import("node:readline");
  const { stdin: input, stdout: output } = await import("node:process");

  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const step = TUTORIAL_STEPS[i];
    console.log(formatTutorialStep(step, i, TUTORIAL_STEPS.length));

    if (interactive) {
      const rl = readline.createInterface({ input, output });
      await new Promise<void>((resolve) => {
        rl.question(`${COLORS.dim}Press Enter to continue...${COLORS.reset}`, () => {
          rl.close();
          resolve();
        });
      });
    }
  }

  markTutorialCompleted();
  console.log(`\n${COLORS.green}✅ Tutorial complete! You're ready to use Meow.${COLORS.reset}\n`);
}

/**
 * Reset onboarding state (for testing)
 */
export function resetOnboarding(): void {
  const config = loadConfig();
  config.has_seen_onboarding = false;
  config.tutorial_completed = false;
  config.onboarding_version = undefined;
  saveConfig(config);
}
