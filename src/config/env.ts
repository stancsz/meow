// Environment configuration

export interface MeowConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  embeddingDimension: number;
  // Reproducibility
  seed: number | undefined;
  deterministic: boolean;
  // Budget
  budgetCents: number | undefined;
  // Observability
  auditDir: string;
  // Ambiguity
  ambiguityThreshold: number;
}

function parseIntOrUndefined(env: string | undefined): number | undefined {
  if (!env) return undefined;
  const v = parseInt(env, 10);
  return isNaN(v) ? undefined : v;
}

function parseBool(env: string | undefined, fallback: boolean): boolean {
  if (!env) return fallback;
  return env === "1" || env === "true" || env === "yes";
}

export const config: MeowConfig = {
  apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.LLM_BASE_URL || process.env.ANTHROPIC_BASE_URL || "http://localhost:11434",
  model: process.env.ANTHROPIC_MODEL || process.env.MEOW_MODEL || "claude-3-5-sonnet-latest",

  embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || "1536"),

  // Reproducibility
  seed: parseIntOrUndefined(process.env.MEOW_SEED),
  deterministic: parseBool(process.env.MEOW_DETERMINISTIC, false),

  // Budget (per mission, in US cents)
  budgetCents: parseIntOrUndefined(process.env.MEOW_BUDGET_CENTS),

  // Audit log path
  auditDir: process.env.MEOW_AUDIT_DIR || `${process.env.HOME || "."}/.meow/audit`,

  // Ambiguity: agent asks for clarification if uncertainty > this threshold (0.0-1.0)
  ambiguityThreshold: parseFloat(process.env.MEOW_AMBIGUITY_THRESHOLD || "0.7"),
};