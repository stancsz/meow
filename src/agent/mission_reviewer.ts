import { exec } from "child_process";
import { promisify } from "util";
import pc from "picocolors";
import { Agent } from "./agent";
import { ReasoningConstraint } from "./quantum_reasoning";

const execAsync = promisify(exec);

export class MissionReviewer {
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * Performs a Quantum Structural Analysis of the current workspace.
   */
  public async verify(goal: string, testCmd?: string): Promise<string> {
    console.log(pc.bold(pc.cyan("\n🧐 [QUANTUM REVIEW] Starting structural analysis...")));
    
    // 1. Analyze Changes (Async)
    let diff = "";
    try {
      const { stdout } = await execAsync("git diff HEAD~1", { encoding: "utf-8" });
      diff = stdout;
    } catch (e) {
      try {
        const { stdout } = await execAsync("git diff", { encoding: "utf-8" });
        diff = stdout;
      } catch (e2) {
        diff = "Unable to fetch diff.";
      }
    }

    // 2. Quantum Coherence Evaluation
    const constraints: ReasoningConstraint[] = [
      {
        id: "STRUCTURAL_ALIGNMENT",
        weight: 30,
        evaluate: (state: any) => {
          // Quantum Coherence: Does the logic in the diff map to the goal's intent?
          const intents = goal.toLowerCase().split(" ");
          const density = intents.filter(i => state.diff.toLowerCase().includes(i)).length / intents.length;
          return density > 0.4;
        }
      },
      {
        id: "ENTROPY_REDUCTION",
        weight: 20,
        evaluate: (state: any) => {
          // Surgicality: Does the diff avoid unnecessary churn?
          return state.diff.length < 5000; 
        }
      }
    ];

    const decisionSpace = [{ diff, goal }];
    const result = await this.agent.quantumReasoning.solve(decisionSpace, constraints, (msg) => {
      process.stdout.write(`\r${pc.dim("Analyzing Coherence: " + msg)}`);
    });
    process.stdout.write("\n"); // Clear the inline progress line

    // 3. Execution Verification (Async)
    let testResult = "";
    if (testCmd) {
      try {
        const { stdout } = await execAsync(testCmd, { encoding: "utf-8", timeout: 60000 });
        testResult = stdout;
        console.log(pc.green("\n✅ [PHYSICS CHECK] Tests passed."));
      } catch (e: any) {
        testResult = e.stdout || e.message;
        console.log(pc.red("\n❌ [PHYSICS CHECK] Tests failed."));
      }
    }

    const passed = (!testCmd || !testResult.includes("failed")) && result !== null;
    
    if (passed) {
      return `VERDICT: MISSION COHERENT.\nStructural analysis suggests high alignment with goal [${goal}].\n${testCmd ? "System physics (tests) confirmed." : "Quantum coherence confirmed."}`;
    } else {
      return `VERDICT: MISSION DECOHERED.\nDetected logic gaps or test failures.\nERROR: ${testResult.substring(0, 500)}`;
    }
  }
}
