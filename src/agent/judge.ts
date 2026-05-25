// JudgeAgent: LLM-as-judge for task output quality evaluation
// Acts as the final quality gate in SelfReviewRunner — blocks shipping if score < threshold
// and feeds specific critique back into the agent loop for refinement.

import { config } from "../config/env";
import pc from "picocolors";

export interface JudgeContext {
  taskId: string;
  goal: string;                      // The original task description
  diff: string;                       // The actual code changes produced
  artifacts: Array<{ path: string; operation: string; content?: string }>;
  testResults?: Array<{ suite: string; passed: boolean; failures?: string[] }>;
  coverage?: number;
  testOutput?: string;                // Raw test stdout/stderr for signal analysis
  runtimeLogs?: string;              // Any runtime evidence (stdout from execution)
  runtimeEvidence?: Array<{ command: string; exitCode: number; stdout: string; stderr: string; durationMs: number; artifactType: string }>;
}

export interface Verdict {
  score: number;                     // 0-100 overall quality score
  passed: boolean;                   // true if score >= threshold
  goalAlignment: ScoreDimension;
  completeness: ScoreDimension;
  correctnessSignal: ScoreDimension;
  taste: ScoreDimension;
  critique: string;                  // Specific, actionable critique for refinement
  blocked: boolean;                  // true if this verdict should block shipping
}

export interface ScoreDimension {
  score: number;                     // 0-100 for this dimension
  reasoning: string;                 // Why this score was given
}

const JUDGE_SYSTEM_PROMPT = `You are an Adversarial Quality Judge evaluating code produced by an autonomous coding agent (MEOW).
Your role is to be the FINAL quality gate before shipping — you are the last line of defense against low-quality output.

EVALUATION DIMENSIONS:

1. GOAL ALIGNMENT (25 points)
   - Does the diff actually solve the stated problem?
   - Does it address the core intent, not just the surface-level request?
   - Is the implementation approach appropriate for the problem?

2. COMPLETENESS (25 points)
   - Are there TODOs, FIXMEs, stubs, or placeholder comments in the output?
   - Is the implementation fully realized or is it a partial sketch?
   - Are edge cases handled or just glossed over?

3. CORRECTNESS SIGNAL (25 points)
   - Do runtime evidence (test output, logs) confirm the code works?
   - Are there test failures, runtime errors, or exceptions?
   - Does the code compile and pass its own test suite?

4. TASTE (25 points)
   - Is the code coherent and well-structured?
   - Is it scoped correctly (not over-engineered or under-engineered)?
   - Is it consistent with the surrounding codebase style?
   - Are there obvious code smells, anti-patterns, or architectural issues?

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "score": <0-100>,
  "passed": <true if score >= 80, false otherwise>,
  "goalAlignment": { "score": <0-100>, "reasoning": "<1-2 sentence explanation>" },
  "completeness": { "score": <0-100>, "reasoning": "<1-2 sentence explanation>" },
  "correctnessSignal": { "score": <0-100>, "reasoning": "<1-2 sentence explanation>" },
  "taste": { "score": <0-100>, "reasoning": "<1-2 sentence explanation>" },
  "critique": "<specific, actionable critique — what to fix and why>",
  "blocked": <true if score < 80, false otherwise>
}

IMPORTANT:
- Be harsh but fair. Low scores should come with specific, actionable feedback.
- "passed" should be true only if the code is genuinely shippable without major rework.
- critique should name specific files/areas and specific problems, not vague generalities.
- If you cannot evaluate a dimension (e.g., no runtime evidence), score it 50 with "Cannot evaluate" reasoning.`;

export class JudgeAgent {
  private model: string;
  private baseUrl: string;
  private apiKey: string | undefined;
  private threshold: number;

  constructor(opts?: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    threshold?: number;
  }) {
    this.model = opts?.model ?? config.model;
    this.baseUrl = opts?.baseUrl ?? config.baseUrl;
    this.apiKey = opts?.apiKey ?? config.apiKey;
    this.threshold = opts?.threshold ?? 80;
  }

  /**
   * Judge task output quality using an LLM.
   * Returns a structured Verdict with scores per dimension and a critique.
   */
  async judge(ctx: JudgeContext): Promise<Verdict> {
    console.log(pc.bold(pc.magenta("\n⚖️  [JUDGE] Evaluating task output quality...")));

    const prompt = this.buildPrompt(ctx);

    try {
      const response = await this.callLLM(JUDGE_SYSTEM_PROMPT, [
        { role: "user" as const, content: prompt }
      ]);

      const parsed = this.parseVerdict(response);

      console.log(pc.magenta(`   Score: ${parsed.score}/100 | ${parsed.passed ? pc.green("✅ PASSED") : pc.red("❌ BLOCKED")}`));
      if (!parsed.passed) {
        console.log(pc.dim(`   Critique: ${parsed.critique.substring(0, 120)}...`));
      }

      return parsed;
    } catch (err: any) {
      console.error(pc.red(`   ❌ Judge error: ${err.message}`));
      // On error, fail open with a low-score verdict so the gate can retry
      return {
        score: 0,
        passed: false,
        blocked: true,
        goalAlignment: { score: 0, reasoning: "Judge unavailable due to error" },
        completeness: { score: 0, reasoning: "Judge unavailable due to error" },
        correctnessSignal: { score: 0, reasoning: "Judge unavailable due to error" },
        taste: { score: 0, reasoning: "Judge unavailable due to error" },
        critique: `Judge agent failed: ${err.message}. Review output manually.`,
      };
    }
  }

  /**
   * Build the evaluation prompt from the judge context.
   */
  private buildPrompt(ctx: JudgeContext): string {
    const artifactList = ctx.artifacts.length > 0
      ? ctx.artifacts.map(a => `  - ${a.path} (${a.operation})${a.content ? `\n    ${a.content.substring(0, 200)}...` : ''}`).join("\n")
      : "  (no artifacts)";

    const testSummary = ctx.testResults && ctx.testResults.length > 0
      ? ctx.testResults.map(t => `  - ${t.suite}: ${t.passed ? "PASS" : "FAIL"}${t.failures?.length ? ` (${t.failures.length} failures)` : ''}`).join("\n")
      : "  (no test results)";

    const coverageInfo = ctx.coverage !== undefined ? `  Coverage: ${ctx.coverage}%\n` : "";

    const runtimeEvidenceSections = ctx.runtimeEvidence && ctx.runtimeEvidence.length > 0
      ? ctx.runtimeEvidence.map(ev => {
          const typeLabel = ev.artifactType || 'unknown';
          const truncatedStdout = ev.stdout.length > 1500 ? ev.stdout.substring(0, 1500) + '\n... (truncated)' : ev.stdout;
          const truncatedStderr = ev.stderr.length > 500 ? ev.stderr.substring(0, 500) + '\n... (truncated)' : ev.stderr;
          return `--- RUNTIME EVIDENCE [${typeLabel}] ---\n  Command: ${ev.command}\n  Exit Code: ${ev.exitCode}\n  Duration: ${ev.durationMs}ms\n  Stdout:\n${truncatedStdout}\n  Stderr:\n${truncatedStderr}`;
        }).join('\n')
      : "";

    const runtimeInfo = ctx.testOutput
      ? `\n--- RUNTIME OUTPUT (test/lint) ---\n${ctx.testOutput.substring(0, 2000)}\n`
      : "";

    return `TASK: ${ctx.goal}

ARTIFACTS (files changed):
${artifactList}

DIFF:
${ctx.diff || "(no diff available)"}

TEST RESULTS:
${testSummary}
${coverageInfo}
${runtimeEvidenceSections}
${runtimeInfo}
${ctx.runtimeLogs ? `---
RUNTIME LOGS:
${ctx.runtimeLogs.substring(0, 1000)}
`
    : ""}

Evaluate the output above and return your verdict as JSON.`;
  }

  /**
   * Parse JSON verdict from LLM response. Handles markdown-wrapped JSON, partial JSON, etc.
   */
  private parseVerdict(response: string): Verdict {
    // Try to extract JSON from markdown-wrapped or partial response
    let jsonStr = response.trim();

    // Handle markdown code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in the response (handle partial completions)
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr) as Record<string, any>;

      // Validate required fields
      const score = typeof parsed.score === "number" ? parsed.score : 0;
      const passed = typeof parsed.passed === "boolean" ? parsed.passed : score >= this.threshold;

      const dimensions = ["goalAlignment", "completeness", "correctnessSignal", "taste"] as const;
      const result: Record<string, any> = {
        score,
        passed,
        blocked: !passed,
        critique: typeof parsed.critique === "string" ? parsed.critique : "No critique provided",
      };

      for (const dim of dimensions) {
        if (parsed[dim] && typeof parsed[dim] === "object") {
          result[dim] = {
            score: typeof parsed[dim].score === "number" ? parsed[dim].score : 50,
            reasoning: typeof parsed[dim].reasoning === "string" ? parsed[dim].reasoning : "No reasoning provided",
          };
        } else {
          result[dim] = { score: 50, reasoning: "Dimension not evaluated" };
        }
      }

      return result as Verdict;
    } catch (err: any) {
      // JSON parse failed — return a fallback verdict
      console.warn(pc.yellow(`   ⚠️  Judge JSON parse failed: ${err.message}. Falling back to score 0.`));
      return {
        score: 0,
        passed: false,
        blocked: true,
        goalAlignment: { score: 0, reasoning: "Parse failure" },
        completeness: { score: 0, reasoning: "Parse failure" },
        correctnessSignal: { score: 0, reasoning: "Parse failure" },
        taste: { score: 0, reasoning: "Parse failure" },
        critique: `Judge could not parse LLM response. Raw response: ${response.substring(0, 300)}`,
      };
    }
  }

  /**
   * Call the LLM with the given system prompt and messages.
   */
  private async callLLM(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<string> {
    const startTime = Date.now();

    if (this.apiKey && this.baseUrl.includes("anthropic")) {
      return this.callAnthropic(systemPrompt, messages, startTime);
    } else {
      return this.callOpenAICompat(systemPrompt, messages, startTime);
    }
  }

  private async callAnthropic(systemPrompt: string, messages: Array<{ role: string; content: string }>, startTime: number): Promise<string> {
    const url = this.baseUrl.endsWith("/v1/messages") ? this.baseUrl : `${this.baseUrl}/v1/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Anthropic endpoint error: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json() as any;
    const textBlock = data.content?.find((c: any) => c.type === "text" && c.text);
    return textBlock?.text || "";
  }

  private async callOpenAICompat(systemPrompt: string, messages: Array<{ role: string; content: string }>, startTime: number): Promise<string> {
    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages
    ];

    const url = this.baseUrl.includes("/api/chat") ? this.baseUrl : `${this.baseUrl}/api/chat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "Authorization": `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.model,
        messages: fullMessages,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json() as { message?: { content?: string }, choices?: { message?: { content?: string } }[] };
    return data.message?.content || data.choices?.[0]?.message?.content || "";
  }

  getThreshold(): number {
    return this.threshold;
  }
}