/**
 * L1: THE LIAISON (Interaction Layer)
 *
 * Surface agent for immediate user feedback. Non-blocking chat interface
 * that streams initial model thoughts while handing off to L2 for deep planning.
 *
 * Key Requirements:
 * 1. Respond to any user request within < 500ms with a confirmation or initial plan
 * 2. Extract intent and distill user prompts into MissionBriefs for L2
 * 3. Support multi-modal feedback (text, status indicators, progress bars)
 * 4. Use a high-speed model (e.g. Gemini 3 Flash)
 */

import { Agent } from "../agent/agent";
import { MissionBrief, createMissionBrief } from "./MissionBrief";
import { config } from "../config/env";
import pc from "picocolors";

export interface LiaisonConfig {
  /** Model to use for fast-path L1 responses (default: Gemini Flash) */
  fastModel?: string;
  /** Base URL for the fast model */
  fastModelBaseUrl?: string;
  /** API key for the fast model */
  fastModelApiKey?: string;
  /** Maximum time (ms) for initial response before streaming times out */
  initialResponseTimeoutMs?: number;
  /** Whether to enable streaming of initial thoughts */
  enableStreaming?: boolean;
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface LiaisonResponse {
  /** The L1 response text */
  text: string;
  /** The distilled mission brief for L2 */
  brief: MissionBrief;
  /** Whether the response was streamed */
  streamed: boolean;
  /** Time taken for initial response (ms) */
  responseTimeMs: number;
}

type StatusCallback = (status: string) => void;

/**
 * L1 Liaison: Fast-path interaction layer with intent extraction.
 *
 * Provides non-blocking chat that:
 * 1. Immediately acknowledges user requests (< 500ms)
 * 2. Streams initial model thoughts for transparency
 * 3. Distills intent into MissionBrief for L2 Architect
 */
export class Liaison {
  private agent: Agent;
  private config: Required<LiaisonConfig>;
  private abortController: AbortController | null = null;

  constructor(agent: Agent, config: LiaisonConfig = {}) {
    this.agent = agent;
    this.config = {
      fastModel: config.fastModel || "gemini-2.0-flash",
      fastModelBaseUrl: config.fastModelBaseUrl || "https://api.google.ai/completion",
      fastModelApiKey: config.fastModelApiKey || "",
      initialResponseTimeoutMs: config.initialResponseTimeoutMs || 500,
      enableStreaming: config.enableStreaming ?? true,
    };
  }

  /**
   * Non-blocking chat interface for L1 interaction.
   *
   * Flow:
   * 1. Immediately return acknowledgment (< 500ms)
   * 2. Stream initial thoughts for transparency
   * 3. Distill intent into MissionBrief
   * 4. Return full response with brief for L2 handoff
   */
  public async chat(
    input: string,
    onStream?: (chunk: StreamChunk) => void,
    onStatus?: StatusCallback
  ): Promise<LiaisonResponse> {
    const startTime = Date.now();
    this.abortController = new AbortController();

    onStatus?.("Parsing intent...");

    // Step 1: Fast intent extraction (< 100ms target)
    const brief = await this.extractIntent(input);
    onStatus?.("Intent parsed");

    // Step 2: Generate initial response with optional streaming
    onStatus?.("Generating response...");
    const response = await this.generateResponse(input, brief, onStream, onStatus);

    const responseTimeMs = Date.now() - startTime;

    return {
      text: response,
      brief,
      streamed: onStream !== undefined,
      responseTimeMs,
    };
  }

  /**
   * Extract intent from user input and populate MissionBrief.
   * Uses a lightweight classification approach for speed.
   */
  private async extractIntent(input: string): Promise<MissionBrief> {
    const brief = createMissionBrief(input);
    const lowerInput = input.toLowerCase();

    // Intent classification
    if (/\b(create|implement|add|build|make|new)\b/.test(lowerInput)) {
      brief.intent = "implement";
    } else if (/\b(fix|debug|bug|error|issue|problem|broken)\b/.test(lowerInput)) {
      brief.intent = "debug";
    } else if (/\b(refactor|restructure|reorganize|clean)\b/.test(lowerInput)) {
      brief.intent = "refactor";
    } else if (/\b(test|spec|specs|verify|testing)s?\b/.test(lowerInput)) {
      brief.intent = "test";
    } else if (/\bdeploy\b|\brelease\b|\bpush\b|\bship\b/.test(lowerInput)) {
      brief.intent = "deploy";
    } else if (/\b(search|find|look|research|investigate)\b/.test(lowerInput)) {
      brief.intent = "research";
    }

    // Domain extraction (simple keyword-based)
    const domainPatterns = [
      { pattern: /\b(database|db|sql|query|migration)\b/i, domain: "database" },
      { pattern: /\b(api|endpoint|rest|graphql|http)\b/i, domain: "api" },
      { pattern: /\b(auth|login|authenticate|jwt|oauth)\b/i, domain: "auth" },
      { pattern: /\b(ui|frontend|component|button|modal)\b/i, domain: "frontend" },
      { pattern: /\b(test|jest|vitest)\b/i, domain: "testing" },
      { pattern: /\b(deploy|kubernetes|k8s|docker|ci\/cd)\b/i, domain: "devops" },
      { pattern: /\b(mcp|tool|server|integration)\b/i, domain: "integration" },
      { pattern: /\b(agent|swarm|orchestrat)\b/i, domain: "agent" },
    ];

    for (const { pattern, domain } of domainPatterns) {
      if (pattern.test(lowerInput)) {
        brief.domain = domain;
        break;
      }
    }

    // Desired outcome (use input as starting point)
    brief.desiredOutcome = input;

    // Target files (simple heuristic: look for quoted paths or known extensions)
    const filePattern = /["'`]([^"']+\.(ts|js|tsx|jsx|py|go|rs))["'`]/g;
    let match;
    while ((match = filePattern.exec(input)) !== null) {
      brief.targetFiles.push(match[1]);
    }

    // Success criteria
    if (/\btest\b/i.test(lowerInput)) {
      brief.successCriteria = { acceptanceCriteria: ["tests pass"] };
    }

    // Priority
    if (/\b(urgent|asap|critical|emergency)\b/.test(lowerInput)) {
      brief.priority = "critical";
    } else if (/\b(someday|low priority|whenever)\b/.test(lowerInput)) {
      brief.priority = "low";
    }

    // Success criteria for test intent
    if (brief.intent === "test") {
      brief.successCriteria = { acceptanceCriteria: ["tests pass"] };
    }

    // Complexity estimation (simple word count + keyword heuristics)
    const wordCount = input.split(/\s+/).length;
    let complexity = Math.min(100, wordCount * 2);

    // Increase complexity for multi-file indicators
    if (/multiple|different|various|several/.test(lowerInput)) {
      complexity += 20;
    }
    // Increase for technical indicators
    if (/\bapi|database|auth|concurrent|parallel|distributed\b/.test(lowerInput)) {
      complexity += 15;
    }
    // Cap complexity for simple requests
    if (/\bfix.*bug\b|\btypo\b|\bformat\b/.test(lowerInput)) {
      complexity = Math.min(complexity, 20);
    }

    brief.complexity = Math.min(100, Math.max(5, complexity));

    return brief;
  }

  /**
   * Generate a response with optional streaming.
   * Returns a promise that resolves when the full response is ready.
   */
  private async generateResponse(
    input: string,
    brief: MissionBrief,
    onStream?: (chunk: StreamChunk) => void,
    onStatus?: StatusCallback
  ): Promise<string> {
    const fastModel = this.config.fastModel;
    const isGeminiFlash = fastModel.includes("gemini") || fastModel.includes("flash");

    // Build intent-aware prompt
    const prompt = this.buildResponsePrompt(input, brief);

    if (onStream && this.config.enableStreaming) {
      return this.streamResponse(prompt, onStream, onStatus);
    }

    // Non-streaming path
    return this.callFastModel(prompt);
  }

  /**
   * Build the prompt for L1 response generation.
   */
  private buildResponsePrompt(input: string, brief: MissionBrief): string {
    return `You are MEOW L1, a fast-response coding assistant.

TASK: Provide a quick acknowledgment and initial plan for the user's request.
Keep responses concise, actionable, and under 200 words.

USER REQUEST: ${input}

INTENT: ${brief.intent}
DOMAIN: ${brief.domain}
PRIORITY: ${brief.priority}

FORMAT: Respond with a brief confirmation that shows you understand the request,
followed by 2-3 bullet points of your initial approach. Be confident but concise.`;
  }

  /**
   * Call the fast model for response generation.
   */
  private async callFastModel(prompt: string): Promise<string> {
    const { fastModelBaseUrl, fastModelApiKey } = this.config;

    // Try Google AI format first (for Gemini Flash)
    if (fastModelBaseUrl.includes("google")) {
      try {
        const url = `${fastModelBaseUrl}/v1beta/models/${this.config.fastModel}:generateContent`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(fastModelApiKey ? { "Authorization": `Bearer ${fastModelApiKey}` } : {}),
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
          }),
          signal: this.abortController?.signal,
        });

        if (response.ok) {
          const data = await response.json() as any;
          return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch {
        // Fall through to default
      }
    }

    // Fallback to Ollama/OpenAI-compatible format
    return this.agent.callLLM(prompt, []);
  }

  /**
   * Stream response chunks to the callback.
   */
  private async streamResponse(
    prompt: string,
    onStream: (chunk: StreamChunk) => void,
    onStatus?: StatusCallback
  ): Promise<string> {
    const chunks: string[] = [];

    // For streaming, we'll use the agent's LLM call but simulate chunks
    // In production, this would use SSE or similar streaming protocol
    try {
      const response = await this.callFastModel(prompt);

      // Simulate streaming by yielding chunks of words
      const words = response.split(" ");
      for (let i = 0; i < words.length; i++) {
        const text = words[i] + (i < words.length - 1 ? " " : "");
        chunks.push(text);
        onStream({ text, done: false });

        // Yield to event loop every few words
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      onStream({ text: "", done: true });
      return chunks.join("");
    } catch (e: any) {
      if (e.name === "AbortError") {
        return "Request was cancelled.";
      }
      throw e;
    }
  }

  /**
   * Update an existing brief with additional context.
   */
  public async enrichBrief(
    brief: MissionBrief,
    context: { files?: string[]; skills?: string[]; mcpServers?: string[] }
  ): Promise<MissionBrief> {
    // Merge additional context into the brief
    if (context.files) {
      brief.targetFiles = [...new Set([...brief.targetFiles, ...context.files])];
    }

    // Re-estimate complexity based on target files
    if (brief.targetFiles.length > 5) {
      brief.complexity = Math.min(100, brief.complexity + 10);
    }

    return brief;
  }

  /**
   * Cancel any in-progress request.
   */
  public cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Get current configuration.
   */
  public getConfig(): Required<LiaisonConfig> {
    return { ...this.config };
  }
}
