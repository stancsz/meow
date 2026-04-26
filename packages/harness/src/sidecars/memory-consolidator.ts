/**
 * memory-consolidator.ts - Autonomous Memory Consolidation Sidecar
 * 
 * Analyzes mission logs to extract high-value memories:
 * - Facts: New discoveries or confirmed knowledge.
 * - Preferences: Stylistic choices or workflow favorites.
 * - Lessons: Solutions to errors or identified risks (Self-Healing).
 */

import { storeMemory } from "../../agent-kernel/src/sidecars/memory-fts";
import { runLeanAgent } from "../../agent-kernel/src/core/lean-agent.ts";

export interface ConsolidationResult {
  success: boolean;
  factsStored: number;
  message: string;
}

/**
 * Consolidates memories from a completed job run.
 */
export async function consolidateJobMemories(
  jobName: string,
  missionPrompt: string,
  outputBuffer: string,
  exitCode: number | null
): Promise<ConsolidationResult> {
  console.log(`[consolidator] Analyzing mission for long-term memory: ${jobName}`);

  const status = exitCode === 0 ? "SUCCESS" : "FAILURE";
  
  const consolidatorPrompt = `You are the Memory Architect (Enzo). Your job is to extract LONG-TERM MEMORY from a recent agent mission.

MISSION: ${jobName}
STATUS: ${status}
PROMPT: ${missionPrompt}
LOGS (truncated): ${outputBuffer.slice(-4000)}

Extract the following in JSON format:
1. "facts": List of solid facts discovered (e.g. "Library X version Y has a bug in function Z").
2. "preferences": User/Project styles identified (e.g. "Project uses HSL for custom colors").
3. "lessons": If mission failed, what was the EXACT reason and the fix? If success, what was the key breakthrough?
4. "importance": 1-5 scale.

Respond ONLY with JSON:
{
  "memories": [
    { "key": "short-title", "value": "detailed observation", "type": "fact|preference|lesson", "importance": 1-5, "tags": ["tag1", "tag2"] }
  ]
}`;

  try {
    const result = await runLeanAgent("Extract long-term memories from mission logs.", {
      maxIterations: 1,
      systemPrompt: consolidatorPrompt
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, factsStored: 0, message: "No JSON memories found in response" };
    }

    const data = JSON.parse(jsonMatch[0]);
    const memories = data.memories || [];
    
    for (const mem of memories) {
      storeMemory(mem.key, mem.value, {
        tags: [...(mem.tags || []), mem.type, jobName.split(":")[0]],
        source: "evolve",
        importance: mem.importance || 3,
        wing: "Sovereign Palace",
        room: mem.type === "preference" ? "Preferences" : mem.type === "lesson" ? "Library of Failures" : "Knowledge Base",
        drawer: jobName
      });
    }

    return { 
      success: true, 
      factsStored: memories.length, 
      message: `Consolidated ${memories.length} memories into the Palace.` 
    };
  } catch (e: any) {
    console.error("[consolidator] Error:", e);
    return { success: false, factsStored: 0, message: e.message };
  }
}
