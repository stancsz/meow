/**
 * search.ts — File search tools
 *
 * glob: Find files by pattern
 * grep: Search file contents
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

export interface ToolResult {
  content: string;
  error?: string;
}

/**
 * glob - Find files matching a pattern
 * Uses simple recursive search or git ls-files for speed
 */
export async function glob(args: { pattern: string; cwd?: string }): Promise<ToolResult> {
  try {
    const cwd = args.cwd || process.cwd();

    // Use git ls-files if in a git repo for speed (include tracked and untracked)
    try {
      const output = execSync(
        `git ls-files -z`,
        { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      const allFiles = output.split("\0").filter(Boolean);
      // Convert glob pattern to regex - use placeholder to preserve ** before replacing *
      const pattern = args.pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "__DS__")
        .replace(/\*/g, "[^/]*")
        .replace(/__DS__/g, ".*")
        .replace(/\?/g, ".");
      const regex = new RegExp(`^${pattern}$`);
      const matched = allFiles.filter((f) => regex.test(f));
      return { content: matched.join("\n") };
    } catch {
      // Fallback to find command
      const pattern = args.pattern.replace("**/", "*").replace("**", "*");
      const output = execSync(
        `find . -name "${pattern}" -type f 2>/dev/null | head -100`,
        { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      return { content: output.trim() };
    }
  } catch (e: any) {
    return { content: "", error: `glob failed: ${e.message}` };
  }
}

/**
 * grep - Search file contents
 * Uses ripgrep if available, falls back to find + grep
 */
export async function grep(args: {
  pattern: string;
  path?: string;
  recursive?: boolean;
}): Promise<ToolResult> {
  try {
    const cwd = args.path || process.cwd();
    const pattern = args.pattern;

    // Try ripgrep first
    try {
      const flags = args.recursive !== false ? "-r" : "";
      const output = execSync(
        `rg --line-number --color=never -e "${pattern}" ${flags} "${cwd}" 2>/dev/null | head -100`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      return { content: output.trim() };
    } catch {
      // Fallback to grep
      const output = execSync(
        `grep -rn --include="*" "${pattern}" "${cwd}" 2>/dev/null | head -100`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      return { content: output.trim() };
    }
  } catch (e: any) {
    return { content: "", error: `grep failed: ${e.message}` };
  }
}

export const searchTools = {
  glob: {
    name: "glob",
    description: "Find files by name pattern. Use ** for recursive matching.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "File pattern to match (e.g., '*.ts', '**/*.js')" },
        cwd: { type: "string", description: "Working directory to search in" },
      },
      required: ["pattern"],
    },
  },
  grep: {
    name: "grep",
    description: "Search file contents using regex pattern",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file path to search in" },
        recursive: { type: "boolean", description: "Search recursively (default true)" },
      },
      required: ["pattern"],
    },
  },
};
