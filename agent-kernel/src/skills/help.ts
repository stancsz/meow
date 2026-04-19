/**
 * help.ts
 *
 * Built-in /help skill for Meow.
 * Handles both "help" (Windows Git Bash mangled) and "/help" cases.
 */
import { getAllSkills } from "./loader.ts";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

// ============================================================================
// ANSI Colors & Box Drawing
// ============================================================================

const C = {
  bold:      "\x1b[1m",
  dim:       "\x1b[2m",
  red:       "\x1b[31m",
  green:     "\x1b[32m",
  yellow:    "\x1b[33m",
  cyan:      "\x1b[36m",
  magenta:   "\x1b[35m",
  brightWhite: "\x1b[97m",
  brightBlack:  "\x1b[90m",
  reset:     "\x1b[0m",
};

const B = {
  horiz:  "─",
  vert:   "│",
  tl:     "┌",
  tr:     "┐",
  bl:     "└",
  br:     "┘",
  tee_r:  "├",
  tee_l:  "┤",
};

const W = 72; // terminal width
const labelWidth = 18;

// ============================================================================
// Command category definitions
// ============================================================================

interface HelpCommand {
  command: string;   // shown in dim color (user types this)
  desc: string;      // shown in white
  shortcut?: string; // keyboard shortcut hint
}

interface HelpCategory {
  title: string;
  color: string;
  commands: HelpCommand[];
}

const categories: HelpCategory[] = [
  // ── Navigation ──────────────────────────────────────────────────────────
  {
    title: "Navigation",
    color: C.brightWhite,
    commands: [
      { command: "/exit",        desc: "End session and exit" },
      { command: "/clear",       desc: "Clear screen and conversation history" },
      { command: "/sessions",     desc: "List saved sessions" },
      { command: "/resume <id>",  desc: "Resume a saved session by ID" },
    ],
  },
  // ── Agent control ───────────────────────────────────────────────────────
  {
    title: "Agent Control",
    color: C.cyan,
    commands: [
      { command: "/dangerous",   desc: "Toggle dangerous mode (auto-approve shell commands)" },
      { command: "/stream",      desc: "Toggle streaming mode (show tokens live)" },
      { command: "/plan <task>", desc: "Preview what the agent will do before executing" },
      { command: "/auto",        desc: "Enter autonomous OODA loop (single pass)" },
      { command: "/tick",        desc: "Enter continuous autonomous mode with heartbeats" },
    ],
  },
  // ── Tasks ───────────────────────────────────────────────────────────────
  {
    title: "Tasks",
    color: C.green,
    commands: [
      { command: "/tasks",           desc: "List all pending tasks" },
      { command: "/add <description>", desc: "Add a new task" },
      { command: "/done <task-id>",  desc: "Mark a task as completed" },
    ],
  },
  // ── Memory ──────────────────────────────────────────────────────────────
  {
    title: "Memory",
    color: C.yellow,
    commands: [
      { command: "/remember <fact>", desc: "Store a persistent fact" },
      { command: "/forget <key>",    desc: "Remove a stored memory" },
      { command: "/facts",           desc: "Show all remembered facts" },
      { command: "/memory",          desc: "Show memory store statistics" },
    ],
  },
  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  {
    title: "Keyboard Shortcuts",
    color: C.brightBlack,
    commands: [
      { command: "Ctrl+C",       desc: "Cancel current operation (double-tap to force exit)" },
      { command: "↑ / ↓",        desc: "Navigate command history (previous / next)" },
      { command: "← / →",        desc: "Move cursor left / right in input" },
      { command: "Home / End",   desc: "Jump to start / end of input line" },
      { command: "Backspace",    desc: "Delete character before cursor" },
      { command: "Delete",       desc: "Delete character at cursor" },
      { command: "Enter ↵",      desc: "Submit command" },
      { command: "Double Enter", desc: "In multi-line mode: submit block (empty line)" },
    ],
  },
  // ── Running Meow ────────────────────────────────────────────────────────
  {
    title: "Running Meow",
    color: C.magenta,
    commands: [
      { command: "bun run start",                    desc: "Interactive mode" },
      { command: 'bun run start "task"',             desc: "Single task, then exit" },
      { command: 'bun run start --dangerous "task"', desc: "Single task with shell auto-approve" },
      { command: "bun run start --resume",           desc: "Resume the last session" },
      { command: 'bun run start --auto "task"',      desc: "Autonomous OODA loop (single pass)" },
      { command: 'bun run start --tick "task"',      desc: "Continuous autonomous mode" },
      { command: "bun run start --acp",              desc: "ACP mode: JSON-RPC stdio server" },
    ],
  },
];

// ============================================================================
// Render helpers
// ============================================================================

/** Draw a top/bottom border line using box-drawing characters. */
function border(top: boolean, fill = ""): string {
  return (top ? B.tl : B.bl) + B.horiz.repeat(W - 2) + (top ? B.tr : B.br) + fill;
}

/** Pad a string to a fixed width, truncating with ellipsis if needed. */
function lpad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

/** Build a left-aligned, wrapped description that respects terminal width. */
function wrapDesc(text: string, startX: number): string[] {
  const max = W - startX - 1;
  const lines: string[] = [];
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    if ((line + word).length > max) {
      if (line) { lines.push(line); line = word + " "; }
      else       { lines.push(word); }
    } else {
      line += word + " ";
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

// ============================================================================
// Main renderer
// ============================================================================

function renderCategory(cat: HelpCategory): string[] {
  const lines: string[] = [];

  // Category header bar: "  ▸ CategoryName  "
  const headerText = "▸ " + cat.title;
  lines.push("");
  lines.push(`${C.dim}${B.vert} ${C.reset}${cat.color}${C.bold}${lpad(headerText, W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`);
  lines.push(`${C.dim}${B.tee_r}${B.horiz.repeat(W - 2)}${B.tee_l}${C.reset}`);

  for (const cmd of cat.commands) {
    // Left-pad commands in a fixed-width column
    const shortcutHint = cmd.shortcut ? `  ${C.dim}[${cmd.shortcut}]${C.reset}` : "";
    const labelLine = `${C.dim}  ${lpad(cmd.command, labelWidth)}${C.reset}`;

    // Wrap description to remaining width
    const descLines = wrapDesc(cmd.desc, 22);
    for (let i = 0; i < descLines.length; i++) {
      const prefix = i === 0 ? labelLine : " ".repeat(22);
      lines.push(`${C.dim}${B.vert}${C.reset} ${prefix}${C.brightWhite}${descLines[i].padEnd(W - 23)}${C.reset}${C.dim}${B.vert}${C.reset}`);
    }
  }

  return lines;
}

// ============================================================================
// Skill export
// ============================================================================

export const help: Skill = {
  name: "help",
  description: "Show Meow CLI help and available commands",
  aliases: ["?"],

  async execute(_args: string, _ctx: SkillContext): Promise<SkillResult> {
    const allSkills = getAllSkills();
    const skillCount = allSkills.length;

    // ── Header ─────────────────────────────────────────────────────────────
    const headerLines: string[] = [
      `${C.reset}`,
      `${C.dim}${border(true)}${C.reset}`,
      `${C.dim}${B.vert} ${C.reset}${C.brightWhite}${C.bold}${lpad("", W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`,
      `${C.dim}${B.vert} ${C.reset}${C.brightWhite}${C.bold}  🐱  Meow — Lean Sovereign Agent${C.reset}`.padEnd(W - 1) + `${C.dim}${B.vert}${C.reset}`,
      `${C.dim}${B.vert} ${C.reset}${C.brightWhite}${lpad("type a task or /help to get started", W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`,
      `${C.dim}${B.vert} ${C.reset}${C.dim}${lpad(`${skillCount} skills loaded`, W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`,
      `${C.dim}${B.vert} ${C.reset}${C.brightWhite}${lpad("", W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`,
      `${C.dim}${border(false)}${C.reset}`,
    ];

    // ── Categories ─────────────────────────────────────────────────────────
    const categoryLines: string[] = [];
    for (const cat of categories) {
      categoryLines.push(...renderCategory(cat));
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    const dividerLine = `${C.dim}${B.tee_r}${B.horiz.repeat(W - 2)}${B.tee_l}${C.reset}`;
    const skillHeader = `${C.dim}${B.vert} ${C.reset}${C.cyan}${C.bold}▸ Available Skills (${skillCount})${C.reset}${C.dim}${" ".repeat(W - 25)}${B.vert}${C.reset}`;

    const skillLines: string[] = [];
    skillLines.push(dividerLine);
    skillLines.push(skillHeader);
    skillLines.push(dividerLine);

    for (const skill of allSkills) {
      const aliasNote = skill.aliases?.length
        ? ` ${C.dim}(aliases: ${skill.aliases.map((a) => "/" + a).join(", ")})`
        : "";
      const cmdText = `  /${skill.name}`;
      const descText = skill.description + aliasNote;
      const descLines = wrapDesc(descText, 26);

      for (let i = 0; i < descLines.length; i++) {
        const prefix = i === 0 ? cmdText.padEnd(24) : " ".repeat(24);
        skillLines.push(
          `${C.dim}${B.vert} ${C.reset}${C.green}${prefix}${C.brightWhite}${descLines[i].padEnd(W - 25)}${C.reset}${C.dim}${B.vert}${C.reset}`
        );
      }
    }

    // ── Tip footer ─────────────────────────────────────────────────────────
    const tipText = "Tip: multi-line input is triggered by lines starting with : { ( or indented continuations — press Enter twice to submit";
    const tipLines = wrapDesc(tipText, 4);
    const footerLines: string[] = [];
    footerLines.push(`${C.dim}${border(true)}${C.reset}`);
    for (const l of tipLines) {
      footerLines.push(`${C.dim}${B.vert} ${C.reset}${C.dim}${lpad(l, W - 2)}${C.reset}${C.dim}${B.vert}${C.reset}`);
    }
    footerLines.push(`${C.dim}${border(false)}${C.reset}`);

    const output =
      headerLines.join("\n") +
      "\n" +
      categoryLines.join("\n") +
      "\n" +
      skillLines.join("\n") +
      "\n" +
      footerLines.join("\n") +
      "\n";

    return { content: output };
  },
};
