import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { crypto } from "bun";

/**
 * Context Sandbox Manager
 * 
 * Implements "Context Sandboxing" to solve Context Bankruptcy.
 * Saves massive tool outputs to a paging directory and provides
 * a high-fidelity summary to the LLM context.
 */

const SANDBOX_DIR = ".meow/sandbox";
const MAX_INLINE_SIZE = 5120; // 5KB limit for inline tool results

export interface SandboxRef {
  refId: string;
  originalSize: number;
  summary: string;
  path: string;
}

/**
 * Ensures the sandbox directory exists
 */
function ensureSandbox(): string {
  const path = join(process.cwd(), SANDBOX_DIR);
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

/**
 * Simple summarization logic (can be upgraded to LLM-based later)
 */
function generateSummary(content: string, type: string): string {
  if (content.length <= MAX_INLINE_SIZE) return content;
  
  const lines = content.split("\n");
  const head = lines.slice(0, 20).join("\n");
  const tail = lines.slice(-20).join("\n");
  
  return `[TRUNCATED ${type}] Original size: ${(content.length / 1024).toFixed(1)}KB.
--- START ---
${head}
... (middle ${(lines.length - 40)} lines omitted) ...
--- END ---
${tail}

NOTE: The full output is saved in the sandbox. Use 'read_sandbox_ref' with the Ref ID to see specific parts.`;
}

/**
 * Sandboxes a large tool result
 */
export function sandboxResult(content: string, toolName: string): string {
  if (content.length <= MAX_INLINE_SIZE) {
    return content;
  }

  const sandboxPath = ensureSandbox();
  const refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const filePath = join(sandboxPath, `${refId}.txt`);
  
  // Save original content
  writeFileSync(filePath, content, "utf-8");
  
  // Generate summary for the context
  const summary = generateSummary(content, toolName);
  
  return `[SANDBOXED] Ref ID: ${refId}\n\n${summary}`;
}

/**
 * Reads a sandboxed result back
 */
export function readSandboxRef(refId: string): string | null {
  const sandboxPath = ensureSandbox();
  const filePath = join(sandboxPath, `${refId}.txt`);
  
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf-8");
  }
  
  return null;
}
