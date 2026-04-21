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
 */
import { spawn } from "node:child_process";

const MEOW_TIMEOUT_MS = parseInt(process.env.MEOW_TIMEOUT_MS || "300000");

export class MeowAgentClient {
  private readonly meowRunPath = "/app/meow-run.ts";
  private readonly timeoutMs: number;

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

  isAlive(): boolean {
    return true;
  }

  stop(): void {
    // Nothing persistent to stop
  }
}