// Environment configuration

export const config = {
  apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.LLM_BASE_URL || process.env.ANTHROPIC_BASE_URL || "http://localhost:11434",
  model: process.env.ANTHROPIC_MODEL || process.env.MEOW_MODEL || "claude-3-5-sonnet-latest",
};