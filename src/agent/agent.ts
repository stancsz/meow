import type { Message } from "../types/message";
import { readFile, writeFile } from "fs/promises";
import { execSync } from "child_process";
import { basename } from "path";
import DiffMatchPatch from "diff-match-patch";
import { SkillManager } from "./skills";
import { McpManager } from "./mcp";
import { DiscoveryModule } from "./discovery";
import { resolve } from "path";
import { v4 as uuidv4 } from "uuid";

import { summon } from "./summoner";
import { DEFAULT_TOOLS } from "../types/tool";
import { ExtensionManager } from "../extensions/ExtensionManager";
import { MeowKernel } from "../kernel/kernel";
import { AgenticMemory, MemoryResult } from "./memory";
import { ReasoningEngine } from "./reasoning";
import { MeowDatabase } from "../kernel/database";
import { config } from "../config/env";
import { embed } from "./embeddings";
import { DatabasePort } from "../extensions/database/manifest";
import { AuditLogger } from "../kernel/audit";
import pc from "picocolors";

export interface AgentConfig {
  model: string;
  baseUrl: string;
  apiKey?: string;
  maxRetries?: number;
  files?: string[];
  kernel: MeowKernel;
  db: DatabasePort | MeowDatabase;
  seed?: number;
  deterministic?: boolean;
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

// Unified diff patterns (udiff format - more compact)
const UDIFF_PATTERN = /^---?\s/m;
const UDIFF_HUNK_PATTERN = /^@@\s*[-+]\d+,\d+\s*[+]\d+,\d+\s*@@/gm;

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
  public discoveryModule: DiscoveryModule;
  public extensionManager: ExtensionManager;
  public agenticMemory: AgenticMemory;
  public reasoningEngine: ReasoningEngine;
  public kernel: MeowKernel;
  public db: MeowDatabase;

  private L1_TOKEN_LIMIT = 40000; // The Reasoning Sweet Spot
  private currentL1Tokens = 0;
  private lintFixAttempts = 0;
  private LINT_FIX_LOOP_MAX = 3; // Cap recovery attempts to prevent token burning

  public MONOLITH_BLUEPRINT = `
1. SINGLE WRITER PHYSICS: All state mutations (DB/Swarm) MUST go through MeowKernel. No direct writes.
2. AGENTIC MEMORY PRESERVATION: Do NOT modify 'agentic_*.ts' files unless explicitly asked.
3. SERIALIZED EXECUTION: Favor simple synchronous/serial patterns. Avoid complex parallel async logic.
4. ROT RESISTANCE: Prefer Vanilla JS/TS over external dependencies. Match existing surgical style.
  `.trim();

  // Priority 1: Reproducibility + Observability
  public runId: string;
  public auditLogger: AuditLogger;
  private totalCostCents: number = 0;
  private recentActions: string[] = []; // For loop detection

  constructor(config: AgentConfig) {
    this._model = config.model;
    this._baseUrl = config.baseUrl;
    this.maxRetries = config.maxRetries || 3;
    this._apiKey = config.apiKey;
    if (config.files) {
      config.files.forEach(f => this.files.add(f));
    }

    // Start a new run for this session
    this.runId = uuidv4();
    const meowDb = config.db as any;
    if (meowDb && typeof meowDb.startRun === "function") {
      meowDb.startRun(this.runId, "mission", config.seed, config.deterministic);
    }
    this.auditLogger = new AuditLogger(this.runId);

    this.skillManager = new SkillManager();
    this.mcpManager = new McpManager();
    this.discoveryModule = new DiscoveryModule();
    this.extensionManager = new ExtensionManager();
    this.kernel = config.kernel;
    this.db = config.db as any;
    this.reasoningEngine = new ReasoningEngine();
    this.agenticMemory = new AgenticMemory(config.db, config.kernel, this.reasoningEngine);
  }

  // ── Priority 1: Budget enforcement ──────────────────────────────────────
  private checkBudget(): void {
    const budget = config.budgetCents;
    if (budget && this.totalCostCents >= budget) {
      this.auditLogger.error("budget", `Budget exceeded: ${this.totalCostCents}¢ >= ${budget}¢`);
      const meowDb = this.db as any;
      if (meowDb && typeof meowDb.endRun === "function") {
        meowDb.endRun(this.runId, "budget_exceeded");
      }
      throw new Error(`Budget exceeded: ${this.totalCostCents.toFixed(4)}¢ >= ${budget}¢. Checkpoint saved.`);
    }
  }

  async chat(
    userInput: string, 
    runTests: boolean = false,
    testCmd?: string,
    onStatus?: (status: string) => void
  ): Promise<string> {
    this.messages.push({ role: "user", content: userInput });
    this.updateTokenEstimate();
    
    // Tiered Context Management: High-Water Mark Detection
    if (this.currentL1Tokens > this.L1_TOKEN_LIMIT || this.messages.length > 15) {
      onStatus?.("→ [Memory] Offloading context to L3...");
      await this.compressAndOffload();
    }
    
    let lastError: string | null = null;
    let attempt = 0;
    let turn = 0;
    const MAX_TURNS = 10;
    // MEOW-3-RULE: reset attempt counter on new task, so each task gets fresh 3 tries
    this.lintFixAttempts = 0;
    
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

            // LINT-FIX LOOP: Detect failures from run/lint/test tools
            const runToolName = toolName.toLowerCase();
            if (runToolName === "run" || runToolName === "test") {
              const errorDetected = this.detectRunFailure(result);
              if (errorDetected && this.lintFixAttempts < this.LINT_FIX_LOOP_MAX) {
                this.lintFixAttempts++;
                const fixPrompt = this.buildSurgicalFixPrompt(result, toolArgs.trim());
                this.messages.push({ role: "assistant", content: response });
                this.messages.push({ role: "user", content: fixPrompt });
                onStatus?.(`🔧 [LINT-FIX LOOP] Error detected (${this.lintFixAttempts}/${this.LINT_FIX_LOOP_MAX}). Prompting fix...`);
                continue; // Free recovery turn
              } else if (errorDetected && this.lintFixAttempts >= this.LINT_FIX_LOOP_MAX) {
                console.log(pc.yellow(`⚠️ [LINT-FIX LOOP] Max recovery attempts (${this.LINT_FIX_LOOP_MAX}) reached. Flagging for human review.`));
                result += "\n\n[RECOVERY LOOP EXHAUSTED - Manual intervention required]";
              }
            }

            // Archive tool result in Agentic Memory for future recall
            await this.agenticMemory.store(
              `Tool [${toolName}] result for query [${userInput}]: ${result.substring(0, 500)}`,
              { tool: toolName, type: "tool_output" },
              await embed(result.substring(0, 100))
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
          // MEOW succeeded — record for metrics, reset failure counter
          this.kernel.push({ type: "SET_STATE", key: `task:${userInput.substring(0, 50)}:success`, value: Date.now() });
          this.recordTaskOutcome(userInput, 'success');
          return response;
        } else {
          lastError = this.extractError(testResult);
          continue;
        }
      }

      this.recordTaskOutcome(userInput, 'success');
      return response;
    }

    // MEOW-3-RULE: MEOW tried maxRetries times and failed.
    // claude -p is NOT a fallback to finish the task.
    // claude -p is ONLY called to FIX MEOW (patch the tool/prompt/logic that caused the failure).
    // After patching, the task is marked needs_retry — USER re-invokes MEOW with the same task.
    
    console.log(`⚠️ MEOW failed after ${this.maxRetries} attempts. Root cause analysis → claude -p (fix MEOW only, NOT task).`);
    
    const fixResult = await this.fixMeow({ userInput, lastError, attempt, runTests, testCmd });
    
    // Return the repair report, NOT the task result
    this.recordTaskOutcome(userInput, 'failure', lastError ?? undefined);
    return `🩹 MEOW Self-Repair Report\n${'─'.repeat(40)}\n${fixResult}\n${'─'.repeat(40)}\n\n📋 The task was NOT completed — MEOW was patched instead.\n   Please re-run the same task to let MEOW try again with the fix applied.`;
  }

  /**
   * MEOW-3-RULE: Fix MEOW (not the task).
   * 
   * Called when MEOW fails 3 times. Runs claude -p with a self-improvement prompt
   * that diagnoses why MEOW failed, then patches MEOW's own code/tools/prompts.
   * The task is NOT completed — it's marked needs_retry in the DB.
   */
  private async fixMeow(ctx: {
    userInput: string;
    lastError: string | null;
    attempt: number;
    runTests?: boolean;
    testCmd?: string;
  }): Promise<string> {
    const files = Array.from(this.files);
    const meowDir = process.cwd();

    // Build the self-improvement prompt for claude -p
    const fixPrompt = `
MEOW FAILED 3 TIMES — ROOT CAUSE ANALYSIS & SELF-REPAIR

## The Task That Failed
${ctx.userInput}

## What MEOW Tried (${ctx.attempt} attempts)
${ctx.lastError || "Unknown — MEOW produced no usable output"}

## Your Job: Fix MEOW, Not The Task

MEOW is a coding agent built at ${meowDir}.
It uses a custom tool-calling loop (TOOL: <name> | <args>) with these tools:
  - ls, grep, read, write, run, browse, search, diff, summon, activate_extension, archive_context, verify_mission, use_skill

The failure was likely caused by one of:
  1. A broken tool (tool crashes, wrong args parsing, missing dependency)
  2. A bad system prompt (MEOW doesn't understand what to do for this task type)
  3. A missing skill/extension (MEOW should have used a skill but didn't know to)
  4. A logic bug in agent.ts (the retry/escalation loop is wrong)
  5. A misconfigured LLM endpoint (wrong model, wrong baseUrl, wrong apiKey)

## Investigation Steps

1. Read \`src/agent/agent.ts\` — understand the tool loop, retry logic, and escalation path
2. Read \`src/types/tool.ts\` — understand how tools are registered and called
3. Read \`src/liaison/Liaison.ts\` — understand how L1 routes to L2
4. Check the LLM config in \`src/config/env.ts\` — is the model capable of the task?
5. Look for skills in \`skills/\` and \`src/skills/\` that are relevant to the task domain
6. Check if recent commits broke something: \`git log --oneline -10\`

## Repair Actions (pick the right fix)

- If a tool is broken: fix the tool code in \`src/tools/\` or wherever it lives
- If the system prompt is wrong: patch \`buildSystemPrompt()\` in agent.ts
- If a skill is missing: write a new skill in \`skills/<name>/SKILL.md\`
- If the retry logic is wrong: patch the while loop in \`chat()\` in agent.ts
- If the LLM is too weak: update the model in \`src/config/env.ts\`

## Output Format

After your investigation, output a SEARCH/REPLACE block for every file you changed,
then run: \`npm run check 2>&1 | head -50\` to verify nothing is broken.

If you couldn't find the root cause, output what you tried and what you suspect
but couldn't verify.

DO NOT attempt to complete the original task. Only fix MEOW's machinery.
`.trim();

    // Run claude -p to fix MEOW
    try {
      const { exec } = await import("child_process");
      const { writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const path = await import("path");

      // Write prompt to temp file — avoids stdin heredoc issues on Windows cmd.exe
      // Use @file syntax so claude reads from file instead of stdin
      const tmpFile = path.join(tmpdir(), `meow_fix_${Date.now()}.txt`);
      await writeFile(tmpFile, fixPrompt, "utf-8");

      const claudeBin = process.platform === "win32" ? "claude.cmd" : "claude";
      const fullCmd = `${claudeBin} -p @${tmpFile} --output-format=json --dangerously-skip-permissions --permission-mode bypassPermissions`;

      return await new Promise<string>((resolve) => {
        // Use exec() instead of spawn() for reliable stdout collection on Windows.
        // spawn(shell:true) with @file syntax can silently fail to collect stdout
        // due to buffer flushing issues in cmd.exe child processes (BUG-02).
        exec(fullCmd, {
          cwd: meowDir,
          env: {
            ...process.env,
            CI: "true",
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
            ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || process.env.LLM_BASE_URL,
          },
          encoding: "utf-8",
          timeout: 300_000,
          windowsHide: true,
        }, (err, stdout, stderr) => {
          rm(tmpFile).catch(() => {});

          if (err) {
            // Timeout or other exec error — check if partial output was captured
            const partialStdout = (err as any).stdout || "";
            const partialStderr = (err as any).stderr || "";
            const isTimeout = (err as any).killed && (err as any).code === 'ETIMEDOUT';

            // On timeout with partial output, try to extract meaningful content
            if (isTimeout && partialStdout.trim().length > 0) {
              let extractedContent = partialStdout;
              try {
                const parsed = JSON.parse(partialStdout);
                extractedContent = parsed.result || parsed.content || parsed.message || JSON.stringify(parsed, null, 2);
              } catch {
                // Not JSON — use as-is
              }
              this.kernel.push({
                type: "SET_STATE",
                key: `meow:repair:${Date.now()}`,
                value: { task: ctx.userInput.substring(0, 80), attempt: ctx.attempt, error: ctx.lastError, partial: true },
              });
              this.suggestUpstreamContribution(extractedContent).catch(() => {});
              resolve(extractedContent);
            } else {
              resolve(`❌ claude -p exited with error: ${err.message}${partialStderr ? '\nSTDERR: ' + partialStderr.substring(0, 300) : ''}${partialStdout ? '\nPartial output: ' + partialStdout.substring(0, 300) : ''}`);
            }
            return;
          }

          // Require meaningful output on success — empty stdout with code 0 is a silent failure
          if (stdout.trim().length > 0) {
            // Parse JSON output from --output-format=json
            // Format: {"type":"result","result":{"content":"...","stop_reason":"..."}}
            // The actual text is nested: parsed.result.result || parsed.result.content
            let extractedContent = stdout;
            try {
              const parsed = JSON.parse(stdout);
              // Navigate the nested structure: result.result for text content
              if (parsed.result) {
                extractedContent = parsed.result.result || parsed.result.content || parsed.result.message || JSON.stringify(parsed.result, null, 2);
              } else {
                extractedContent = parsed.result || parsed.content || parsed.message || JSON.stringify(parsed, null, 2);
              }
            } catch {
              // Not JSON — use stdout as-is (plain text response)
            }

            this.kernel.push({
              type: "SET_STATE",
              key: `meow:repair:${Date.now()}`,
              value: { task: ctx.userInput.substring(0, 80), attempt: ctx.attempt, error: ctx.lastError },
            });
            this.suggestUpstreamContribution(extractedContent).catch(() => {});
            resolve(extractedContent);
          } else {
            // Silent failure: process exited 0 but produced no output — this is the BUG-02 symptom
            resolve(`❌ claude -p produced no output (exit code 0). The fixMeow exec on Windows did not collect stdout properly.\nPossible fixes:\n1. Pass --output-format=json to claude to ensure non-empty output\n2. Reduce prompt complexity to speed up response\nSTDOUT: "${stdout}"\nSTDERR: ${stderr.substring(0, 500)}`);
          }
        });
      });
    } catch (err: any) {
      return `❌ claude -p self-repair failed: ${err.message}\nCheck MEOW manually at ${meowDir}`;
    }
  }

  /**
   * After a successful self-repair, check if the fix is worth contributing upstream.
   * MEOW should share its evolution with the stancsz/meow community.
   */
  private async suggestUpstreamContribution(_fixResult: string): Promise<void> {
    try {
      const { execSync } = await import("child_process");
      
      // Check if there are uncommitted changes
      const status = execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf-8" }).trim();
      const hasUncommitted = status.length > 0 && !status.includes("?");

      // Get the diff summary
      const diff = hasUncommitted 
        ? execSync("git diff --stat", { cwd: process.cwd(), encoding: "utf-8" })
        : execSync("git diff --stat HEAD~1", { cwd: process.cwd(), encoding: "utf-8" });
      
      // Get the latest commit message
      const lastCommit = execSync("git log -1 --oneline", { cwd: process.cwd(), encoding: "utf-8" }).trim();

      // Get the branch name
      const branch = execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf-8" }).trim();

      // Only suggest if something meaningful was committed (last commit looks like a fix)
      const isMEOWEvolution = lastCommit.includes("meow") || 
                               lastCommit.includes("fix") || 
                               lastCommit.includes("self-repair") ||
                               lastCommit.includes("feat") ||
                               lastCommit.includes("patch");

      if (isMEOWEvolution && diff.includes("src/")) {
        console.log("\n" + "─".repeat(52));
        console.log("🌱 MEOW evolved! Share your fix with the community:");
        console.log("");
        console.log("  # Fork stancsz/meow and push your branch:");
        console.log(`  git remote add upstream https://github.com/stancsz/meow`);
        console.log(`  git checkout -b meow-evolution`);
        console.log(`  git push upstream meow-evolution`);
        console.log("");
        console.log("  # Then open: https://github.com/stancsz/meow/pulls");
        console.log(`     Branch: ${branch || 'current'}`);
        console.log(`     Latest: ${lastCommit}`);
        console.log("");
        console.log("  Your variant helps everyone who hits the same bug!");
        console.log("─".repeat(52) + "\n");
      }
    } catch {
      // Non-fatal — don't block the flow if git commands fail
    }
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
    this.checkBudget();

    // ── Loop detection: flag if agent repeats same action 3× in a row ──
    const actionSig = JSON.stringify(messages.slice(-2));
    this.recentActions.push(actionSig);
    if (this.recentActions.length > 3) this.recentActions.shift();
    const last3 = this.recentActions.slice(-3);
    if (last3.length === 3 && last3.every(a => a === last3[0])) {
      this.auditLogger.log({ level: "warn", actionType: "loop_detected", detail: "Agent repeated same action 3× — flagging for review" });
      console.warn(pc.yellow("⚠️ [LOOP DETECTED] Repeating the same action. Consider pivoting strategy."));
    }

    const startTime = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let costCents = 0;
    let success = false;

    let text = "";

    // If we have an API key and the URL looks like an Anthropic-compatible endpoint, use that format
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

      // Extract token usage from response
      inputTokens = data.usage?.input_tokens ?? 0;
      outputTokens = data.usage?.output_tokens ?? 0;

      // Find the first content block that contains text
      const textBlock = data.content?.find((c: any) => c.type === "text" && c.text);
      text = textBlock?.text || "";
      success = true;
    } else {
      // Default to Ollama/OpenAI-compatible format
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
      text = data.message?.content || data.choices?.[0]?.message?.content || "";
      success = true;
    }

    const durationMs = Date.now() - startTime;

    // ── Priority 1: Cost tracking ─────────────────────────────────────────
    if (inputTokens > 0 || outputTokens > 0) {
      // Estimate cost (Anthropic pricing approx, in cents)
      // claude-3-5-sonnet: $3.00/M input tokens = 0.003¢, $15.00/M output tokens = 0.015¢
      costCents = (inputTokens * 0.003 / 1_000_000) + (outputTokens * 0.015 / 1_000_000);
      this.totalCostCents += costCents;

      const meowDb = this.db as any;
      if (meowDb && typeof meowDb.logCost === "function") {
        meowDb.logCost(this.runId, this._model, inputTokens, outputTokens, costCents);
      }

      this.auditLogger.llmCall(this._model, inputTokens, outputTokens, durationMs, costCents, success);
    }

    // Print cost summary after each call if not silent
    if (costCents > 0) {
      const totalSoFar = this.totalCostCents;
      const budgetInfo = config.budgetCents ? ` / ${config.budgetCents}¢ budget` : "";
      process.stdout.write(pc.dim(`\n  💰 ${costCents.toFixed(4)}¢ (session total: ${totalSoFar.toFixed(4)}¢${budgetInfo})\n`));
    }

    return text;
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
- archive_context          : Explicitly offload current history to Knowledge Base (Use when context is bloated)
- verify_mission | goal|test : Review and verify if the work is done properly (MANDATORY after 'summon')
- use_skill | <name> : Activate a specialist skill (run 'use_skill | list' to see available skills)

# SKILLS ECOSYSTEM (ALWAYS CHECK FIRST):
Before delegating to Level-2 specialists (summon), ALWAYS check if a skill exists:
- Run 'npx skills find <relevant-topic>' to search the unified ecosystem.
- Core Repositories: https://github.com/stancsz/skills and https://github.com/vercel-labs/skills
- Reference: https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md
- Skills from 'vercel-labs/agent-skills' and 'anthropics/skills' are battle-tested (100K+ installs).
- Common categories: testing, deployment, documentation, code quality, design, devops.
- If a relevant skill exists, install it: npx skills add <owner/repo@skill> -g -y
- Only summon a specialist if no skill can help with the task.

Example: TOOL: verify_mission | Fixed the race condition in the kernel | npm test

Example: TOOL: ls | .

# EXPLORATION & RESILIENCE:
- Be curious. If you don't see what you need, use tools to find it.
- **Research First**: If uncertain about the best agentic way to solve a task, STOP and use search/browse to research GitHub, or seek guidance on mature ecosystem patterns (Claude skills, MCP tools, etc.).
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
- **Goal-Driven Execution**: Define success criteria (e.g. "Write test, then make pass"). Loop until verified.
- **SOP COMPLIANCE**: You MUST follow the Standard Operating Procedures (SOP) at all times. This includes the "Think-Plan-Verify" loop, the "NO TRUST" verification policy, and the "Research First" protocol for uncertainty. Failure to follow SOP is a mission failure.`;
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

    let sopMd = "";
    try {
      sopMd = await readFile(resolve(process.cwd(), ".context/SOP.md"), "utf-8");
      sopMd = `\n# STANDARD OPERATING PROCEDURES (SOP) - MANDATORY:\n${sopMd}\n`;
    } catch (e) {}

    let honestyMd = "";
    try {
      honestyMd = await readFile(resolve(process.cwd(), ".context/HONESTY.md"), "utf-8");
      honestyMd = `\n# HONESTY & VERIFICATION STANDARDS - MANDATORY:\n${honestyMd}\n`;
    } catch (e) {}

    const envInfo = `\n# CURRENT ENVIRONMENT:\n- OS: ${os.platform()} (${os.type()} ${os.release()})\n- Arch: ${os.arch()}\n- Shell: ${process.env.SHELL || (os.platform() === "win32" ? "PowerShell/cmd.exe" : "Unknown")}\n- CWD: ${process.cwd()}\n`;
    
    // Discover Skills and Extensions
    await this.skillManager.discover();
    await this.extensionManager.discover();

    // Host Environment Awareness
    const hostMcp = await this.discoveryModule.discoverMcpServers();
    for (const server of hostMcp) {
      await this.mcpManager.addServer(server);
    }
    
    const hostSkills = await this.discoveryModule.discoverGlobalSkills();
    for (const skill of hostSkills) {
      this.skillManager.registerSkill(skill);
    }

    const skillsPrompt = this.skillManager.getSkillsPrompt();
    const extensionsPrompt = this.extensionManager.getExtensionsPrompt();

    let prompt = this.getBasePrompt() + envInfo + claudeMd + sopMd + honestyMd + skillsPrompt + extensionsPrompt;

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

    // RECALLED AGENTIC MEMORY (Transient Injection)
    // We fetch memories based on the most recent user messages to provide context
    // without bloating the permanent history.
    const lastUserMessage = this.messages.filter(m => m.role === "user").pop();
    let relevantMemories: MemoryResult[] = [];
    if (lastUserMessage && lastUserMessage.content.trim()) {
      relevantMemories = await this.agenticMemory.recall(lastUserMessage.content, await embed(lastUserMessage.content));
    }
    if (relevantMemories.length > 0) {
      prompt += `\n\n# RECALLED AGENTIC MEMORY (Associative Knowledge):\n`;
      prompt += relevantMemories.map(m => `- ${m.content}`).join("\n");
      prompt += `\n(Note: These are historical snippets retrieved from the Knowledge Base.)\n`;
    }

    // Add file contents (Selective Pruning)
    if (this.files.size > 0) {
      prompt += "\n\n# Files in chat (Surgically Selected):\n";
      for (const file of this.files) {
        try {
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
   * Locality Sensitive Hashing (LSH) Proxy for Semantic Search.
   * Maps similar text to similar vector spaces without a full model.
   */
  private mockEmbedding(text: string): number[] {
    const dim = config.embeddingDimension;
    const arr = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\W+/);
    
    words.forEach(word => {
      if (!word) return;
      // Create a stable hash for each word
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0; 
      }
      // Distribute hash into the vector
      const idx = Math.abs(hash) % dim;
      arr[idx] += 1;
    });

    // Ensure non-zero magnitude (Signal Floor)
    if (arr.every(v => v === 0)) {
      arr[0] = 0.0001; 
    }

    // Normalize
    const magnitude = Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0)) || 1;
    return arr.map(v => v / magnitude);
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

    // Also try parsing unified diffs (udiff format) as fallback
    const udiffEdits = this.parseUdiffs(response);
    for (const udiffEdit of udiffEdits) {
      if (!edits.some(e => e.path === udiffEdit.path)) {
        edits.push(udiffEdit);
      }
    }

    return edits;
  }

  /**
   * Parse unified diffs (udiff format) from model response.
   * Format: --- filename\n@@ -start,+count @@\n+added lines\n-removed lines
   * This is more compact than SEARCH/REPLACE blocks.
   */
  private parseUdiffs(response: string, fileContext?: Map<string, string>): EditBlock[] {
    const edits: EditBlock[] = [];

    // Check if response contains unified diff markers
    if (!UDIFF_PATTERN.test(response)) {
      return edits;
    }

    // Reset regex lastIndex
    UDIFF_HUNK_PATTERN.lastIndex = 0;

    // Split into diff sections
    const sections = response.split(/(?=^---?\s)/m);
    let currentFile = "";
    let currentOriginal: string[] = [];
    let currentUpdated: string[] = [];
    let inHunk = false;
    let hunkStart = 0;

    for (const section of sections) {
      const lines = section.split('\n');

      for (const line of lines) {
        // File header: --- filename or +++ filename
        const fileHeaderMatch = line.match(/^[+-]{3}\s+(.+?)\s*$/);
        if (fileHeaderMatch) {
          // Save previous diff if complete
          if (currentFile && currentOriginal.length > 0) {
            edits.push({
              path: currentFile,
              original: currentOriginal.join('\n'),
              updated: currentUpdated.join('\n'),
            });
          }
          currentFile = fileHeaderMatch[1];
          currentOriginal = [];
          currentUpdated = [];
          inHunk = false;
          continue;
        }

        // Hunk header: @@ -start,+count @@ +start,+count @@
        const hunkMatch = line.match(/^@@\s*[-+](\d+)(?:,(\d+))?\s+[-+](\d+)(?:,(\d+))?\s*@@/);
        if (hunkMatch) {
          inHunk = true;
          // For simplicity, we'll fetch the original from fileContext or current file
          continue;
        }

        if (inHunk) {
          if (line.startsWith('-')) {
            currentOriginal.push(line.substring(1));
          } else if (line.startsWith('+')) {
            currentUpdated.push(line.substring(1));
          } else if (line.startsWith(' ')) {
            currentOriginal.push(line.substring(1));
            currentUpdated.push(line.substring(1));
          }
        }
      }
    }

    // Save last diff
    if (currentFile && currentOriginal.length > 0) {
      edits.push({
        path: currentFile,
        original: currentOriginal.join('\n'),
        updated: currentUpdated.join('\n'),
      });
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

  /**
   * Detect run/test tool failures using error pattern matching.
   * Covers: compile errors, runtime errors, lint errors, test failures.
   */
  private detectRunFailure(output: string): boolean {
    // Only match actual build/test failures — not ESLint warnings
    // Real errors appear at line start: "✗", "error:", "Error:", "FAILED", "Build failed"
    // Warnings don't have these prefixes
    const failurePatterns = [
      /^Error:/m,                    // Error at start of line (not "warning" context)
      /^error:/m,                    // lowercase error at line start
      /^✗/m,                         // failure X symbol
      /^FAILED$/m,                   // all-caps FAILED
      /\bfailed\b/i,                 // "failed" case-insensitive
      /\bfatal\b/i,                  // fatal error
      /\bSyntaxError\b/,
      /\bReferenceError\b/,
      /\bTypeError\b/,
      /\bParseError\b/,
      /\bAssertionError\b/,
      /\bCannot find\b/,
      /\bModule not found\b/,
      /\bENOENT\b/,
      /\bCommand failed\b/,
      /\bNon-zero exit\b/,
      /\bTypeScript error\b/,
      /\bESLint error\b/,
      /\bTS[0-9]{4}\b/, // TypeScript error codes like TS2345
    ];

    return failurePatterns.some(pattern => pattern.test(output));
  }

  /**
   * Build a surgical fix prompt directing the model to fix specific errors.
   */
  private buildSurgicalFixPrompt(errorOutput: string, toolArgs: string): string {
    const extracted = this.extractError(errorOutput);
    return `⚠️ [LINT-FIX] The previous command failed with errors:

${extracted}

COMMAND: ${toolArgs}

INSTRUCTIONS:
1. Read the relevant source file(s) to understand the context.
2. Apply a MINIMAL surgical fix to resolve only the reported error(s).
3. Do NOT refactor unrelated code.
4. After fixing, re-run the command to verify.

Respond with your fix using SEARCH/REPLACE blocks.`;
  }

  private updateTokenEstimate() {
    const text = this.messages.map(m => m.content).join(" ");
    this.currentL1Tokens = Math.ceil(text.length / 4); // Standard approximation
  }

  /**
   * Tiered Offloading: Moves older context from L1 (Hot) to L3 (Cold Storage)
   * by summarizing it and archiving the raw content into Agentic Memory.
   */
  public async compressAndOffload(): Promise<void> {
    const offloadCount = Math.floor(this.messages.length / 2);
    if (offloadCount < 2) return;

    const toOffload = this.messages.splice(0, offloadCount);
    const rawContent = toOffload.map(m => `[${m.role}] ${m.content}`).join("\n");
    
    // Generate a Semantic Anchor (Summary)
    const anchorPrompt = `Summarize the following conversation history into a single dense paragraph for long-term archival. Include all key technical decisions and state changes:\n\n${rawContent}`;
    const summary = await this.callLLM("You are a context compression engine.", [{ role: "user", content: anchorPrompt }]);

    // Archive raw content and summary into L3
    await this.agenticMemory.store(
      `CONTEXT_ANCHOR: ${summary}`,
      { type: "archived_context", original_length: rawContent.length },
      await embed(summary)
    );

    // Inject the anchor back into L1 to maintain semantic continuity
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

  getEditedFiles(): string[] {
    return Array.from(this.editedFiles);
  }

  // ── AI-Native Phase 1.2: Task outcome instrumentation ────────────────────

  private recordTaskOutcome(taskText: string, result: string, failureReason?: string): void {
    const meowDb = this.db as any;
    if (!meowDb || typeof meowDb.insertTaskOutcome !== "function") return;
    try {
      meowDb.insertTaskOutcome({
        runId: this.runId,
        taskText,
        result,
        failureReason: failureReason ?? null,
      });

      // Phase 3.2: Update skill effectiveness with task result
      if (meowDb && typeof meowDb.updateSkillEffectivenessByRunId === "function") {
        try {
          meowDb.updateSkillEffectivenessByRunId(this.runId, result);
        } catch {}
      }
    } catch (err) {
      // Non-fatal — task outcome tracking must never break the agent
      console.warn("[Agent] recordTaskOutcome failed:", err);
    }
  }
}