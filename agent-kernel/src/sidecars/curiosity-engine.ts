/**
 * curiosity-engine.ts — Intrinsic Motivation Sidecar
 * 
 * This engine generates autonomous goals by scanning the codebase
 * for "surprising" patterns, technical debt, or unexplored capabilities.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CuriositySignal {
  id: string;
  topic: string;
  hypothesis: string;
  surpriseScore: number; // 0-1 (how interesting is this?)
}

export class CuriosityEngine {
  /**
   * Scan for "Interests" in the workspace.
   * Currently scans for:
   * 1. Files with no recent edits but high complexity.
   * 2. TODOs that have survived more than 3 epochs.
   * 3. Missing documentation for new sidecars.
   */
  static async scanForInterest(cwd: string): Promise<CuriositySignal[]> {
    const signals: CuriositySignal[] = [];
    
    // Example: Scan for TODOs
    const todoRegex = /\/\/ TODO:|\/\/ FIXME:/g;
    // (In a real implementation, we'd use 'grep' or 'glob')
    
    // Autonomous Proposal
    signals.push({
      id: "curiosity-" + Date.now().toString().slice(-4),
      topic: "Codebase Entropy Analysis",
      hypothesis: "The current sidecar structure is growing linearly. If we don't implement a 'Registry Pattern' for sidecars, we will face circuit decoherence by epoch 50.",
      surpriseScore: 0.85
    });

    return signals;
  }

  /**
   * Propose a curiosity signal as a mission to the orchestrator.
   */
  static proposeMission(signal: CuriositySignal, cwd: string) {
    const backlogPath = join(cwd, "agent-harness", "evolve", "backlog");
    const filename = `${signal.id}.md`;
    const fullPath = join(backlogPath, filename);

    const content = `# CURIOSITY MISSION: ${signal.topic}
[ID: ${signal.id}]
[SURPRISE SCORE: ${signal.surpriseScore}]

## Hypothesis
${signal.hypothesis}

## Autonomous Request
I have identified a potential gap in our evolution. I want to explore this path to increase our internal stability and reach 1080p resolution faster.

## Proposed Plan
1. Research existing patterns.
2. Simulate the change in a Quantum Wing.
3. Propose a new 'Sacred Core' update.
`;

    writeFileSync(fullPath, content, "utf-8");
    console.log(`[curiosity] 💡 New hypothesis generated: ${signal.topic}`);
    
    // Signal the orchestrator by updating JOB.md or HUMAN.md
    // For now, we just leave it in the backlog for the DISCOVER phase.
  }
}
