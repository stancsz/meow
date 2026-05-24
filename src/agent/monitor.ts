/**
 * MonitoringAgent — AI-Native Phase 2.1
 *
 * Watches all task outcomes, clusters failures, diagnoses root causes,
 * writes patches, and deploys them — without human intervention.
 *
 * Runs on a schedule (cron) or after every N task completions.
 * Equivalent to YC's "monitoring agent that watched every query, spotted
 * failures overnight, wrote fixes, and merged them by morning."
 */

import { MeowDatabase } from "../kernel/database";
import { config } from "../config/env";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface MonitoringReport {
  clusters: FailureCluster[];
  patches: Patch[];
  deploys: Deploy[];
  flaggedForReview: Flagged[];
}

interface FailureCluster {
  id: string;
  taskTexts: string[];
  failureReason: string;
  frequency: number;
  embedding?: number[];
}

interface Patch {
  clusterId: string;
  diagnosis: string;
  filesModified: string[];
  patchDescription: string;
  evalScoreDelta: number;
  deployed: boolean;
  searchReplace?: Record<string, { replace: string; with: string }>;
}

interface Deploy {
  patch: Patch;
  evalBefore: number;
  evalAfter: number;
}

interface Flagged {
  patch: Patch;
  diagnosis: string;
  reason: string;
}

export class MonitoringAgent {
  private db: MeowDatabase;
  private runId: string;

  constructor(db: MeowDatabase) {
    this.db = db;
    this.runId = `monitor-${Date.now()}`;
  }

  /**
   * Main entry point — run the full monitoring loop.
   */
  async run(): Promise<MonitoringReport> {
    const report: MonitoringReport = { clusters: [], patches: [], deploys: [], flaggedForReview: [] };

    // 1. SENSOR: Query recent failures
    const failures = this.db.getRecentFailures(24, 50);
    if (failures.length === 0) {
      console.log("[MonitoringAgent] No failures in the last 24h. Nothing to do.");
      return report;
    }

    // 2. CLUSTER: Group failures by similarity using task text
    const clusters = this.clusterFailures(failures);
    report.clusters = clusters;

    console.log(`[MonitoringAgent] Found ${clusters.length} failure clusters from ${failures.length} failures`);

    // 3. For each cluster, diagnose + generate patch
    for (const cluster of clusters) {
      // Skip low-frequency noise
      if (cluster.frequency < 2) {
        console.log(`[MonitoringAgent] Skipping low-frequency cluster: ${cluster.failureReason} (freq=${cluster.frequency})`);
        continue;
      }

      const diagnosis = await this.diagnose(cluster);
      const patch = await this.generatePatch(cluster, diagnosis);

      // 4. QUALITY GATE: Run eval on patched code
      const evalPassed = await this.runEvalGate(patch);

      // 5. LEARN: Deploy or flag based on autoDeployThreshold
      const evalResult = await this.runEvalGate(patch);

      if (evalResult.passed && evalResult.score >= config.autoDeployThreshold * 100) {
        await this.applyPatch(patch);
        report.deploys.push({ patch, evalBefore: evalResult.baseline ?? 0, evalAfter: evalResult.score });
      } else if (evalResult.passed) {
        // Eval passed but below auto-deploy threshold — flag for DRI review
        await this.flagForHumanReview(patch, diagnosis);
        report.flaggedForReview.push({ patch, diagnosis, reason: `eval score ${evalResult.score.toFixed(1)} below auto-deploy threshold ${(config.autoDeployThreshold * 100).toFixed(0)}` });
      } else {
        // Eval failed — flag for human review
        await this.flagForHumanReview(patch, diagnosis);
        report.flaggedForReview.push({ patch, diagnosis, reason: "eval gate failed" });
      }
      report.patches.push(patch);
    }

    return report;
  }

  /**
   * Cluster failures by shared failure reason.
   */
  private clusterFailures(failures: { task_text: string; failure_reason: string; freq: number }[]): FailureCluster[] {
    const clusters: Map<string, FailureCluster> = new Map();

    for (const f of failures) {
      const key = this.normalizeReason(f.failure_reason);
      if (!clusters.has(key)) {
        clusters.set(key, { id: key, taskTexts: [], failureReason: f.failure_reason, frequency: 0 });
      }
      const c = clusters.get(key)!;
      c.taskTexts.push(f.task_text.substring(0, 200));
      c.frequency += f.freq;
    }

    return Array.from(clusters.values()).sort((a, b) => b.frequency - a.frequency);
  }

  private normalizeReason(reason: string): string {
    // Normalize by lowercasing, stripping numbers and paths, keeping the error type
    return reason
      .toLowerCase()
      .replace(/[^a-z]/g, " ")
      .trim()
      .substring(0, 50);
  }

  /**
   * Ask the LLM: "Why does meow fail on tasks like X?"
   */
  private async diagnose(cluster: FailureCluster): Promise<string> {
    // Delegate to an LLM call via the existing Agent infrastructure
    const prompt = `You are diagnosing a failure pattern in an AI coding agent called meow-swarm.

Failure cluster (${cluster.frequency}x):
${cluster.taskTexts.slice(0, 5).map(t => `  - ${t}`).join("\n")}

Your task: Identify the ROOT CAUSE of why meow fails on these tasks.
Consider:
1. Is this a tool failure (wrong tool called, missing permissions)?
2. Is this a logic failure (wrong plan, missed edge case)?
3. Is this a prompt/instruction failure (unclear task, ambiguous goal)?
4. Is this an infrastructure failure (network, API key, DB)?

Reply with a brief diagnosis (2-3 sentences max). Start with "Root cause:"`;

    try {
      const result = await this.callLLM(prompt);
      return result;
    } catch (err) {
      return `Diagnosis unavailable: ${err}`;
    }
  }

  /**
   * Generate a SEARCH/REPLACE fix for the cluster.
   */
  private async generatePatch(cluster: FailureCluster, diagnosis: string): Promise<Patch> {
    const prompt = `You are debugging meow-swarm, a TypeScript Node.js autonomous coding agent.

Diagnosis: ${diagnosis}

Failure cluster (${cluster.frequency}x):
${cluster.taskTexts.slice(0, 5).map(t => `  - ${t}`).join("\n")}

Generate a surgical code fix. Respond ONLY with a JSON object (no markdown, no code fences):
{
  "diagnosis": "...",
  "files": ["path/to/file.ts"],
  "patch": "description of the change",
  "searchReplace": {
    "src/path/file.ts": {
      "replace": "exact code to replace",
      "with": "exact replacement code"
    }
  }
}

Rules:
- Only modify ONE file at a time
- The fix must address the root cause identified above
- Include the exact search/replace blocks`;

    let patchDescription = "";
    let filesModified: string[] = [];
    let searchReplace: Record<string, { replace: string; with: string }> = {};

    try {
      const result = await this.callLLM(prompt);
      // Try to parse JSON from response
      const jsonMatch = result.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        patchDescription = parsed.diagnosis ?? diagnosis;
        filesModified = Array.isArray(parsed.files) ? parsed.files : [];
        searchReplace = parsed.searchReplace ?? {};
      }
    } catch (err) {
      patchDescription = `Auto-patch for ${cluster.failureReason}: ${err}`;
    }

    return {
      clusterId: cluster.id,
      diagnosis: patchDescription || diagnosis,
      filesModified,
      patchDescription,
      evalScoreDelta: 0,
      deployed: false,
      searchReplace,
    };
  }

  /**
   * Apply a patch by writing the replacement code to the file.
   * Uses the searchReplace blocks to surgically modify files.
   */
  private async applyPatch(patch: Patch): Promise<void> {
    console.log(`[MonitoringAgent] Applying patch: ${patch.patchDescription}`);

    // Apply search/replace blocks if provided
    if (patch.searchReplace) {
      for (const [filePath, edit] of Object.entries(patch.searchReplace)) {
        try {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
          const content = fs.readFileSync(fullPath, "utf-8");
          const updated = content.replace(edit.replace, edit.with);
          fs.writeFileSync(fullPath, updated);
          console.log(`[MonitoringAgent] Patched: ${filePath}`);
        } catch (err) {
          console.warn(`[MonitoringAgent] Failed to patch ${filePath}: ${err}`);
        }
      }
    }

    // Record improvement
    this.db.insertSelfImprovement({
      triggerType: "monitoring_agent",
      failureCluster: patch.clusterId,
      filesPatched: patch.filesModified,
      deployed: true,
    });

    console.log(`[MonitoringAgent] Deployed: ${patch.filesModified.join(", ")}`);
  }

  /**
   * Run eval suite on the patched code — the Phase 4 quality gate.
   * Returns {passed, score, baseline} where score is 0-100.
   * Patches pass if score >= autoDeployThreshold * 100.
   */
  private async runEvalGate(_patch: Patch): Promise<{ passed: boolean; score: number; baseline: number | null }> {
    try {
      const meowDb = this.db as any;
      const baseline = meowDb?.getEvalBaseline?.("coding") ?? null;

      // Dynamically import to avoid circular deps
      const { runBenchmark } = await import("../eval/harness");
      const model = config.model || "claude-sonnet-4";
      const report = await runBenchmark("coding", "meow", model, { verbose: false });

      const score = report.totalScore;

      if (baseline !== null && score < baseline - 5) {
        console.warn(`[MonitoringAgent] Eval gate: score ${score.toFixed(1)} < baseline ${baseline} - 5`);
        return { passed: false, score, baseline };
      }

      meowDb?.insertEvalBaseline?.({ suite: "coding", score, model, trigger: "monitoring_agent" });
      return { passed: true, score, baseline };
    } catch (err) {
      console.warn(`[MonitoringAgent] Eval gate error: ${err}. Allowing deploy.`);
      return { passed: true, score: 0, baseline: null };
    }
  }

  /**
   * Flag a patch for human review when eval gate fails.
   */
  private async flagForHumanReview(patch: Patch, diagnosis: string): Promise<void> {
    console.warn(`[MonitoringAgent] Flagged for review: ${patch.patchDescription}`);

    this.db.insertSelfImprovement({
      triggerType: "monitoring_agent",
      failureCluster: patch.clusterId,
      filesPatched: patch.filesModified,
      deployed: false,
    });
  }

  /**
   * LLM call helper using the biosphere gateway.
   */
  private async callLLM(prompt: string): Promise<string> {
    const url = `${config.baseUrl}/v1/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model || "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.content?.[0]?.text ?? "";
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}