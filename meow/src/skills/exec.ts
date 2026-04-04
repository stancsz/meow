/**
 * skills/exec.ts
 *
 * Shell command execution skill with timeout support.
 * Runs arbitrary shell commands — requires --dangerous flag.
 */
import { spawn } from "node:child_process";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const DEFAULT_TIMEOUT_MS = 60_000; // 60 seconds

export const execSkill: Skill = {
  name: "exec",
  description: "Execute a shell command with optional timeout",
  aliases: ["run", "shell"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    if (!context.dangerous) {
      return {
        content: "",
        error: "[exec:BLOCKED] Shell execution requires --dangerous flag",
      };
    }

    // Parse: [--timeout <ms>] <command>
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let command = args.trim();

    const timeoutMatch = command.match(/^--timeout\s+(\d+)\s+(.+)$/s);
    if (timeoutMatch) {
      timeoutMs = parseInt(timeoutMatch[1], 10);
      command = timeoutMatch[2].trim();
    }

    if (!command) {
      return {
        content: "",
        error: "Usage: /exec [--timeout <ms>] <command>\n" +
               "Examples:\n" +
               "  /exec echo hello\n" +
               "  /exec --timeout 5000 sleep 10\n" +
               "  /exec --timeout 30000 npm run build",
      };
    }

    return new Promise<SkillResult>((resolve) => {
      const output: { stdout: string; stderr: string } = { stdout: "", stderr: "" };
      let timedOut = false;

      // Use spawn for better control on Windows
      const child = spawn(command, [], {
        shell: true,
        cwd: context.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout?.on("data", (data: Buffer) => {
        output.stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        output.stderr += data.toString();
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            content: "",
            error: `[exec:TIMEOUT] Command timed out after ${timeoutMs}ms: ${command}`,
          });
          return;
        }

        const stdout = output.stdout.trim();
        const stderr = output.stderr.trim();

        let content = "";
        if (stdout) content += `STDOUT:\n${stdout}\n`;
        if (stderr) content += `STDERR:\n${stderr}\n`;
        content += `Exit code: ${code ?? 0}`;

        resolve({ content: content.trim() });
      });

      child.on("error", (err: Error) => {
        clearTimeout(timer);
        resolve({ content: "", error: `[exec:ERROR] ${err.message}` });
      });
    });
  },
};
