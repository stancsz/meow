
import { execSync } from "child_process";
import { readFile, stat } from "fs/promises";
import { join, relative, extname } from "path";
import { globby } from "globby";

/**
 * Repo Map Generator
 * 
 * Generates a compact map of the repository's structure and symbols
 * to help LLMs understand the codebase within a tight token budget.
 */

interface SymbolInfo {
  name: string;
  type: string;
  line: number;
}

const EXTENSIONS = [".ts", ".js", ".py", ".go", ".rs", ".java", ".cpp", ".h"];

// Simple regex patterns for symbol extraction
const PATTERNS: Record<string, RegExp[]> = {
  ".ts": [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g,
    /(?:export\s+)?class\s+([a-zA-Z0-9_]+)/g,
    /(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/g,
    /(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=/g,
    /(?:private|public|protected)\s+(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/g,
    /(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/g,
  ],
  ".js": [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g,
    /(?:export\s+)?class\s+([a-zA-Z0-9_]+)/g,
    /const\s+([a-zA-Z0-9_]+)\s*=/g,
    /module\.exports\s*=\s*{([^}]+)}/g,
  ],
  ".py": [
    /def\s+([a-zA-Z0-9_]+)\s*\(/g,
    /class\s+([a-zA-Z0-9_]+)\s*\(/g,
    /class\s+([a-zA-Z0-9_]+):/g,
  ],
};

const KEYWORDS = ["if", "for", "while", "switch", "catch", "import", "typeof", "super", "return", "await"];

async function extractSymbols(path: string): Promise<string[]> {
  const content = await readFile(path, "utf-8");
  const ext = extname(path);
  const patterns = PATTERNS[ext] || [];
  const lines = content.split("\n");
  const symbols: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        const symbolName = match[1]?.trim();
        if (symbolName && !KEYWORDS.includes(symbolName)) {
          // Clean up the line for the map (remove opening braces, etc.)
          let signature = line.replace(/\{$/, "").trim();
          
          // For functions, if the signature is multi-line, try to capture a bit more
          if (signature.includes("function") && !signature.includes(")") && i + 1 < lines.length) {
            signature += " " + lines[i+1].trim().replace(/\{$/, "");
          }
          
          symbols.push(signature);
          break; // Move to next line once matched
        }
      }
    }
  }
  
  return symbols.slice(0, 20); // Cap symbols per file
}

export async function generateRepoMap(cwd: string, maxFiles: number = 50): Promise<string> {
  const files = await globby(["**/*"], {
    cwd,
    ignore: ["node_modules", "dist", ".git", "build", ".meow/logs"],
    gitignore: true,
    expandDirectories: true,
    onlyFiles: true,
  });

  // Sort files by "importance" (e.g., depth and common names)
  const sortedFiles = files.sort((a, b) => {
    const aDepth = a.split("/").length;
    const bDepth = b.split("/").length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.localeCompare(b);
  }).slice(0, maxFiles);

  let output = "## REPOSITORY MAP (Signatures only)\n\n";

  for (const file of sortedFiles) {
    const ext = extname(file);
    if (!EXTENSIONS.includes(ext)) continue;
    
    try {
      const symbols = await extractSymbols(join(cwd, file));
      if (symbols.length > 0) {
        output += `│ ${file}:\n`;
        for (const symbol of symbols) {
          output += `│   ${symbol}\n`;
        }
        output += `│\n`;
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  return output;
}

// Allow running as a standalone script
if (process.argv[1] && (process.argv[1].endsWith("repo_map.ts") || process.argv[1].endsWith("repo_map.js"))) {
  const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 100;
  
  generateRepoMap(process.cwd(), limit)
    .then(map => console.log(map))
    .catch(err => console.error(err));
}
