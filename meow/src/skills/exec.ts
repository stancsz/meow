/**
 * skills/exec.ts
 *
 * Shell command execution skill with timeout support.
 * Executes arbitrary shell commands - requires --dangerous flag.
 */
import { exec, type ExecOptions } from "node:child_process";
import { join } from "node:path";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

// Default timeout: 60 seconds
const DEFAULT_TIMEOUT_MS = 60_000;

export const execSkill: Skill = {
  name: "exec",
  description: "Execute a shell command with optional timeout (requires --dangerous)",
  aliases: ["run", "shell", "command"],

  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    if (!ctx.dangerous) {
      return {
        content: "",
        error: "[exec:BLOCKED] Shell execution requires --dangerous flag",
      };
    }

    const trimmed = args.trim();
    if (!trimmed) {
      return {
        content: "",
        error: "Usage: /exec <command> [--timeout <ms>] [--cwd <dir>]",
      };
    }

    // Parse flags
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let cwd: string | undefined = ctx.cwd;
    let command = trimmed;

    // Extract --timeout flag
    const timeoutMatch = trimmed.match(/--timeout\s+(\d+)/);
    if (timeoutMatch) {
      timeoutMs = parseInt(timeoutMatch[1], 10);
      command = trimmed.replace(/--timeout\s+\d+/, "").trim();
    }

    // Extract --cwd flag
    const cwdMatch = command.match(/--cwd\s+(\S+)/);
    if (cwdMatch) {
      cwd = join(ctx.cwd, cwdMatch[1]);
      command = command.replace(/--cwd\s+\S+/, "").trim();
    }

    if (!command) {
      return {
        content: "",
        error: "Usage: /exec <command> [--timeout <ms>] [--cwd <dir>]",
      };
    }

    const start = Date.now();

    return new Promise<SkillResult>((resolve) => {
      const options: ExecOptions = {
        timeout: timeoutMs,
        cwd: cwd ?? process.cwd(),
        shell: true,
        env: { ...process.env },
      };

      exec(command, options, (error, stdout, stderr) => {
        const elapsed = Date.now() - start;

        if (error) {
          // Check for timeout
          if (error.killed || (error as any).code === "ETIMEDOUT") {
            resolve({
              content: "",
              error: `[exec:TIMEOUT] Command timed out after ${timeoutMs}ms\n` +
                `stdout: ${stdout}\n` +
                `stderr: ${stderr}`,
            });
            return;
          }

          resolve({
            content: `stdout:\n${stdout || "(empty)"}`,
            error: `[exec:ERROR] Exit ${error.status ?? "unknown"} after ${elapsed}ms\nstderr: ${stderr}`,
          });
          return;
        }

        resolve({
          content: `[exec] Completed in ${elapsed}ms\n\nstdout:\n${stdout || "(empty)"}${stderr ? "\n\nstderr:\n" + stderr : ""}`,
        });
      });
    });
  },
};
