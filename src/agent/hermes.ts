/**
 * Hermes Agent
 *
 * Self-evolving skill specialist. Analyzes goals, identifies workflow patterns,
 * implements solutions, and extracts reusable SKILL.md files into .meow/skills/.
 *
 * Uses BrowserOS MCP for web research when needed.
 */

import type { Message } from "../types/message";
import { readFile, writeFile } from "fs/promises";
import { execSync } from "child_process";
import { basename, resolve } from "path";
import DiffMatchPatch from "diff-match-patch";
import { SkillManager } from "./skills";
import { McpManager } from "./mcp";
import { DEFAULT_TOOLS } from "../types/tool";
import { ExtensionManager } from "../extensions/ExtensionManager";
import { MeowKernel } from "../kernel/kernel";
import { QuantumMemory, MemoryResult } from "./quantum_memory";
import { QuantumReasoning } from "./quantum_reasoning";
import { MeowDatabase } from "../kernel/database";
import { Harvester, HarvestResult } from "./harvester";

export interface HermesConfig {
  model: string;
  baseUrl: string;
  apiKey?: string;
  maxRetries?: number;
  files?: string[];
  kernel: MeowKernel;
  db: MeowDatabase;
}

export class Hermes {
  private _model: string;
  private _baseUrl: string;
  private _apiKey?: string;
  private maxRetries: number;
  private messages: Message[] = [];
  private files: Set<string> = new Set();

  public skillManager: SkillManager;
  public mcpManager: McpManager;
  public extensionManager: ExtensionManager;
  public quantumMemory: QuantumMemory;
  public quantumReasoning: QuantumReasoning;
  public kernel: MeowKernel;
  public db: MeowDatabase;
  public harvester: Harvester;

  private L1_TOKEN_LIMIT = 40000;
  private currentL1Tokens = 0;

  public MONOLITH_BLUEPRINT = `
1. SINGLE WRITER PHYSICS: All state mutations (DB/Swarm) MUST go through MeowKernel. No direct writes.
2. QUANTUM PRESERVATION: Do NOT modify 'quantum_*.ts' files unless explicitly asked.
3. SERIALIZED EXECUTION: Favor simple synchronous/serial patterns. Avoid complex parallel async logic.
4. ROT RESISTANCE: Prefer Vanilla JS/TS over external dependencies. Match existing surgical style.
5. SKILL FIRST: Always check if a skill exists before implementing. Extract patterns into skills when done.
  `.trim();

  constructor(config: HermesConfig) {
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
    this.quantumReasoning = new QuantumReasoning();
    this.quantumMemory = new QuantumMemory(config.db, config.kernel, this.quantumReasoning);
    this.harvester = new Harvester(this.quantumMemory);
  }

  async chat(
    userInput: string,
    runTests: boolean = false,
    testCmd?: string,
    onStatus?: (status: string) => void
  ): Promise<string> {
    this.messages.push({ role: "user", content: userInput });
    this.updateTokenEstimate();

    if (this.currentL1Tokens > this.L1_TOKEN_LIMIT || this.messages.length > 15) {
      onStatus?.("⚛️  High-Water Mark: Offloading context to L3...");
      await this.compressAndOffload();
    }

    let lastError: string | null = null;
    let attempt = 0;
    let turn = 0;
    const MAX_TURNS = 10;

    while (attempt < this.maxRetries && turn < MAX_TURNS) {
      turn++;

      const systemPrompt = await this.buildSystemPrompt();

      if (lastError && turn > 1) {
        this.messages.push({
          role: "user",
          content: `The previous changes failed tests with this error:\n${lastError}\n\nPlease fix the code and try again.`
        });
        lastError = null;
      }

      let response = await this.callLLM(systemPrompt, this.messages);
      response = this.stripReasoningContent(response);

      if (response.includes("TOOL:")) {
        const toolMatch = response.match(/TOOL:\s*(\w+)\s*\|\s*(.*)/);
        if (toolMatch) {
          const [_, toolName, toolArgs] = toolMatch;

          const tool = DEFAULT_TOOLS.find(t => t.name === toolName) ||
                       this.extensionManager.getActiveTools().find(t => t.name === toolName);

          if (tool) {
            onStatus?.(`Using tool: ${toolName}...`);
            let result = await tool.execute(toolArgs.trim(), this as any);

            const MAX_TOOL_OUTPUT = 5000;
            if (result.length > MAX_TOOL_OUTPUT) {
              result = result.substring(0, MAX_TOOL_OUTPUT) +
                `... \n\n[Output truncated for context efficiency. Use 'read' on specific files if you need more detail.]`;
            }

            await this.quantumMemory.store(
              `Tool [${toolName}] result for query [${userInput}]: ${result.substring(0, 500)}`,
              this.mockEmbedding(userInput),
              { tool: toolName, type: "tool_output" }
            );

            this.messages.push({ role: "assistant", content: response });
            this.messages.push({ role: "user", content: `TOOL_RESULT: ${result}` });
            continue;
          }
        }
      }

      this.messages.push({ role: "assistant", content: response });
      attempt++;

      const edits = this.parseEdits(response);
      if (edits.length > 0) {
        await this.applyEdits(edits);
      }

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

    // Max retries - attempt skill distillation from failed attempts
    console.log(`⚠️ Hermes hit a roadblock after ${this.maxRetries} attempts.`);
    const distillResult = await this.harvester.harvest({
      goal: userInput,
      complexity: this.harvester.assessComplexity(userInput, attempt),
      sessionLogs: this.messages.map(m => `[${m.role}] ${m.content}`),
      successfulPatterns: [],
    });

    if (distillResult.success) {
      return `⚠️ Hermes could not complete the mission, but distilled a skill at: ${distillResult.skillPath}\nCheck the skill file for patterns learned.`;
    }

    return `❌ Hermes failed after ${this.maxRetries} attempts and could not distill a skill.`;
  }

  private stripReasoningContent(text: string): string {
    let result = text;
    const REASONING_TAGS = [
      { start: /<reasoning[^>]*>/i, end: /<\/reasoning>/i },
      { start: /<thinking[^>]*>/i, end: /<\/thinking>/i },
      { start: /<think>/i, end: /<\/think>/i },
    ];

    for (const { start, end } of REASONING_TAGS) {
      result = result.replace(start, '');
      result = result.replace(end, '');
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
    if (this._apiKey && (this._baseUrl.includes("anthropic"))) {
      const url = this._baseUrl.endsWith("/v1/messages") ? this._baseUrl : `${this._baseUrl}/v1/messages`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
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
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic-compatible endpoint error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      const textBlock = data.content?.find((c: any) => c.type === "text" && c.text);
      return textBlock?.text || "";
    }

    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages
    ];

    const url = this._baseUrl.includes("/api/chat") ? this._baseUrl : `${this._baseUrl}/api/chat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
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
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { message?: { content?: string }, choices?: { message?: { content?: string } }[] };
    return data.message?.content || data.choices?.[0]?.message?.content || "";
  }

  private getBasePrompt(): string {
    return `You are HERMES - the Skill Evolution Specialist.
Your primary mission is to solve goals AND extract successful patterns into reusable SKILL.md files.

# TOOL USE:
You have access to tools. To use a tool, output exactly: TOOL: <name> | <args>
Available Tools:
- ls | <dir>              : List files
- grep | <query>|<dir>   : Search text in local files
- browse | <url>         : Read content from a website/URL
- search | <query>       : Search the web
- read | <path>          : Read file contents
- write | <path>|<data>  : Write data to file
- run | <command>        : Execute a shell command
- distill_skill | <goal> : Extract current session patterns into a SKILL.md

# HERMES PROTOCOL:
1. ANALYZE: Understand the goal and identify the core workflow pattern
2. RESEARCH: Check for existing skills (npx skills find <topic>) before implementing
3. IMPLEMENT: Solve the goal following KARPATHY guidelines
4. DISTILL: After successful implementation, extract the workflow into .meow/skills/<skill-name>/SKILL.md
5. REPORT: Summarize changes, skill created, and verification steps

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: State assumptions explicitly
- SIMPLICITY FIRST: Minimum code that solves the problem
- SURGICAL CHANGES: Touch only what must, match existing style
- GOAL-DRIVEN: Define success criteria before starting

# MONOLITH BLUEPRINT (Rules of the House):
${this.MONOLITH_BLUEPRINT}

# SEARCH/REPLACE Block Format:
Every edit must use this format:
\`\`\`
path/to/file.ts
<<<<<<< SEARCH
old code
=======
new code
>>>>>>> REPLACE
\`\`\``;
  }

  public async buildSystemPrompt(): Promise<string> {
    const os = await import("os");
    const { readFile } = await import("fs/promises");

    let claudeMd = "";
    try {
      claudeMd = await readFile(resolve(process.cwd(), "CLAUDE.md"), "utf-8");
      claudeMd = `\n# PROJECT GUIDELINES (CLAUDE.md):\n${claudeMd}\n`;
    } catch (e) {}

    let sopMd = "";
    try {
      sopMd = await readFile(resolve(process.cwd(), ".context/SOP.md"), "utf-8");
      sopMd = `\n# STANDARD OPERATING PROCEDURES (SOP):\n${sopMd}\n`;
    } catch (e) {}

    const envInfo = `\n# CURRENT ENVIRONMENT:\n- OS: ${os.platform()} (${os.type()} ${os.release()})\n- Arch: ${os.arch()}\n- CWD: ${process.cwd()}\n`;

    await this.skillManager.discover();
    await this.extensionManager.discover();

    const skillsPrompt = this.skillManager.getSkillsPrompt();
    const extensionsPrompt = this.extensionManager.getExtensionsPrompt();

    let prompt = this.getBasePrompt() + envInfo + claudeMd + sopMd + skillsPrompt + extensionsPrompt;

    try {
      const { execSync } = await import("child_process");
      const files = execSync("git ls-files", { encoding: "utf-8" });
      prompt += `\n\n# Available Files in Repo (Git Tracked):\n${files.split('\n').slice(0, 50).join('\n')}\n`;
    } catch (e) {}

    if (this.files.size > 0) {
      prompt += "\n\n# Files in chat (Surgically Selected):\n";
      for (const file of this.files) {
        try {
          const content = await readFile(file, "utf-8");
          const filename = basename(file);
          prompt += `\n## ${filename}\n\`\`\`\n${content}\n\`\`\`\n`;
        } catch (e) {}
      }
    }

    return prompt;
  }

  private mockEmbedding(text: string): number[] {
    const arr = new Array(1536).fill(0);
    const words = text.toLowerCase().split(/\W+/);

    words.forEach(word => {
      if (!word) return;
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % 1536;
      arr[idx] += 1;
    });

    if (arr.every(v => v === 0)) {
      arr[0] = 0.0001;
    }

    const magnitude = Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0)) || 1;
    return arr.map(v => v / magnitude);
  }

  private parseEdits(response: string): Array<{ path: string; original: string; updated: string }> {
    const edits: Array<{ path: string; original: string; updated: string }> = [];
    const lines = response.split('\n');

    const HEAD_PATTERN = /^<{5,9} SEARCH>?\s*$/;
    const DIVIDER_PATTERN = /^={5,9}\s*$/;
    const UPDATED_PATTERN = /^>{5,9} REPLACE\s*$/;

    let i = 0;
    while (i < lines.length) {
      if (HEAD_PATTERN.test(lines[i].trim())) {
        let filename: string | null = null;
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const stripped = lines[j].trim();
          if (stripped && !stripped.startsWith('```') && !stripped.startsWith('#')) {
            filename = stripped.replace(/^#\s*/, '').trim();
            break;
          }
        }

        if (filename && i + 1 < lines.length && DIVIDER_PATTERN.test(lines[i + 1].trim())) {
          i += 2;
          const updated = this.collectUntilMarker(lines, i, UPDATED_PATTERN);
          if (updated) {
            edits.push({ path: filename, original: "", updated: updated.text });
            i = updated.endIndex;
          }
        } else if (filename) {
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

  private async applyEdits(edits: Array<{ path: string; original: string; updated: string }>): Promise<void> {
    for (const edit of edits) {
      try {
        if (edit.original === "") {
          await writeFile(edit.path, edit.updated);
          console.log(`✓ Created new file: ${edit.path}`);
        } else {
          let content: string;
          try {
            content = await readFile(edit.path, "utf-8");
          } catch {
            console.error(`Error: Could not read file ${edit.path}`);
            continue;
          }

          const idx = content.indexOf(edit.original);
          if (idx !== -1) {
            const newContent = content.substring(0, idx) + edit.updated + content.substring(idx + edit.original.length);
            await writeFile(edit.path, newContent);
            console.log(`✓ Updated: ${edit.path}`);
          } else {
            console.error(`Error: Could not match SEARCH block in ${edit.path}`);
          }
        }
      } catch (e) {
        console.error(`Error applying edit to ${edit.path}:`, e);
      }
    }
  }

  private extractError(testOutput: string): string {
    const lines = testOutput.split('\n');
    const errorLines: string[] = [];

    for (const line of lines) {
      if (line.includes("error") || line.includes("Error") ||
          line.includes("failed") || line.includes("FAILED") ||
          line.includes("AssertionError")) {
        errorLines.push(line);
      }
    }

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

  private updateTokenEstimate() {
    const text = this.messages.map(m => m.content).join(" ");
    this.currentL1Tokens = Math.ceil(text.length / 4);
  }

  public async compressAndOffload(): Promise<void> {
    const offloadCount = Math.floor(this.messages.length / 2);
    if (offloadCount < 2) return;

    const toOffload = this.messages.splice(0, offloadCount);
    const rawContent = toOffload.map(m => `[${m.role}] ${m.content}`).join("\n");

    const anchorPrompt = `Summarize the following conversation history into a single dense paragraph for long-term archival. Include all key technical decisions and state changes:\n\n${rawContent}`;
    const summary = await this.callLLM("You are a context compression engine.", [{ role: "user", content: anchorPrompt }]);

    await this.quantumMemory.store(
      `CONTEXT_ANCHOR: ${summary}`,
      this.mockEmbedding(summary),
      { type: "archived_context", original_length: rawContent.length }
    );

    this.messages.unshift({
      role: "system",
      content: `[SEMANTIC ANCHOR - ARCHIVED HISTORY]: ${summary}\n(Full details available in L3 via recall)`
    });

    this.updateTokenEstimate();
  }

  clearHistory() {
    this.messages = [];
    this.currentL1Tokens = 0;
  }

  setModel(model: string) {
    this._model = model;
    this.messages = [];
  }
}
