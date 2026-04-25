/**
 * error-classifier.ts
 * 
 * Intelligent error classification system inspired by hermes-agent.
 * Categorizes errors to decide on retries, failovers, or logic corrections.
 */

export enum ErrorCategory {
  TRANSIENT = "TRANSIENT",     // Rate limits, network glitches (Retryable)
  RECOVERY = "RECOVERY",       // Resource missing or slight tool misuse (Suggest recovery)
  LOGIC = "LOGIC",             // Syntax errors, invalid logic (Prompt agent to fix)
  CRITICAL = "CRITICAL",       // Auth failure, security block (Stop immediately)
  UNKNOWN = "UNKNOWN",
}

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  suggestion?: string;
  shouldRetry: boolean;
  backoffMs?: number;
}

export function classifyError(error: any): ClassifiedError {
  const msg = error?.message || String(error);

  // 1. Transient Errors (Rate limits)
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
    return {
      category: ErrorCategory.TRANSIENT,
      message: msg,
      shouldRetry: true,
      backoffMs: 5000, // Suggest a 5s jittered backoff
    };
  }

  // 2. Recovery Errors (Typical tool-use friction)
  if (msg.includes("not found") || msg.includes("ENOENT") || msg.includes("no such file")) {
    return {
      category: ErrorCategory.RECOVERY,
      message: msg,
      suggestion: "The file or directory was not found. Try listing the directory content first.",
      shouldRetry: false,
    };
  }

  // 3. Logic/Content Errors
  if (msg.includes("Unexpected token") || msg.includes("is not recognized")) {
    return {
      category: ErrorCategory.LOGIC,
      message: msg,
      suggestion: "There is a syntax or logic error in your previous command. Please fix it and try again.",
      shouldRetry: false,
    };
  }

  // 4. Critical Errors
  if (msg.includes("401") || msg.includes("403") || msg.includes("BLOCKED")) {
    return {
      category: ErrorCategory.CRITICAL,
      message: msg,
      shouldRetry: false,
    };
  }

  return {
    category: ErrorCategory.UNKNOWN,
    message: msg,
    shouldRetry: false,
  };
}
