import { runLeanAgent } from "./agent-kernel/src/core/lean-agent.ts";
console.log("Testing lean agent...");
try {
  const result = await runLeanAgent("Say hello in 3 words", { maxIterations: 1 });
  console.log("Result:", result.content.slice(0, 100));
} catch (e) {
  console.error("Error:", e.message);
}