// ============================================================================
// 720p Enhancements: Q-Wing Integration
// ============================================================================

/**
 * Initialize Q-Wing and Sovereign Palace on demand
 */
async function initQWing(): Promise<any> {
  try {
    const module = await import("./q-wing");
    return module.QWingManager;
  } catch {
    return null;
  }
}

async function initPalace(): Promise<any> {
  try {
    const module = await import("./sovereign-palace");
    return module.SovereignPalace;
  } catch {
    return null;
  }
}

/**
 * Quantum Reason + Parallel Wing Exploration
 * Uses Q-Wing to explore multiple solution paths concurrently
 */
export async function quantumReasonWithWings(
  change: ChangeRequest,
  exploreSolutions = true
): Promise<{
  decision: QuantumDecision;
  wings?: string[];
  palaceInsight?: string;
}> {
  console.log(`[quantum-reasoner] Analyzing with parallel wings: ${change.description}`);

  // First get the base decision
  const decision = await quantumReason(change);

  // If high risk or exploration requested, spawn parallel wings
  if (exploreSolutions && decision.probability < 70) {
    try {
      const QWingClass = await initQWing();
      const PalaceClass = await initPalace();

      if (QWingClass && PalaceClass) {
        const wingManager = new QWingClass();
        const palace = new PalaceClass();

        // Feel the system state
        const state = await palace.feel({
          currentTask: change.targetQubit
        });

        // Spawn wings based on probability
        const numWings = decision.probability < 50 ? 3 : 2;
        const wingIds: string[] = [];

        const prompts = [
          `Primary solution for ${change.targetQubit}: ${change.description}`,
          `Alternative approach for ${change.targetQubit}: ${change.description}`,
          `Conservative fix for ${change.targetQubit}: ${change.description}`
        ];

        for (let i = 0; i < numWings; i++) {
          const wing = wingManager.spawnWing(
            `QW-${change.targetQubit}-${i + 1}`,
            change.targetQubit,
            prompts[i] + `\n\nWARNING: Previous approach had ${100 - decision.probability}% risk of failure.`
          );
          if (wing) {
            wingIds.push(wing.id);
          }
        }

        return {
          decision,
          wings: wingIds,
          palaceInsight: `System alertness: ${(state.alertness * 100).toFixed(0)}%, coherence: ${(state.coherence * 100).toFixed(0)}%`
        };
      }
    } catch (e) {
      console.error("[quantum-reasoner] Wing spawning failed:", e);
    }
  }

  return { decision };
}

/**
 * Use Sovereign Palace to recall lessons for a change
 */
export async function recallPalaceLessons(change: ChangeRequest): Promise<string[]> {
  try {
    const PalaceClass = await initPalace();
    if (PalaceClass) {
      const palace = new PalaceClass();
      const lessons = await palace.recallLessons(change.description, 5);
      return lessons.map((l: any) => l.value);
    }
  } catch (e) {
    console.error("[quantum-reasoner] Palace recall failed:", e);
  }
  return [];
}

/**
 * Adaptive reasoning: use memory to adjust probability
 */
export async function adaptiveQuantumReason(
  change: ChangeRequest,
  proposedBy: string
): Promise<QuantumDecision> {
  // Get base decision
  const decision = await quantumReason(change);

  // Recall relevant lessons from Palace
  const lessons = await recallPalaceLessons(change);

  // Adjust probability based on prior knowledge
  if (lessons.length > 0) {
    const adjustment = Math.min(15, lessons.length * 5);
    decision.probability = Math.min(95, decision.probability + adjustment);
    decision.gates.push(`Adjusted +${adjustment}% from ${lessons.length} relevant lessons from Palace`);
  }

  // Add warnings if lessons indicate past failures
  for (const lesson of lessons) {
    if (lesson.toLowerCase().includes("fail")) {
      decision.warnings.push({
        sourceQubit: change.targetQubit,
        targetQubit: "Palace",
        severity: "MEDIUM",
        reason: lesson.slice(0, 100)
      });
    }
  }

  return decision;
}