/**
 * tool-output-formatter.ts
 *
 * Pretty-print tool output with syntax highlighting, tables, and trees.
 * Automatically detects and formats JSON, tables, and tree structures.
 */
import { type ToolResult } from "./tool-registry.ts";

// ============================================================================
// ANSI Colors
// ============================================================================

const C = {
  reset:      "\x1b[0m",
  bold:       "\x1b[1m",
  dim:        "\x1b[2m",
  red:        "\x1b[31m",
  green:      "\x1b[32m",
  yellow:     "\x1b[33m",
  blue:       "\x1b[34m",
  cyan:       "\x1b[36m",
  magenta:    "\x1b[35m",
  brightRed:  "\x1b[91m",
  brightGreen:"\x1b[92m",
  brightBlue: "\x1b[94m",
  brightCyan: "\x1b[96m",
  white:      "\x1b[37m",
  brightWhite:"\x1b[97m",
  gray:       "\x1b[90m",
};

// ============================================================================
// JSON Formatter
// ============================================================================

function isJSON(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, (match) => {
      if (match.startsWith('"')) {
        // Key or string value
        if (match.endsWith(':')) {
          // Key - highlight in cyan
          return C.brightCyan + match + C.reset;
        }
        // String value - dimmer cyan
        return C.cyan + match + C.reset;
      }
      return match;
    })
    // Numbers in bright green
    .replace(/\b(-?\d+\.?\d*)\b/g, C.brightGreen + "$1" + C.reset)
    // Booleans in magenta
    .replace(/\b(true|false)\b/g, C.magenta + "$1" + C.reset)
    // Null in yellow
    .replace(/\bnull\b/g, C.yellow + "null" + C.reset);
}

export function formatJSON(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return syntaxHighlight(json);
}

export function renderJSON(content: string): string {
  try {
    const parsed = JSON.parse(content.trim());
    return formatJSON(parsed);
  } catch {
    return content;
  }
}

// ============================================================================
// Table Formatter
// ============================================================================

interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
}

const MIN_COL_WIDTH = 8;
const MAX_COL_WIDTH = 40;
const TABLE_PAD = 2;

function measureColumn(values: string[], header: string): number {
  const maxVal = Math.max(...values.map((v) => v.length));
  const width = Math.max(maxVal, header.length, MIN_COL_WIDTH);
  return Math.min(width, MAX_COL_WIDTH);
}

function truncate(str: string, width: number): string {
  if (str.length <= width) return str;
  return str.slice(0, width - 1) + "\u2026";
}

function padCell(value: string, width: number, align: "left" | "center" | "right"): string {
  const padded = truncate(value, width);
  const spaces = width - padded.length;
  switch (align) {
    case "right":
      return " ".repeat(spaces) + padded;
    case "center": {
      const left = Math.floor(spaces / 2);
      const right = spaces - left;
      return " ".repeat(left) + padded + " ".repeat(right);
    }
    default:
      return padded + " ".repeat(spaces);
  }
}

export function formatTable(data: Record<string, unknown>[], columns: TableColumn[]): string {
  if (data.length === 0) return C.dim + "(empty table)" + C.reset;

  const lines: string[] = [];

  // Determine column widths from data
  const computedCols = columns.map((col) => {
    const values = data.map((row) => {
      const val = row[col.key];
      return val === undefined || val === null ? "" : String(val);
    });
    return {
      ...col,
      width: col.width ?? measureColumn(values, col.header),
      align: col.align ?? "left",
    };
  });

  // Draw header
  const vPipe = C.brightBlue + "\u2502" + C.reset;
  const hBar  = C.brightBlue + "\u2500" + C.reset;
  const cVert = C.brightBlue + "\u252c" + C.reset;
  const cRBar = C.brightBlue + "\u253c" + C.reset;
  const cLBdr = C.brightBlue + "\u2524" + C.reset;
  const tLdr  = C.brightBlue + "\u250c" + C.reset;
  const tRdr  = C.brightBlue + "\u2510" + C.reset;

  const sep = computedCols.map((c) => hBar.repeat(c.width + TABLE_PAD * 2));
  lines.push(C.bold + tLdr + sep.join(cVert) + tRdr);

  const headerCells = computedCols.map((c) => padCell(c.header, c.width, c.align));
  const headerLine = C.bold + vPipe + " " + headerCells.join(" " + vPipe + " ") + " " + vPipe;
  lines.push(C.brightWhite + C.bold + headerLine + C.reset);

  lines.push(C.bold + C.brightBlue + "\u251c" + sep.join(cRBar) + cLBdr + C.reset);

  // Draw rows
  const rPipe = C.brightBlue + "\u2502" + C.reset;
  for (let i = 0; i < data.length; i++) {
    const cells = computedCols.map((c) => {
      const val = data[i][c.key];
      const str = val === undefined || val === null ? "" : String(val);
      const color = i % 2 === 0 ? C.white : C.brightWhite;
      return color + padCell(str, c.width, c.align) + C.reset;
    });
    lines.push(rPipe + " " + cells.join(" " + rPipe + " ") + " " + rPipe);
  }

  // Draw footer
  lines.push(C.bold + C.brightBlue + "\u2514" + sep.join(C.brightBlue + "\u2534" + C.reset) + C.brightBlue + "\u2518" + C.reset);

  return lines.join("\n");
}

// ============================================================================
// Tree Formatter
// ============================================================================

const TREE_CHARS = {
  VERT:    "\u2502",
  BRANCH:  "\u251c",
  LAST:    "\u2514",
  HORIZ:   "\u2500",
  SPACER:  " ",
};

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

function renderTreeNode(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean): string[] {
  const lines: string[] = [];
  const connector = isLast ? TREE_CHARS.LAST : TREE_CHARS.BRANCH;
  const horiz = TREE_CHARS.HORIZ;

  if (isRoot) {
    lines.push(C.bold + C.green + node.label + C.reset);
  } else {
    lines.push(prefix + C.green + connector + horiz + " " + C.reset + C.brightWhite + node.label + C.reset);
  }

  if (node.children && node.children.length > 0) {
    const childPrefix = prefix + (isLast ? TREE_CHARS.SPACER.repeat(4) : C.dim + TREE_CHARS.VERT + "   " + C.reset);
    for (let i = 0; i < node.children.length; i++) {
      const childLines = renderTreeNode(node.children[i], childPrefix, i === node.children.length - 1, false);
      lines.push(...childLines);
    }
  }

  return lines;
}

export function formatTree(root: TreeNode): string {
  const lines = renderTreeNode(root, "", true, true);
  return lines.join("\n");
}

// Detect and parse tree-structured text
function parseTreeLines(text: string): string[] | null {
  const treeLinePattern = /^[\s\u2500\u2502\u251c\u2514\u252c\u2534\u253c]+/;
  const lines = text.split("\n");
  let treeCount = 0;

  for (const line of lines) {
    if (treeLinePattern.test(line)) {
      treeCount++;
    }
  }

  return treeCount > 2 ? lines : null;
}

// ============================================================================
// Auto-format Detection
// ============================================================================

interface AutoFormatOptions {
  maxLines?: number;
  preferJSON?: boolean;
}

function detectFormat(text: string): "json" | "table" | "tree" | "plain" {
  // Check for JSON
  if (isJSON(text)) return "json";

  // Check for tree structure
  if (parseTreeLines(text)) return "tree";

  // Check for table-like structure (multiple lines with consistent separators)
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length >= 2) {
    // Check if lines have consistent pipe/column structure
    const pipeCount = (line: string) => (line.match(/[\u2502|]/g) || []).length;
    const firstPipes = pipeCount(lines[0]);
    if (firstPipes >= 2 && lines.every((l) => pipeCount(l) === firstPipes)) {
      return "table";
    }
  }

  return "plain";
}

// Detect table from delimited data (e.g., CSV-like or space-separated)
function detectTable(data: string): { columns: TableColumn[]; rows: Record<string, unknown>[] } | null {
  const lines = data.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Try space-separated (command output style)
  // Check if first line looks like headers (less than 5 fields)
  const firstLineFields = lines[0].split(/\s{2,}/);
  if (firstLineFields.length >= 2 && firstLineFields.length <= 6) {
    const rows: Record<string, unknown>[] = [];
    for (const line of lines.slice(1)) {
      const fields = line.split(/\s{2,}/);
      if (fields.length === firstLineFields.length) {
        const row: Record<string, unknown> = {};
        for (let i = 0; i < firstLineFields.length; i++) {
          row[`col_${i}`] = fields[i].trim();
        }
        rows.push(row);
      }
    }

    if (rows.length > 0) {
      const columns: TableColumn[] = firstLineFields.map((h, i) => ({
        header: h.trim(),
        key: `col_${i}`,
      }));
      return { columns, rows };
    }
  }

  return null;
}

export function autoFormat(content: string, options: AutoFormatOptions = {}): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const format = detectFormat(trimmed);

  switch (format) {
    case "json":
      return renderJSON(trimmed);

    case "table": {
      // Try to parse as table
      const tableData = detectTable(trimmed);
      if (tableData) {
        return formatTable(tableData.rows, tableData.columns);
      }
      // Fall through to plain
      return content;
    }

    case "tree":
      // Tree rendering would need structured input - just return as-is
      return content;

    default:
      return content;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

export function formatToolOutput(result: ToolResult): string {
  if (result.error) {
    // Don't re-format errors - they should use the error formatter
    return result.content || result.error;
  }

  if (!result.content) return "";

  return autoFormat(result.content);
}

// Format multi-tool outputs (e.g., glob/grep results)
export function formatToolOutputs(results: ToolResult[]): string {
  const formatted = results.map((r, i) => {
    const output = formatToolOutput(r);
    return output;
  });

  return formatted.filter(Boolean).join("\n\n");
}
