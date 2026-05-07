import { describe, it, expect } from "vitest";
import { QuantumReasoning, ReasoningConstraint } from "../../src/agent/quantum_reasoning";

describe("QuantumReasoning", () => {
  it("should respect constraints when solving a decision space", async () => {
    const reasoning = new QuantumReasoning();
    const space = ["Choice A", "Choice B", "Choice C", "Choice D"];
    
    // Constraint that strongly favors Choice C
    const constraints: ReasoningConstraint[] = [
      {
        id: "FAVOR_C",
        weight: 100,
        evaluate: (choice: string) => choice === "Choice C"
      }
    ];

    // Run multiple times to see if it consistently picks Choice C
    let cCount = 0;
    const iterations = 5;
    
    for (let i = 0; i < iterations; i++) {
      const winner = await reasoning.solve(space, constraints);
      if (winner === "Choice C") {
        cCount++;
      }
    }

    // Since it currently ignores constraints, it should likely fail this test
    // (It might pick Choice C by chance, but over many iterations it's unlikely to be 100%)
    expect(cCount).toBe(iterations);
  });
});
