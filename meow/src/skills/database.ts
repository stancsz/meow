/**
 * skills/database.ts
 *
 * PlanetScale CLI database skill.
 * Learn database operations - connect, query, migrate, and branch databases.
 *
 * repo: https://github.com/planetscale/cli
 * minimalSlice: "pscale database create + pscale branch + pscale connect"
 */
import { exec } from "node:child_process";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

interface PscaleResult { stdout: string; stderr: string; code: number | null; error?: string; }

function pscale(args: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PscaleResult> {
  return new Promise((resolve) => {
    const child = exec(`pscale ${args}`, { timeout: timeoutMs, shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: string) => { stdout += d; });
    child.stderr?.on("data", (d: string) => { stderr += d; });
    child.on("close", (code: number | null) => resolve({ stdout, stderr, code }));
    child.on("error", (e: Error) => resolve({ stdout, stderr, code: null, error: e.message }));
  });
}

function checkPscale(): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    exec("pscale version", { timeout: 10000, shell: true }, (err, stdout) => {
      if (err) return resolve({ installed: false });
      const m = stdout.match(/pscale version ([\d.]+)/);
      resolve({ installed: true, version: m ? m[1] : undefined });
    });
  });
}

function formatOutput(result: PscaleResult, cmd: string): { content: string; error?: string } {
  if (result.code === 0) {
    return { content: result.stdout || `\`pscale ${cmd}\` succeeded` };
  }
  const errMsg = `[database:ERROR] \`pscale ${cmd}\` exited with code ${result.code ?? "unknown"}\n` +
    (result.stderr ? `\nstderr: ${result.stderr}` : "") +
    (result.stdout ? `\nstdout: ${result.stdout}` : "");
  return { content: "", error: errMsg };
}

export const database: Skill = {
  name: "database",
  description: "PlanetScale database operations: list, create, branch, connect, migrate",
  aliases: ["db", "pscale"],

  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    if (!ctx.dangerous) {
      return {
        content: "",
        error: "[database:BLOCKED] Database operations require --dangerous flag",
      };
    }

    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0]?.toLowerCase() || "";
    const rest = parts.slice(1).join(" ");

    // Check if pscale is installed for commands that need it
    const needsPscale = subcommand !== "help" && subcommand !== "";
    if (needsPscale) {
      const pcheck = await checkPscale();
      if (!pcheck.installed) {
        return {
          content: "",
          error: "[database:NOT_INSTALLED] PlanetScale CLI (pscale) is not installed.\n\nInstall: brew install planetscale/tap/pscale\nDocs: https://github.com/planetscale/cli",
        };
      }
    }

    switch (subcommand) {
      case "list": {
        const result = await pscale("database list");
        return {
          content: `## Databases\n\n\`\`\`\n${result.stdout || result.stderr || "(empty)"}\n\`\`\`\n${result.code !== 0 ? `\nExit code: ${result.code}` : ""}`,
        };
      }

      case "create": {
        if (!rest) return { content: "", error: "Usage: /database create <name> [--region <region>]" };
        const result = await pscale(`database create ${rest}`);
        return formatOutput(result, `database create ${rest}`);
      }

      case "branch": {
        if (!rest) return { content: "", error: "Usage: /database branch <sub-cmd> <database> [args]" };
        const result = await pscale(`branch ${rest}`);
        return formatOutput(result, `branch ${rest}`);
      }

      case "connect": {
        if (!rest) return { content: "", error: "Usage: /database connect <database> [branch]" };
        // connect is long-running, use short timeout
        const result = await pscale(`connect ${rest}`, 5000);
        return {
          content: formatOutput(result, `connect ${rest}`).content ||
            `\`pscale connect ${rest}\` — connection initiated (long-running, use Ctrl+C to stop)`,
          error: result.code !== 0 ? formatOutput(result, `connect ${rest}`).error : undefined,
        };
      }

      case "backup": {
        if (!rest) return { content: "", error: "Usage: /database backup <database> [branch]" };
        const result = await pscale(`backup ${rest}`);
        return formatOutput(result, `backup ${rest}`);
      }

      case "shell": {
        if (!rest) return { content: "", error: "Usage: /database shell <database> [--branch <branch>]" };
        const result = await pscale(`shell ${rest}`);
        return formatOutput(result, `shell ${rest}`);
      }

      case "deploy-request": {
        if (!rest) return { content: "", error: "Usage: /database deploy-request <sub-cmd> <database> [branch]" };
        const result = await pscale(`deploy-request ${rest}`);
        return formatOutput(result, `deploy-request ${rest}`);
      }

      case "diff": {
        if (!rest) return { content: "", error: "Usage: /database diff <database> [branch]" };
        const result = await pscale(`diff ${rest}`);
        return formatOutput(result, `diff ${rest}`);
      }

      case "auth": {
        const result = await pscale("auth login");
        return formatOutput(result, "auth login");
      }

      case "status": {
        const pcheck = await checkPscale();
        return {
          content: `## PlanetScale CLI Status\n\n` +
            `Installed: ${pcheck.installed ? "✅ Yes" : "❌ No"}\n` +
            (pcheck.version ? `Version: ${pcheck.version}\n` : "") +
            (!pcheck.installed ? "\nInstall: brew install planetscale/tap/pscale" : ""),
        };
      }

      case "help":
      case "":
      default: {
        return {
          content: `## PlanetScale Database Skill

PlanetScale CLI (pscale) database operations.
Requires --dangerous flag.

### Sub-commands

  /database list              List all databases
  /database create <name> [--region <region>]
                             Create a new database
  /database branch <sub-cmd> <database> [args]
                             Manage branches (create, list, delete)
  /database connect <database> [branch]
                             Open a SQL shell connection
  /database shell <database> [--branch <branch>]
                             Run SQL in the database shell
  /database backup <database> [branch]
                             Manage backups
  /database deploy-request <sub-cmd> <database> [branch]
                             Manage deploy requests
  /database diff <database> [branch]
                             Show schema diff
  /database auth              Authenticate with PlanetScale
  /database status            Check CLI installation

### Minimal Slice

  pscale database create     — create a new database
  pscale branch create       — create a branch
  pscale connect             — connect and query

Docs: https://github.com/planetscale/cli`,
        };
      }
    }
  },
};
