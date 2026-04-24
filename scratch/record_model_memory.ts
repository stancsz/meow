import { initMemoryFts, storeMemory } from "../agent-kernel/src/sidecars/memory-fts";

initMemoryFts();

storeMemory("Model Strategy", "The currently used models (Claude 3.5, GPT-4o, Gemini 1.5 Pro) are considered old/legacy. The kernel needs to prepare for next-gen model integration (e.g. Claude 4, GPT-5, Gemini 2) and prioritize frontier-grade intelligence over legacy benchmarks.", {
  wing: "Intelligence",
  room: "Strategy",
  drawer: "ModelSelection",
  source: "user",
  tags: ["obsolescence", "future-proofing", "models"]
});

console.log("Memory stored: Model Obsolescence acknowledged.");
