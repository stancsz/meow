/**
 * meow-agent.ts - Meow Agent Client
 *
 * Wraps the Meow native agent (agent-kernel's runLeanAgent) as a
 * ClaudeCodeClient-compatible interface for the relay.
 *
 * In Docker, agent-kernel source is mounted at /app/agent-kernel
 * and node_modules (with openai, etc.) are at /app/node_modules.
 *
 * We use meow-run.ts as a thin launcher that can properly resolve
 * the TypeScript imports from within the /app context.
 *
 * EPOCH 24: Supports JSON mode for full AgentResult return (including tool_calls)
 * to enable skill crystallization at the harness level.
 */
import { spawn } from "node:child_process";
import { AgentState } from "./agent-types";

const MEOW_TIMEOUT_MS = parseInt(process.env.MEOW_TIMEOUT_MS || "300000");

// EPOCH 24: AgentResult type for JSON mode (mirrors @meow/kernel)
export interface AgentResult {
  content: string;
  iterations: number;
  completed: boolean;
  messages?: Array<{
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export class MeowAgentClient {
  private readonly meowRunPath = "/app/meow-run.ts";
  private readonly timeoutMs: number;
  
  // EPOCH 17: State tracking for rich agent state indicators
  private _currentState: AgentState = AgentState.THINKING;
  
  private setState(state: AgentState, message?: string): void {
    this._currentState = state;
  }
  
  get currentState(): AgentState {
    return this._currentState;
  }
  
  // EPOCH 17: Track tool execution with contextual state changes
  async executeToolWithState(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    this.setState(AgentState.EXECUTING, `Executing ${toolName}...`);
    // ... tool execution logic
    this.setState(AgentState.COMPLETE, `Completed ${toolName}`);
    return "";
  }

  constructor() {
    this.timeoutMs = parseInt(process.env.MEOW_TIMEOUT_MS || String(MEOW_TIMEOUT_MS));
  }

  /**
   * Spawn meow-run.ts with the prompt as CLI arguments.
   * All words after "--" become process.argv in meow-run.ts.
   */
  async prompt(text: string): Promise<string> {
    const words = text.split(" ");
    return new Promise((resolve, reject) => {
      const proc = spawn(
        "bun",
        ["run", "--bun", this.meowRunPath, "--", ...words],
        {
          cwd: process.env.CLAUDE_CWD || "/app",
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
          shell: false,
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        reject(new Error(`Meow timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on("close", (code) => {
        if (timedOut) return;
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          const errMsg = stderr.trim() || `Meow exited with code ${code}`;
          reject(new Error(errMsg));
        }
      });

      proc.on("error", (err) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(new Error(`Meow spawn error: ${err.message}`));
      });
    });
  }

  /**
   * EPOCH 24: JSON prompt - returns full AgentResult including messages[] with tool_calls.
   * This enables harness-level skill crystallization via DoneHooks.
   */
  async promptJson(text: string): Promise<AgentResult> {
    const words = text.split(" ");
    return new Promise((resolve, reject) => {
      const proc = spawn(
        "bun",
        ["run", "--bun", "/app/meow-run.ts", "--json", "--", ...words],
        {
          cwd: process.env.CLAUDE_CWD || "/app",
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
          shell: false,
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        reject(new Error(`Meow JSON prompt timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on("close", (code) => {
        if (timedOut) return;
        clearTimeout(timer);
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim()) as AgentResult;
            resolve(result);
          } catch (parseErr) {
            reject(new Error(`Failed to parse AgentResult JSON: ${stdout.slice(0, 200)}`));
          }
        } else {
          const errMsg = stderr.trim() || `Meow JSON prompt exited with code ${code}`;
          reject(new Error(errMsg));
        }
      });

      proc.on("error", (err) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(new Error(`Meow JSON prompt spawn error: ${err.message}`));
      });
    });
  }

  /**
   * Streaming prompt - calls lean-agent's runLeanAgentSimpleStream via meow-stream.ts.
   * Tokens are delivered to onToken callback as they arrive, enabling real-time display.
   * EPOCH 17: Also supports onStateChange callback for rich state indicators.
   */
  async promptStreaming(
    text: string,
    onToken: (token: string) => void,
    onStateChange?: (state: AgentState, message?: string) => void
  ): Promise<string> {
    const words = text.split(" ");
    return new Promise((resolve, reject) => {
      // Use meow-stream.ts which calls runLeanAgentSimpleStream with onToken
      const meowStreamPath = "/app/meow-stream.ts";
      const args = [
        "run",
        "--bun",
        meowStreamPath,
        "--",
        ...words,
      ];

      const proc = spawn("bun", args, {
        cwd: process.env.CLAUDE_CWD || "/app",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        // Stream tokens to callback for real-time display
        onToken(text);
        stdout += text;
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;

        // EPOCH 17: Parse state change events from stderr
        // Format: "[state:THINKING] Thinking..." or "[state:EXECUTING] Executing commands..."
        if (onStateChange && text.includes("[state:")) {
          const match = text.match(/\[state:(\w+)\](?:\s+(.+))?/);
          if (match) {
            const stateStr = match[1];
            const stateMessage = match[2]?.trim();
            // Map string to AgentState enum
            const stateMap: Record<string, AgentState> = {
              THINKING: AgentState.THINKING,
              INDEXING: AgentState.INDEXING,
              READING: AgentState.READING,
              WRITING: AgentState.WRITING,
              EXECUTING: AgentState.EXECUTING,
              WAITING_PERMISSION: AgentState.WAITING_PERMISSION,
              WAITING: AgentState.WAITING_PERMISSION,
              SUMMARIZING: AgentState.SUMMARIZING,
              COMPLETE: AgentState.COMPLETE,
              ERROR: AgentState.ERROR,
            };
            const state = stateMap[stateStr];
            if (state) {
              onStateChange(state, stateMessage);
            }
          }
        }
      });

      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        reject(new Error(`Meow streaming timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      proc.on("close", (code) => {
        if (timedOut) return;
        clearTimeout(timer);
        if (code === 0) {
          // Strip debug prefix to get actual content
          const marker = "--- Output ---";
          const idx = stdout.indexOf(marker);
          const content = idx !== -1 ? stdout.slice(idx + marker.length).trim() : stdout.trim();
          resolve(content);
        } else {
          const errMsg = stderr.trim() || `Meow streaming exited with code ${code}`;
          reject(new Error(errMsg));
        }
      });

      proc.on("error", (err) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(new Error(`Meow streaming spawn error: ${err.message}`));
      });
    });
  }

  isAlive(): boolean {
    return true;
  }

  stop(): void {
    // Nothing persistent to stop
  }
}