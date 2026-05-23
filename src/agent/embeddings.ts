/**
 * Real embeddings using @xenova/transformers (local MiniLM-L6-v2).
 * Phase 1.3 from docs/AI_NATIVE_MEOW_PLAN.md
 */
import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let pipelineLoading: Promise<void> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) return embeddingPipeline;
  if (pipelineLoading) {
    await pipelineLoading;
    return embeddingPipeline!;
  }
  pipelineLoading = (async () => {
    embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
  })();
  await pipelineLoading;
  return embeddingPipeline!;
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const out = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(out) as number[];
}