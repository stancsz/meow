/**
 * benchmark-llm-connectivity.ts
 *
 * Simple benchmark to verify LLM connectivity is working.
 * Used by the Ratchet pattern when adding new tools.
 */
import { initializeToolRegistry, executeTool } from "../sidecars/tool-registry.ts";
import { runLeanAgent } from "../core/lean-agent.ts";

export async function runConnectivityBenchmark(): Promise<{ score: number; message: string }> {
  try {
    await initializeToolRegistry();

    // Test 1: Simple LLM call
    const result = await runLeanAgent("Respond with exactly one word: 'hello'", {
      maxIterations: 1,
      timeoutMs: 30000,
    });

    const hasContent = result.content.trim().length > 0;

    // Test 2: Tool registry accessible
    const tools = await import("../sidecars/tool-registry.ts");
    const hasConsult = tools.getTool("consult") !== undefined;
    const hasMultiConsult = tools.getTool("multi_consult") !== undefined;

    let score = 0;
    if (hasContent) score += 50;
    if (hasConsult) score += 25;
    if (hasMultiConsult) score += 25;

    return {
      score,
      message: score === 100
        ? "All checks passed"
        : `Partial failure: content=${hasContent}, consult=${hasConsult}, multi_consult=${hasMultiConsult}`,
    };
  } catch (e: any) {
    return { score: 0, message: `Benchmark failed: ${e.message}` };
  }
}

// CLI runner
if (import.meta.main) {
  runConnectivityBenchmark().then((result) => {
    console.log(`Score: ${result.score}`);
    console.log(`Message: ${result.message}`);
    process.exit(result.score >= 50 ? 0 : 1);
  });
}