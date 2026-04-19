/** error-formatter.ts - Beautiful error messages with suggestions */
import { existsSync } from "node:fs";

// ============================================================================
// ANSI Colors & Box Drawing
// ============================================================================

const C = {
  bold:         "\x1b[1m",
  dim:          "\x1b[2m",
  red:          "\x1b[31m",
  green:        "\x1b[32m",
  yellow:       "\x1b[33m",
  blue:         "\x1b[34m",
  cyan:         "\x1b[36m",
  magenta:      "\x1b[35m",
  brightWhite:  "\x1b[97m",
  brightBlack:  "\x1b[90m",
  brightRed:    "\x1b[91m",
  brightGreen:  "\x1b[92m",
  brightYellow: "\x1b[93m",
  reset:        "\x1b[0m",
};

const B = {
  h:   "\u2500",
  v:   "\u2502",
  tl:  "\u250c",
  tr:  "\u2510",
  bl:  "\u2514",
  br:  "\u2518",
  lt:  "\u251c",
  rt:  "\u2524",
  lb:  "\u252c",
  rb:  "\u2534",
  x:   "\u253c",
};

const W = 72;

// ============================================================================
// Types
// ============================================================================

export type ErrorKind =
  | "shell"
  | "git"
  | "file_not_found"
  | "permission"
  | "network"
  | "auth"
  | "api"
  | "syntax"
  | "runtime"
  | "tool"
  | "unknown";

export interface FormattedError {
  kind: ErrorKind;
  title: string;
  body: string;
  suggestions: string[];
  hint: string;
  emoji: string;
  color: string;
}

interface ErrorPattern {
  kind: ErrorKind;
  patterns: RegExp[];
  title: string;
  suggestions: string[];
  hint: string;
}

// ============================================================================
// Error Kind Metadata
// ============================================================================

const ERROR_KIND_META: Record<ErrorKind, { emoji: string; color: string; title: string }> = {
  shell:          { emoji: "\u{1F4BB}", color: C.cyan,          title: "Shell Error" },
  git:            { emoji: "\u{1F4C2}", color: C.magenta,      title: "Git Error" },
  file_not_found: { emoji: "\u{1F4C4}", color: C.brightYellow, title: "File Not Found" },
  permission:     { emoji: "\u{1F513}", color: C.brightRed,   title: "Permission Error" },
  network:        { emoji: "\u{1F310}", color: C.cyan,         title: "Network Error" },
  auth:           { emoji: "\u{1F510}", color: C.yellow,       title: "Auth Error" },
  api:            { emoji: "\u{26A1}", color: C.green,         title: "API Error" },
  syntax:         { emoji: "\u{1F4D0}", color: C.brightBlack,  title: "Syntax Error" },
  runtime:        { emoji: "\u{1F4A5}", color: C.brightRed,   title: "Runtime Error" },
  tool:           { emoji: "\u{1F527}", color: C.magenta,      title: "Tool Error" },
  unknown:        { emoji: "\u{2753}", color: C.brightWhite,  title: "Unknown Error" },
};

// ============================================================================
// Error Classification Patterns
// ============================================================================

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    kind: "shell",
    patterns: [
      /command not found/i,
      /ENOENT/i,
      /spawn.*ENOENT/i,
      /shell.*failed/i,
    ],
    title: "Shell command failed",
    suggestions: [
      "Check if the command is installed",
      "Verify the path is correct",
      "Use --dangerous mode for shell commands",
    ],
    hint: "Shell commands require explicit approval. Try running with --dangerous flag.",
  },
  {
    kind: "git",
    patterns: [
      /git.*failed/i,
      /not a git repository/i,
      /fatal:.*repository/i,
      /fatal:.*branch/i,
      /permission denied.*git/i,
      /could not.*git/i,
    ],
    title: "Git operation failed",
    suggestions: [
      "Verify you're in a git repository",
      "Check git status with `git status`",
      "Ensure you have proper permissions",
    ],
    hint: "Make sure git is installed and the repository exists.",
  },
  {
    kind: "file_not_found",
    patterns: [
      /ENOENT/i,
      /no such file/i,
      /cannot find/i,
      /does not exist/i,
      /file not found/i,
    ],
    title: "File or directory not found",
    suggestions: [
      "Check the file path for typos",
      "Verify the file exists with `ls`",
      "Use absolute paths when possible",
    ],
    hint: "Paths are relative to the current working directory.",
  },
  {
    kind: "permission",
    patterns: [
      /EACCES/i,
      /permission denied/i,
      /EPERM/i,
      /cannot write/i,
      /read-only/i,
    ],
    title: "Permission denied",
    suggestions: [
      "Check file permissions with `ls -la`",
      "Try running with elevated privileges",
      "Verify the directory is writable",
    ],
    hint: "On Unix, use `chmod` to modify permissions. On Windows, run as administrator.",
  },
  {
    kind: "network",
    patterns: [
      /ENOTFOUND/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /network/i,
      /fetch.*failed/i,
      /socket.*hang/i,
    ],
    title: "Network error",
    suggestions: [
      "Check your internet connection",
      "Verify the host is reachable",
      "Check if a firewall is blocking",
    ],
    hint: "Some operations require network access to download dependencies.",
  },
  {
    kind: "auth",
    patterns: [
      /AUTH/i,
      /UNAUTHORIZED/i,
      /authentication.*fail/i,
      /invalid.*token/i,
      /credential/i,
    ],
    title: "Authentication failed",
    suggestions: [
      "Check your API keys in .env",
      "Verify credentials are correct",
      "Ensure tokens haven't expired",
    ],
    hint: "Store sensitive credentials in a .env file, never commit them.",
  },
  {
    kind: "api",
    patterns: [
      /API.*error/i,
      /rate.*limit/i,
      /429/i,
      /500.*internal.*server.*error/i,
      /503.*service.*unavailable/i,
    ],
    title: "API error",
    suggestions: [
      "The service may be temporarily unavailable",
      "Check if you've hit a rate limit",
      "Retry in a few moments",
    ],
    hint: "If this persists, check the service status page.",
  },
  {
    kind: "syntax",
    patterns: [
      /syntax.*error/i,
      /unexpected.*token/i,
      /parse.*error/i,
      /JSON.*invalid/i,
      / Unexpected/i,
    ],
    title: "Syntax error",
    suggestions: [
      "Check for matching brackets and quotes",
      "Verify JSON/JS syntax is valid",
      "Use a linter to find issues",
    ],
    hint: "Trailing commas and missing quotes are common culprits.",
  },
  {
    kind: "runtime",
    patterns: [
      /TypeError/i,
      /ReferenceError/i,
      /RangeError/i,
      /runtime.*error/i,
      /undefined.*is.*not.*function/i,
    ],
    title: "Runtime error",
    suggestions: [
      "Check the stack trace for the error location",
      "Verify all variables are defined",
      "Look for null/undefined access",
    ],
    hint: "Runtime errors occur during execution, not during parsing.",
  },
  {
    kind: "tool",
    patterns: [
      /tool.*error/i,
      /tool.*failed/i,
      /tool.*not.*found/i,
    ],
    title: "Tool execution failed",
    suggestions: [
      "Verify the tool is registered",
      "Check tool arguments are correct",
      "Review the tool documentation",
    ],
    hint: "Tools must be registered in the tool registry before use.",
  },
];

// ============================================================================
// Core Formatting Logic
// ============================================================================

function classifyError(error: unknown): ErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  for (const pattern of ERROR_PATTERNS) {
    for (const re of pattern.patterns) {
      if (re.test(message)) {
        return pattern.kind;
      }
    }
  }
  return "unknown";
}

function findMatchingPattern(message: string): ErrorPattern | undefined {
  for (const pattern of ERROR_PATTERNS) {
    for (const re of pattern.patterns) {
      if (re.test(message)) {
        return pattern;
      }
    }
  }
  return undefined;
}

export function formatError(error: unknown): FormattedError {
  const message = error instanceof Error ? error.message : String(error);
  const kind = classifyError(message);
  const meta = ERROR_KIND_META[kind];
  const pattern = findMatchingPattern(message);

  return {
    kind,
    title: pattern?.title ?? meta.title,
    body: message.length > 200 ? message.slice(0, 197) + "..." : message,
    suggestions: pattern?.suggestions ?? [
      "Review the error message carefully",
      "Check the documentation",
      "Try again with more context",
    ],
    hint: pattern?.hint ?? "An unexpected error occurred.",
    emoji: meta.emoji,
    color: meta.color,
  };
}

// ============================================================================
// Rendering Helpers
// ============================================================================

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "\u2026" : s.padEnd(n);
}

function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= max) {
      if (paragraph) lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      if ((line + word).length > max) {
        if (line) lines.push(line.trimEnd());
        line = word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

function border(top: boolean): string {
  return (top ? B.tl : B.bl) + B.h.repeat(W - 2) + (top ? B.tr : B.br);
}

// ============================================================================
// Renderer
// ============================================================================

export function renderError(fe: FormattedError): string {
  const lines: string[] = [];

  // Header box
  lines.push("");
  lines.push(C.dim + border(true) + C.reset);
  const titleLine = `  ${fe.emoji}  ${fe.color}${C.bold}${fe.title}${C.reset}`;
  lines.push(C.dim + B.v + C.reset + pad(titleLine, W - 1) + C.dim + B.v + C.reset);
  lines.push(C.dim + border(false) + C.reset);

  // Body
  const bodyLines = wrapText(fe.body, W - 6);
  for (const l of bodyLines) {
    lines.push(C.dim + B.v + C.reset + "  " + C.brightWhite + pad(l, W - 5) + C.reset + C.dim + B.v + C.reset);
  }

  // Suggestions
  lines.push(C.dim + B.lt + B.h.repeat(W - 2) + B.rb + C.reset);
  lines.push(C.dim + B.v + C.reset + "  " + C.yellow + C.bold + "Suggestions:" + C.reset + C.dim + " ".repeat(W - 17) + B.v + C.reset);
  for (let i = 0; i < fe.suggestions.length; i++) {
    const sug = `${i + 1}. ${fe.suggestions[i]}`;
    const sugLines = wrapText(sug, W - 6);
    for (let j = 0; j < sugLines.length; j++) {
      const prefix = j === 0 ? "  " : "    ";
      lines.push(C.dim + B.v + C.reset + prefix + pad(sugLines[j], W - 5) + C.dim + B.v + C.reset);
    }
  }

  // Hint
  if (fe.hint) {
    lines.push(C.dim + B.lt + B.h.repeat(W - 2) + B.rb + C.reset);
    const hintLines = wrapText("\u{1F3DB} Hint: " + fe.hint, W - 6);
    for (const l of hintLines) {
      lines.push(C.dim + B.v + C.reset + "  " + C.dim + pad(l, W - 5) + C.reset + C.dim + B.v + C.reset);
    }
  }

  // Footer
  lines.push(C.dim + border(true) + C.reset);
  const kindLabel = `${fe.emoji} ${fe.kind.replace(/_/g, " ")}`;
  const footer = pad("  " + kindLabel + "  ", W - 1);
  lines.push(C.dim + B.v + C.reset + fe.color + C.dim + footer + C.reset + C.dim + B.v + C.reset);
  lines.push(C.dim + border(false) + C.reset);
  lines.push("");

  return lines.join("\n");
}

export function printError(error: string | Error | unknown): void {
  const fe = formatError(error);
  console.log(renderError(fe));
}

// ============================================================================
// File path error helpers
// ============================================================================

export function fileNotFound(path: string): FormattedError {
  return formatError(`File not found: ${path}`);
}

export function permissionDenied(path: string): FormattedError {
  return formatError(`Permission denied: ${path}`);
}

export function shellError(cmd: string, exitCode: number): FormattedError {
  return formatError(`Shell command failed with exit code ${exitCode}: ${cmd}`);
}

// ============================================================================
// Error summary renderer
// ============================================================================

export function errorSummary(errors: unknown[]): string {
  const kinds = new Map<ErrorKind, number>();
  for (const e of errors) {
    const k = classifyError(e);
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  const out: string[] = [];
  out.push(C.dim + border(true) + C.reset);
  out.push(
    C.dim + B.v + " " + C.reset +
    C.brightRed + pad("  " + errors.length + " error(s) encountered", W - 2) +
    C.reset + C.dim + B.v + C.reset
  );
  out.push(C.dim + B.lt + B.h.repeat(W - 2) + B.rb + C.reset);
  for (const [kind, count] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) {
    const meta = ERROR_KIND_META[kind];
    out.push(
      C.dim + B.v + " " + C.reset +
      meta.color + pad(meta.emoji + " " + meta.title + ":  " + count, W - 2) +
      C.reset + C.dim + B.v + C.reset
    );
  }
  out.push(C.dim + border(false) + C.reset);
  return out.join("\n");
}
