/**
 * mine.ts — Memory Mining Skill
 *
 * Implements the "MemPalace" mining flow: verbatim storage of files
 * and conversations into the structured Palace hierarchy.
 *
 * Concepts:
 * - Wing: High-level scope (e.g., project name)
 * - Room: Mid-level scope (e.g., "code", "docs", "sessions")
 * - Drawer: Specific source (e.g., file path, session ID)
 */

import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { globSync } from "glob";
import { storeMemory } from "../sidecars/memory-fts";

export interface MineOptions {
  wing?: string;
  room?: string;
  recursive?: boolean;
  ignorePatterns?: string[];
}

/**
 * Mines a project directory into the Palace.
 */
export async function mineProject(projectPath: string, options: MineOptions = {}): Promise<number> {
  const wing = options.wing || basename(projectPath);
  const room = options.room || "code";
  
  const files = globSync("**/*", {
    cwd: projectPath,
    nodir: true,
    ignore: options.ignorePatterns || ["node_modules/**", ".git/**", "dist/**"]
  });

  let count = 0;
  for (const file of files) {
    try {
      const fullPath = join(projectPath, file);
      const content = readFileSync(fullPath, "utf-8");
      
      storeMemory(file, content, {
        wing,
        room,
        drawer: file,
        source: "import",
        tags: ["mined", "verbatim"]
      });
      count++;
    } catch (e) {
      console.error(`[mine] Failed to mine ${file}:`, e);
    }
  }

  return count;
}

/**
 * Mines a conversation session into the Palace.
 */
export async function mineSession(sessionId: string, sessionLog: string, wing: string): Promise<void> {
  storeMemory(`session_${sessionId}`, sessionLog, {
    wing,
    room: "history",
    drawer: sessionId,
    source: "session",
    tags: ["mined", "verbatim", "session"]
  });
}
