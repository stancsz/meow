import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Deterministic paths that prefer the current working directory for generic agent use
const getAgentDir = (sub: string) => {
  const cwdDir = join(process.cwd(), ".agents", sub);
  const fallbackDir = join(__dirname, "../../.agents", sub);
  // We prefer CWD if it has the directory or if we are in a generic run
  return cwdDir; 
};

const MEMORY_DIR = getAgentDir("memory");
const MAIN_MEMORY_FILE = join(MEMORY_DIR, "memory.md");
const SOUL_DIR = getAgentDir("soul");
const MAIN_SOUL_FILE = join(SOUL_DIR, "soul.md");

export async function loadLongTermMemory(): Promise<string> {
  try {
    let memoryContent = "";
    
    // Read the main memory file
    try {
      const mainContent = await readFile(MAIN_MEMORY_FILE, "utf-8");
      memoryContent += `\n### LONG-TERM MEMORY (memory.md)\n${mainContent}\n`;
    } catch {
      // Ignore if memory.md is missing
    }
    
    // Read other logs/files in memory dir
    try {
      const files = await readdir(MEMORY_DIR);
      for (const file of files) {
        if (file.endsWith(".md") && file !== "memory.md") {
          const content = await readFile(join(MEMORY_DIR, file), "utf-8");
          memoryContent += `\n--- LOG: ${file} ---\n${content}\n`;
        }
      }
    } catch {
      // Ignore if dir is missing
    }
    
    return memoryContent || "(Memory is currently empty)";
  } catch (error) {
    console.warn("Error reading memory.");
    return "(Memory is currently empty)";
  }
}

export async function loadSoul(): Promise<string> {
  try {
    const soulContent = await readFile(MAIN_SOUL_FILE, "utf-8");
    return `\n### AGENT SOUL (soul.md)\n${soulContent}\n`;
  } catch {
    return ""; // Soul is optional
  }
}

export async function updateMemory(newInfo: string): Promise<string> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${newInfo}`;
    
    // Append to Knowledge Entries section in memory.md
    const currentMemory = await readFile(MAIN_MEMORY_FILE, "utf-8");
    
    let updatedMemory = currentMemory;
    if (currentMemory.includes("## Knowledge Entries")) {
      updatedMemory = currentMemory.replace("## Knowledge Entries", `## Knowledge Entries${entry}`);
    } else {
      updatedMemory += `\n\n## Knowledge Entries${entry}`;
    }
    
    await writeFile(MAIN_MEMORY_FILE, updatedMemory);
    return `Memory updated successfully with: "${newInfo}"`;
  } catch (error: any) {
    return `Error updating memory: ${error.message}`;
  }
}
