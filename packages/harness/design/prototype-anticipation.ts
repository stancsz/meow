#!/usr/bin/env bun
/**
 * prototype-anticipation.ts
 * 
 * Prototype demonstrating the ANTICIPATION UI pattern.
 * Shows how the magic moment works: user sees intent BEFORE execution.
 * 
 * Run with: bun run design/prototype-anticipation.ts
 */

import { createAnticipationUI, detectIntent, type IntentStep } from "../computer/anticipation-ui";

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  🎯 ANTICIPATION UI PROTOTYPE — The Magic Moment");
console.log("═══════════════════════════════════════════════════════════════════");
console.log("");
console.log("This prototype shows how humans and AI agents collaborate:");
console.log("");
console.log("  1. User gives a task");
console.log("  2. Agent shows its PLAN (the magic moment!)");
console.log("  3. User approves/modifies/cancels BEFORE any action");
console.log("  4. Agent executes (with live progress)");
console.log("  5. Agent shows results");
console.log("");
console.log("───────────────────────────────────────────────────────────────────");
console.log("");

// ============================================================================
// Scenarios
// ============================================================================

interface Scenario {
  name: string;
  description: string;
  task: string;
}

const scenarios: Scenario[] = [
  {
    name: "Safe Navigation",
    description: "Low-risk task - should auto-confirm",
    task: "click Settings, then click Profile",
  },
  {
    name: "Destructive Action",
    description: "HIGH risk - requires explicit confirmation",
    task: "click Delete Account button, then press Enter",
  },
  {
    name: "Mixed Risk Task",
    description: "Combines low and high risk steps",
    task: "click Open File, then click Delete Everything button",
  },
  {
    name: "Form Submission",
    description: "MEDIUM risk - commits a change",
    task: "click Submit Order, then press Enter",
  },
];

// ============================================================================
// Demo Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScenario(scenario: Scenario): Promise<void> {
  console.log("");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(`  Scenario: ${scenario.name}`);
  console.log(`  ${scenario.description}`);
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("");
  console.log(`📝 User says: "${scenario.task}"`);
  console.log("");

  // Step 1: Detect intent
  console.log("🧠 Agent detects intent...");
  const steps = detectIntent(scenario.task);
  console.log(`   Found ${steps.length} step(s)`);
  
  for (const step of steps) {
    const riskIcon = step.riskLevel === "HIGH" ? "🔴" : step.riskLevel === "MEDIUM" ? "🟡" : "🟢";
    console.log(`   ${riskIcon} ${step.riskLevel}: ${step.action.tool} → "${step.action.target}"`);
  }
  console.log("");

  // Step 2: Show anticipation preview
  console.log("🤔 ✨ THE MAGIC MOMENT ✨ — Agent shows its plan...");
  console.log("");
  
  const ui = createAnticipationUI({ 
    channel: "null", // Non-interactive for demo
    autoConfirmLowRisk: true,
  });
  
  const confirmation = await ui.preview(steps);
  console.log(`\n📋 User response: ${confirmation}`);
  
  if (confirmation === "cancel") {
    console.log("❌ Plan cancelled — no actions taken");
    return;
  }
  
  if (confirmation === "proceed") {
    console.log("✅ Plan approved — executing...");
  }
  
  // Step 3: Simulate execution with progress updates
  await delay(500);
  
  for (let i = 0; i < steps.length; i++) {
    await ui.update({
      step: i + 1,
      total: steps.length,
      status: "executing",
      description: `${steps[i].action.tool} → "${steps[i].action.target}"`,
    });
    
    await delay(300);
    
    await ui.update({
      step: i + 1,
      total: steps.length,
      status: "verifying",
      description: "Verifying result...",
    });
    
    await delay(200);
    
    await ui.update({
      step: i + 1,
      total: steps.length,
      status: "done",
      description: "Complete",
    });
  }
  
  // Step 4: Show completion
  await delay(300);
  await ui.complete({
    success: true,
    steps: steps.map((s, i) => ({
      step: i + 1,
      total: steps.length,
      status: "done" as const,
      description: `${s.action.tool} → "${s.action.target}"`,
      durationMs: Math.floor(Math.random() * 300) + 100,
    })),
    summary: `${steps.length} action(s) completed successfully`,
    changes: steps.map(s => `${s.action.tool}: ${s.action.target}`),
  });
}

// ============================================================================
// Main Demo Loop
// ============================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  Running all scenarios (non-interactive mode)...");
  console.log("═══════════════════════════════════════════════════════════════════");
  
  for (const scenario of scenarios) {
    await runScenario(scenario);
    await delay(1000); // Pause between scenarios
  }
  
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  PROTOTYPE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Key Takeaways:");
  console.log("");
  console.log("  ✨ ANTICIPATION is the magic moment");
  console.log("     - User sees what the agent plans to do BEFORE execution");
  console.log("     - Allows course correction before damage is done");
  console.log("");
  console.log("  🔴 Risk levels gate confirmation");
  console.log("     - LOW: Auto-confirm (trust the user knows what they want)");
  console.log("     - MEDIUM: Show preview, allow confirmation");
  console.log("     - HIGH: Require explicit approval");
  console.log("");
  console.log("  📋 Visual preview builds trust");
  console.log("     - Shows reasoning for each step");
  console.log("     - Shows confidence if element targeting");
  console.log("     - Shows what will change before it changes");
  console.log("");
  console.log("───────────────────────────────────────────────────────────────────");
  console.log("Next Steps:");
  console.log("  1. Integrate into computer_agent.ts (DONE)");
  console.log("  2. Add Discord reaction-based confirmation (TODO)");
  console.log("  3. Build LLM-powered intent detection (TODO)");
  console.log("  4. Test with real user scenarios (TODO)");
  console.log("───────────────────────────────────────────────────────────────────");
}

// Run the demo
main().catch(console.error);