// Agent - Core chat logic with Ollama

import type { Message } from "../types/message";
import { readFile, writeFile } from "fs/promises";
import { execSync } from "child_process";
import { basename } from "path";
import DiffMatchPatch from "diff-match-patch";
import { SkillManager } from "./skills";
import { McpManager } from "./mcp";
import { resolve } from "path";

import { summon } from "./summoner";
import { DEFAULT_TOOLS, Tool } from "../types/tool";
import { ExtensionManager } from "../extensions/ExtensionManager";
import { MeowKernel } from "../kernel/kernel";
import { QuantumMemory } from "./quantum_memory";
import { QuantumReasoning } from "./quantum_reasoning";
import { MeowDatabase } from "../kernel/database";

export interface AgentConfig {
  model: string;
  baseUrl: string;
  apiKey?: string;
  maxRetries?: number;
  files?: string[];
  kernel: MeowKernel;
  db: MeowDatabase;
}

export interface EditBlock {
  path: string;
  original: string;
  updated: string;
}

// Regex patterns for SEARCH/REPLACE block parsing
const HEAD_PATTERN = /^<{5,9} SEARCH>?\s*$/;
const DIVIDER_PATTERN = /^={5,9}\s*$/;
const UPDATED_PATTERN = /^>{5,9} REPLACE\s*$/;

// Reasoning tag patterns (for models like Deepseek)
const REASONING_TAGS = [
  { start: /<reasoning[^>]*>/i, end: /<\/reasoning>/i },
  { start: /<thinking[^>]*>/i, end: /<\/thinking>/i },
  { start: /<think>/i, end: /<\/think>/i },
];

export class Agent {
  private _model: string;
  private _baseUrl: string;
  private _apiKey?: string;
  private maxRetries: number;
  private messages: Message[] = [];
  private files: Set<string> = new Set();
  private editedFiles: Set<string> = new Set();

  public skillManager: SkillManager;
  public mcpManager: McpManager;
  public extensionManager: ExtensionManager;
  public quantumMemory: QuantumMemory;
  public quantumReasoning: QuantumReasoning;
  public kernel: MeowKernel;
  public db: MeowDatabase;

  constructor(config: AgentConfig) {
    this._model = config.model;
    this._baseUrl = config.baseUrl;
    this.maxRetries = config.maxRetries || 3;
    this._apiKey = config.apiKey;
    if (config.files) {
      config.files.forEach(f => this.files.add(f));
    }
    
    this.skillManager = new SkillManager();
    this.mcpManager = new McpManager();
    this.extensionManager = new ExtensionManager();
    this.kernel = config.kernel;
    this.db = config.db;
    this.quantumMemory = new QuantumMemory(config.db, config.kernel);
    this.quantumReasoning = new QuantumReasoning();
  }

  async chat(
    userInput: string, 
    runTests: boolean = false, 
    testCmd?: string,
    onStatus?: (status: string) => void
  ): Promise<string> {
    this.messages.push({ role: "user", content: userInput });
    
    // Aggressive Context Management: Check for compaction every 10 messages
    if (this.messages.length > 10) {
      onStatus?.("⚛️  Compacting context...");
      await this.compactHistory();
    }
    
    // Semantic Retrieval: Fetch relevant quantum context for this turn
    onStatus?.("⚛️  Recall: Fetching relevant context...");
    const relevantMemories = await this.quantumMemory.recall(this.mockEmbedding(userInput));
    if (relevantMemories.length > 0) {
      const memoryPrompt = `\n# RECALLED QUANTUM CONTEXT (Relevant Historical Snippets):\n${relevantMemories.map(m => `- ${m.content}`).join("\n")}\n`;
      this.messages.push({ role: "system", content: memoryPrompt });
    }
    
    let lastError: string | null = null;
    let attempt = 0;
    let turn = 0;
    const MAX_TURNS = 10;
    
    while (attempt < this.maxRetries && turn < MAX_TURNS) {
      turn++;
      
      const systemPrompt = await this.buildSystemPrompt();
      
      // Add previous test error feedback if available
      if (lastError && turn > 1) {
        this.messages.push({ 
          role: "user", 
          content: `The previous changes failed tests with this error:\n${lastError}\n\nPlease fix the code and try again.` 
        });
        lastError = null; // Clear it so we don't repeat the message
      }
      
      let response = await this.callLLM(systemPrompt, this.messages);
      
      // Remove reasoning/thinking content if present
      response = this.stripReasoningContent(response);
      
      // Check for Tool Calls
      if (response.includes("TOOL:")) {
        const toolMatch = response.match(/TOOL:\s*(\w+)\s*\|\s*(.*)/);
        if (toolMatch) {
          const [_, toolName, toolArgs] = toolMatch;
          
          // Search in core tools and active extension tools
          const tool = DEFAULT_TOOLS.find(t => t.name === toolName) || 
                       this.extensionManager.getActiveTools().find(t => t.name === toolName);

          if (tool) {
            onStatus?.(`Using tool: ${toolName}...`);
            let result = await tool.execute(toolArgs.trim(), this);
            
            // Context Pruning: Cap large tool outputs
            const MAX_TOOL_OUTPUT = 5000;
            if (result.length > MAX_TOOL_OUTPUT) {
              result = result.substring(0, MAX_TOOL_OUTPUT) + 
                `... \n\n[Output truncated for context efficiency. Use 'read' on specific files if you need more detail.]`;
            }

            // Archive tool result in Quantum Memory for future recall
            await this.quantumMemory.store(
              `Tool [${toolName}] result for query [${userInput}]: ${result.substring(0, 500)}`,
              this.mockEmbedding(userInput),
              { tool: toolName, type: "tool_output" }
            );

            this.messages.push({ role: "assistant", content: response });
            this.messages.push({ role: "user", content: `TOOL_RESULT: ${result}` });
            continue; // This is a free turn for tool usage
          }
        }
      }

      this.messages.push({ role: "assistant", content: response });
      
      // If we got here without a tool call, we count it as an attempt
      attempt++;
      
      // Parse and apply edits from response
      const edits = this.parseEdits(response);
      if (edits.length > 0) {
        await this.applyEdits(edits);
      }
      
      // Run tests if requested and we have edits
      if (runTests && edits.length > 0) {
        const testResult = await this.runTests(testCmd);
        const passed = !testResult.includes("failed") && !testResult.includes("error");
        
        if (passed) {
          return response;
        } else {
          lastError = this.extractError(testResult);
          continue;
        }
      }
      
      return response;
    }
    
    // Max retries reached - Summon external help
    console.log(`⚠️ Meow hit a roadblock after ${this.maxRetries} attempts.`);
    
    const escalationResult = await summon("aider", {
      goal: userInput,
      files: Array.from(this.files),
      lastError: lastError || "Unknown issue",
      attempt: attempt,
      existingSkills: this.skillManager.getSkillNames()
    });
    
    return escalationResult;
  }

  /**
   * Remove reasoning/thinking content from model response.
   * Models like Deepseek use tags like <reasoning> or <thinking>.
   */
  private stripReasoningContent(text: string): string {
    let result = text;
    
    // Remove content between reasoning tags using array of patterns
    for (const { start, end } of REASONING_TAGS) {
      // First remove the tags themselves
      result = result.replace(start, '');
      result = result.replace(end, '');
      
      // Then remove any content between matching tags
      const pattern = new RegExp(start.source + '[\\s\\S]*?' + end.source, 'gi');
      result = result.replace(pattern, '');
    }
    
    return result.trim();
  }

  addFile(path: string) {
    this.files.add(path);
  }

  dropFile(path: string) {
    this.files.delete(path);
  }

  getFiles(): string[] {
    return Array.from(this.files);
  }

  get model(): string { return this._model; }
  get baseUrl(): string { return this._baseUrl; }
  get apiKey(): string | undefined { return this._apiKey; }

  public async callLLM(systemPrompt: string, messages: Message[]): Promise<string> {
    // If we have an API key and the URL looks like an Anthropic-compatible endpoint, use that format
    if (this._apiKey && (this._baseUrl.includes("anthropic"))) {
      const url = this._baseUrl.endsWith("/v1/messages") ? this._baseUrl : `${this._baseUrl}/v1/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this._apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this._model,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic-compatible endpoint error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      
      // Find the first content block that contains text
      const textBlock = data.content?.find((c: any) => c.type === "text" && c.text);
      const text = textBlock?.text || "";
      
      return text;
    }

    // Default to Ollama/OpenAI-compatible format
    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages
    ];

    const url = this._baseUrl.includes("/api/chat") ? this._baseUrl : `${this._baseUrl}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(this._apiKey ? { "Authorization": `Bearer ${this._apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this._model,
        messages: fullMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { message?: { content?: string }, choices?: { message?: { content?: string } }[] };
    return data.message?.content || data.choices?.[0]?.message?.content || "";
  }

  private getBasePrompt(): string {
    return `You are an expert software developer.
Always use best practices when coding.
Respect and use existing conventions, libraries, etc that are already present in the code base.

Take requests for changes to the supplied code.
If the request is ambiguous, ask questions.

# TOOL USE:
You have access to tools. To use a tool, output exactly: TOOL: <name> | <args>
Available Tools:
- ls | <dir>              : List files (STRICTLY use this for listing, do NOT use 'run | ls')
- grep | <query>|<dir>    : Search text in local files (STRICTLY use this, do NOT use 'run | grep')
- browse | <url>           : Read content from a website/URL
- search | <query>         : Search the web for info (Google/DDG style)
- read | <path>           : Read file contents
- write | <path>|<data>   : Write data to file
- diff                    : Show uncommitted changes in the repo
- run | <command>         : Execute a shell command (ONLY for specialized tasks like 'npm test')
- summon | <agent>|<goal> : Summon a level-2 specialist (claude|aider) for complex tasks or roadblocks
- activate_extension | <name> : Load a specialized extension into the session

Example: TOOL: ls | .

# EXPLORATION & RESILIENCE:
- Be curious. If you don't see what you need, use tools to find it.
- If a tool call fails, do NOT give up. Try a different approach or a different command.
- If you are on Windows and a Linux-style command fails, try the Windows equivalent (and vice versa).
- Your goal is to solve the task autonomously. Only ask the user for help as a last resort after trying multiple strategies.
- If you're stuck in a loop, pivot your strategy entirely.
- You have **Terminal Sovereignty**: feel free to use the \`run\` tool to create directories, run build scripts, check environment variables, or even write and execute temporary scripts to process data.

Once you understand the request and have explored the repo, you MUST use *SEARCH/REPLACE blocks* to describe changes.

# SEARCH/REPLACE Block Rules:
Every SEARCH/REPLACE block must use this format:
1. The FULL file path alone on a line, verbatim.
2. The opening fence and code language, eg: \`\`\`
3. The start of search block: <<<<<<< SEARCH
4. A contiguous chunk of lines to search for
5. The dividing line: =======
6. The lines to replace
7. The end of the replace block: >>>>>>> REPLACE
8. The closing fence: \`\`\`

IMPORTANT: Do NOT include any <reasoning> or <thinking> tags in your response.
ONLY EVER RETURN CODE IN A SEARCH/REPLACE BLOCK!

# KARPATHY GUIDELINES
- **Think Before Coding**: State assumptions explicitly. Surface tradeoffs. Don't hide confusion. If uncertain, ask.
- **Simplicity First**: Minimum code that solves the problem. No abstractions for single-use code. Push back on overcomplication.
- **Surgical Changes**: Touch only what you must. Match existing style. Don't refactor things that aren't broken.
- **Goal-Driven Execution**: Define success criteria (e.g. "Write test, then make pass"). Loop until verified.`;
  }

  public async buildSystemPrompt(): Promise<string> {
    const os = await import("os");
    const { readFile } = await import("fs/promises");
    
    let claudeMd = "";
    try {
      claudeMd = await readFile(resolve(process.cwd(), "CLAUDE.md"), "utf-8");
      claudeMd = `\n# PROJECT GUIDELINES (CLAUDE.md):\n${claudeMd}\n`;
    } catch (e) {
      // No CLAUDE.md found
    }

    const envInfo = `\n# CURRENT ENVIRONMENT:\n- OS: ${os.platform()} (${os.type()} ${os.release()})\n- Arch: ${os.arch()}\n- Shell: ${process.env.SHELL || (os.platform() === "win32" ? "PowerShell/cmd.exe" : "Unknown")}\n- CWD: ${process.cwd()}\n`;
    
    // Discover Skills and Extensions
    await this.skillManager.discover();
    await this.extensionManager.discover();

    const skillsPrompt = this.skillManager.getSkillsPrompt();
    const extensionsPrompt = this.extensionManager.getExtensionsPrompt();

    let prompt = this.getBasePrompt() + envInfo + claudeMd + skillsPrompt + extensionsPrompt;

    // Add Repo Context (List files using Git)
    try {
      const { execSync } = await import("child_process");
      const files = execSync("git ls-files", { encoding: "utf-8" });
      prompt += `\n\n# Available Files in Repo (Git Tracked):\n${files.split('\n').slice(0, 50).join('\n')}\n`;
    } catch (e) {
      // Fallback for non-git repos
      try {
        const { execSync } = await import("child_process");
        const cmd = process.platform === "win32" ? "dir /b" : "ls";
        const files = execSync(cmd, { encoding: "utf-8" });
        prompt += `\n\n# Available Files (Local):\n${files}\n`;
      } catch (e2) {}
    }

    // Add file contents (Selective Pruning)
    if (this.files.size > 0) {
      prompt += "\n\n# Files in chat (Surgically Selected):\n";
      for (const file of this.files) {
        try {
          // If we have many files, only include the most relevant ones (e.g. recently edited or mentioned)
          // For now, we include all files explicitly added by the user, 
          // but we will prioritize them in future iterations.
          const content = await readFile(file, "utf-8");
          const filename = basename(file);
          prompt += `\n## ${filename}\n\`\`\`\n${content}\n\`\`\`\n`;
        } catch (e) {
          // File might not exist yet
        }
      }
    }

    return prompt;
  }

  /**
   * Helper to generate a mock embedding for semantic search in simulation.
   * In a real system, this would call an embedding model.
   */
  private mockEmbedding(text: string): number[] {
    const arr = new Array(1536).fill(0);
    // Deterministic mock embedding based on char codes
    for (let i = 0; i < text.length; i++) {
      arr[i % 1536] += text.charCodeAt(i) / 255;
    }
    return arr;
  }

  private parseEdits(response: string): EditBlock[] {
    const edits: EditBlock[] = [];
    const lines = response.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      // Look for SEARCH block start
      if (HEAD_PATTERN.test(lines[i].trim())) {
        // Get filename from previous lines
        let filename: string | null = null;
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const stripped = lines[j].trim();
          if (stripped && !stripped.startsWith('```') && !stripped.startsWith('#')) {
            filename = stripped.replace(/^#\s*/, '').trim();
            break;
          }
        }
        
        if (filename && i + 1 < lines.length && DIVIDER_PATTERN.test(lines[i + 1].trim())) {
          // New file case - empty SEARCH
          i += 2;
          const updated = this.collectUntilMarker(lines, i, UPDATED_PATTERN);
          if (updated) {
            edits.push({ path: filename, original: "", updated: updated.text });
            i = updated.endIndex;
          }
        } else if (filename) {
          // Collect original
          i++;
          const original = this.collectUntilMarker(lines, i, DIVIDER_PATTERN);
          if (original) {
            i = original.endIndex + 1;
            const updated = this.collectUntilMarker(lines, i, UPDATED_PATTERN);
            if (updated) {
              edits.push({ path: filename, original: original.text, updated: updated.text });
              i = updated.endIndex;
            }
          }
        }
      }
      i++;
    }
    
    return edits;
  }

  private collectUntilMarker(lines: string[], startIdx: number, endPattern: RegExp): { text: string; endIndex: number } | null {
    const collected: string[] = [];
    let i = startIdx;
    while (i < lines.length) {
      if (endPattern.test(lines[i].trim())) {
        return { text: collected.join('\n'), endIndex: i };
      }
      collected.push(lines[i]);
      i++;
    }
    return null;
  }

  private async applyEdits(edits: EditBlock[]): Promise<void> {
    for (const edit of edits) {
      try {
        if (edit.original === "") {
          // Create new file
          await writeFile(edit.path, edit.updated);
          this.editedFiles.add(edit.path);
          console.log(`✓ Created new file: ${edit.path}`);
        } else {
          // Modify existing file - find and replace
          let content: string;
          try {
            content = await readFile(edit.path, "utf-8");
          } catch {
            console.error(`Error: Could not read file ${edit.path}`);
            continue;
          }

          // Try exact match first
          let newContent = this.replaceExact(content, edit.original, edit.updated);
          
          // If exact match fails, try with flexible whitespace
          if (!newContent) {
            newContent = this.replaceWithWhitespace(content, edit.original, edit.updated);
          }
          
          // If whitespace matching fails, try diff-match-patch
          if (!newContent) {
            newContent = this.applyDmpLinesPatch(content, edit.original, edit.updated);
          }

          if (newContent) {
            await writeFile(edit.path, newContent);
            this.editedFiles.add(edit.path);
            console.log(`✓ Updated: ${edit.path}`);
          } else {
            console.error(`Error: Could not match SEARCH block in ${edit.path}`);
            console.error("SEARCH block:");
            console.error(edit.original);
          }
        }
      } catch (e) {
        console.error(`Error applying edit to ${edit.path}:`, e);
      }
    }
  }

  private replaceExact(content: string, original: string, updated: string): string | null {
    const idx = content.indexOf(original);
    if (idx === -1) return null;
    return content.substring(0, idx) + updated + content.substring(idx + original.length);
  }

  private replaceWithWhitespace(content: string, original: string, updated: string): string | null {
    const originalLines = original.split('\n');
    const contentLines = content.split('\n');
    
    // Try to find match with flexible whitespace
    for (let i = 0; i <= contentLines.length - originalLines.length; i++) {
      let matches = true;
      for (let j = 0; j < originalLines.length; j++) {
        if (originalLines[j].trim() !== contentLines[i + j].trim()) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        // Found match - replace preserving original indentation
        const leadingWhitespace = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = updated.split('\n').map((line) => {
          if (line.trim()) {
            return leadingWhitespace + line;
          }
          return line;
        });
        
        const before = contentLines.slice(0, i);
        const after = contentLines.slice(i + originalLines.length);
        return [...before, ...newLines, ...after].join('\n');
      }
    }
    
    return null;
  }

  /**
   * Try to apply edits using diff-match-patch for fuzzy matching.
   * This handles cases where the SEARCH block has slight differences
   * from the actual content (e.g., indentation, whitespace changes).
   */
  private applyDmpPatch(content: string, original: string, updated: string): string | null {
    const dmp = new DiffMatchPatch();
    dmp.Diff_Timeout = 5;
    
    // Create patch from original to updated
    const diffs = dmp.diff_main(original, updated);
    dmp.diff_cleanupSemantic(diffs);
    
    const patches = dmp.patch_make(original, diffs);
    const [patchedContent, results] = dmp.patch_apply(patches, content);
    
    // Check if all patches applied successfully
    const allSuccess = results.every(r => r);
    
    if (allSuccess) {
      return patchedContent;
    }
    
    // Try line-based matching for better results
    return this.applyDmpLinesPatch(content, original, updated);
  }

  /**
   * Line-based diff-match-patch for more robust matching.
   * Handles cases where content has been reformatted.
   */
  private applyDmpLinesPatch(content: string, original: string, updated: string): string | null {
    const dmp = new DiffMatchPatch();
    dmp.Diff_Timeout = 5;
    dmp.Match_Threshold = 0.5;
    dmp.Match_Distance = 1000;
    dmp.Patch_Margin = 4;
    
    // Find position of original in content using semantic matching
    const originalLines = original.split('\n');
    const contentLines = content.split('\n');
    
    // Look for a good matching position
    let bestMatchIdx = -1;
    let bestMatchCount = 0;
    
    for (let i = 0; i <= contentLines.length - originalLines.length; i++) {
      let matchCount = 0;
      for (let j = 0; j < originalLines.length; j++) {
        const origTrimmed = originalLines[j].trim();
        const contentTrimmed = contentLines[i + j]?.trim();
        if (origTrimmed === contentTrimmed) {
          matchCount++;
        }
      }
      if (matchCount > bestMatchCount && matchCount >= originalLines.length * 0.6) {
        bestMatchCount = matchCount;
        bestMatchIdx = i;
      }
    }
    
    if (bestMatchIdx === -1) {
      return null;
    }
    
    // Extract the matched section and create a new version with the updated content
    const beforeLines = contentLines.slice(0, bestMatchIdx);
    const matchedLines = contentLines.slice(bestMatchIdx, bestMatchIdx + originalLines.length);
    const afterLines = contentLines.slice(bestMatchIdx + originalLines.length);
    
    // Align updated content with matched content indentation
    const leadingWhitespace = matchedLines[0].match(/^\s*/)?.[0] || '';
    const updatedLines = updated.split('\n').map((line) => {
      if (line.trim()) {
        return leadingWhitespace + line;
      }
      return line;
    });
    
    return [...beforeLines, ...updatedLines, ...afterLines].join('\n');
  }

  private extractError(testOutput: string): string {
    // Extract the most relevant error lines from test output
    const lines = testOutput.split('\n');
    const errorLines: string[] = [];
    
    for (const line of lines) {
      if (line.includes("error") || line.includes("Error") || 
          line.includes("failed") || line.includes("FAILED") ||
          line.includes("AssertionError")) {
        errorLines.push(line);
      }
    }
    
    // Return last 20 lines of errors or all if less than 20
    return errorLines.slice(-20).join('\n') || "Unknown error";
  }

  async runTests(testCmd?: string): Promise<string> {
    try {
      const result = execSync(testCmd || "npm test", { 
        encoding: "utf-8",
        cwd: process.cwd(),
        timeout: 60000
      });
      return result;
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'stdout' in e) {
        return String((e as { stdout?: unknown }).stdout || '');
      }
      return String(e);
    }
  }

  private async compactHistory(): Promise<void> {
    const summaryPrompt = `Summarize our progress so far into a "Progress Snapshot" with these sections:
## Goal: [Short summary of task]
## Progress: [Done, In Progress, Blocked]
## Key Decisions: [Crucial technical choices]
## Relevant Files: [List of files involved]

Keep it terse and accurate.`;

    const summary = await this.callLLM(
      await this.buildSystemPrompt(), 
      [...this.messages, { role: "user", content: summaryPrompt }]
    );
    
    // Keep only the last 4 messages and the new summary
    const tail = this.messages.slice(-4);
    this.messages = [
      { role: "user", content: `PROGRESS SNAPSHOT OF PAST TURNS:\n${summary}` },
      ...tail
    ];
  }

  clearHistory() {
    this.messages = [];
  }

  setModel(model: string) {
    this._model = model;
    this.messages = [];
  }

  getEditedFiles(): string[] {
    return Array.from(this.editedFiles);
  }
}