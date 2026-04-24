/**
 * ratchet.ts - Automated Iterative Improvement (AutoResearch style)
 *
 * Implements the "Ratchet" pattern:
 * 1. Snapshot state
 * 2. Attempt change
 * 3. Run benchmark/tests
 * 4. Keep if improved, else revert
 */

import { createCheckpoint, restoreCheckpoint, dropCheckpoint, createLineageCheckpoint } from "./checkpointing.ts";
import { execSync } from "node:child_process";

export interface RatchetResult {
  success: boolean;
  score: number;
  message: string;
  diff?: string;
}

export interface RatchetOptions {
  benchCommand: string;
  minScore?: number;
  targetFile?: string;
  gapId: string;
}

/**
 * Executes a block of work and ratchets the changes if the score improves.
 */
export async function runRatchet(
  options: RatchetOptions,
  work: () => Promise<void>
): Promise<RatchetResult> {
  console.log(`\n🚀 [Ratchet] Starting iteration for ${options.gapId}...`);

  // 1. Establish baseline
  let baseline = 0;
  try {
    const output = execSync(options.benchCommand, { encoding: "utf-8" });
    baseline = parseScore(output);
  } catch {
    baseline = 0;
  }
  console.log(`  📊 Baseline score: ${baseline}`);

  // 2. Snapshot
  await createCheckpoint();

  // 3. Attempt implementation
  try {
    await work();
  } catch (e: any) {
    await restoreCheckpoint();
    return { success: false, score: baseline, message: `Work failed: ${e.message}` };
  }

  // 4. Benchmark
  let newScore = 0;
  let benchOutput = "";
  try {
    benchOutput = execSync(options.benchCommand, { encoding: "utf-8" });
    newScore = parseScore(benchOutput);
  } catch (e: any) {
    newScore = 0;
    benchOutput = e.stdout || e.message;
  }
  console.log(`  📊 New score: ${newScore}`);

  // 5. Decision Loop
  if (newScore > baseline || (options.minScore !== undefined && newScore >= options.minScore)) {
    console.log(`  ✅ IMPROVEMENT DETECTED. Ratcheting...`);
    await dropCheckpoint();
    const lineage = await createLineageCheckpoint(`${options.gapId}-solved-[${newScore}]`);
    return {
      success: true,
      score: newScore,
      message: `Ratcheted! Score improved from ${baseline} to ${newScore}.`,
    };
  } else {
    console.log(`  ❌ REGRESSION OR NO PROGRESS. Reverting...`);
    await restoreCheckpoint();
    return {
      success: false,
      score: newScore,
      message: `Reverted. New score ${newScore} did not beat baseline ${baseline}.`,
    };
  }
}

/**
 * Simple score parser - searches for "Score: X" or "PASSED (N tests)"
 */
function parseScore(output: string): number {
  // Pattern 1: Explicit score
  const scoreMatch = output.match(/Score:\s*(\d+(\.\d+)?)/i);
  if (scoreMatch) return parseFloat(scoreMatch[1]);

  // Pattern 2: Jest/Bun test passes
  const passMatch = output.match(/(\d+)\s*passed/i);
  if (passMatch) return parseInt(passMatch[1]);

  // Fallback: Check for generic SUCCESS
  if (output.includes("SUCCESS")) return 1;

  return 0;
}
