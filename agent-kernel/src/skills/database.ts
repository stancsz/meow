/**
 * database.ts
 *
 * Learned from: https://github.com/planetscale/cli
 * Why: Database inspection, migration, backup, and branching via CLI
 * Minimal Slice: pscale database create + pscale branch + pscale connect
 *
 * Wraps the PlanetScale CLI (pscale) for database operations.
 * Requires pscale to be installed and authenticated.
 * See: https://github.com/planetscale/cli#installation
 */
import { exec } from "node:child_process";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

function pscale(args: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = exec("pscale " + args, { cwd, timeout: timeoutMs, shell: true });
    let stdout = ""; let stderr = "";
    child.stdout && child.stdout.on("data", d => { stdout += d; });
    child.stderr && child.stderr.on("data", d => { stderr += d; });
    child.on("close", code => resolve({ stdout, stderr, code }));
    child.on("error", e => resolve({ stdout, stderr, code: null, error: e.message }));
  });
}

function errMsg(code: number | null, stderr: string): string {
  return "pscale exited with " + code + ": " + stderr;
}

async function checkPscale(): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    exec("pscale version", { timeout: 10000, shell: true }, (err, stdout) => {
      if (err) return resolve({ installed: false });
      const m = stdout.match(/pscale version ([\d.]+)/);
      resolve({ installed: true, version: m ? m[1] : undefined });
    });
  });
}

async function runCmd(sub: string, rest: string, cwd: string): Promise<SkillResult> {
  const pcheck = await checkPscale();
  if (!pcheck.installed) {
    return {
      content: "",
      error: "[database:NOT_INSTALLED] PlanetScale CLI (pscale) is not installed.\n" +
        "Install: brew install planetscale/tap/pscale\n" +
        "Docs: https://github.com/planetscale/cli#installation"
    };
  }
  switch (sub.toLowerCase()) {
    case "list":
    case "ls": {
      const r = await pscale("database list", cwd);
      return { content: "[pscale] v" + pcheck.version + "\n\n" + r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "create": {
      if (!rest) return { content: "", error: "Usage: /database create <name> [--region <region>]" };
      const r = await pscale("database create " + rest, cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "delete":
    case "rm": {
      if (!rest) return { content: "", error: "Usage: /database delete <name>" };
      const r = await pscale("database delete " + rest + " --force", cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "branch": {
      if (!rest) {
        const r = await pscale("branch list", cwd);
        return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
      }
      const bparts = rest.split(/\s+/);
      const bsub = bparts[0];
      if (bsub === "create" && bparts.length >= 2) {
        const r2 = await pscale("branch create " + bparts.slice(1).join(" "), cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined : errMsg(r2.code, r2.stderr) };
      }
      if (bsub === "delete" && bparts.length >= 3) {
        const r2 = await pscale("branch delete " + bparts.slice(1).join(" ") + " --force", cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined : errMsg(r2.code, r2.stderr) };
      }
      const r2 = await pscale("branch " + rest, cwd);
      return { content: r2.stdout, error: r2.code === 0 ? undefined : errMsg(r2.code, r2.stderr) };
    }
    case "connect": {
      if (!rest) return { content: "", error: "Usage: /database connect <name> [--branch <branch>]" };
      const r = await pscale("connect " + rest, cwd, 5000);
      return { content: "[pscale connect] Established connection to " + rest + "\n" + (r.stdout || "(connection active)"), error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "backup": {
      if (!rest) {
        const r = await pscale("backup list", cwd);
        return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
      }
      const bparts = rest.split(/\s+/);
      if (bparts[0] === "create" && bparts.length >= 2) {
        const r2 = await pscale("backup create " + bparts.slice(1).join(" "), cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined : errMsg(r2.code, r2.stderr) };
      }
      const r2 = await pscale("backup " + rest, cwd);
      return { content: r2.stdout, error: r2.code === 0 ? undefined : errMsg(r2.code, r2.stderr) };
    }
    case "shell":
    case "sql": {
      if (!rest) return { content: "", error: "Usage: /database sql <name> [--branch <branch>]" };
      const r = await pscale("sql " + rest, cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "diff": {
      if (!rest) return { content: "", error: "Usage: /database diff <name> [--branch <branch>]" };
      const r = await pscale("diff " + rest, cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "deploy-request":
    case "dr": {
      if (!rest) return { content: "", error: "Usage: /database dr <name> create [--from <branch>] [--to <branch>] [--title <title>]" };
      const r = await pscale("deploy-request " + rest, cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
    case "help": {
      return { content: [
        "database skill - PlanetScale CLI (pscale) wrapper",
        "",
        "Usage: /database <subcommand> [args]",
        "",
        "Subcommands:",
        "  list                          List all databases",
        "  create <name> [--region r]    Create a new database",
        "  delete <name>                 Delete a database",
        "  connect <name> [--branch b]   Show connection string",
        "  shell <name> [--branch b]     Open SQL shell",
        "  diff <name> [--branch b]      Show schema diff",
        "  backup [list|create]          Manage backups",
        "  branch [create|delete|list]   Manage branches",
        "  dr create [--from] [--to]     Create deploy request",
        "  help                          Show this help",
        "",
        "Requires: pscale CLI installed + authenticated",
        "Install:  brew install planetscale/tap/pscale",
        "Docs:     https://github.com/planetscale/cli",
      ].join("\n") };
    }
    default: {
      const r = await pscale(sub + " " + rest, cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined : errMsg(r.code, r.stderr) };
    }
  }
}

export const database: Skill = {
  name: "database",
  description: "PlanetScale database operations - create, branch, connect, backup, migrate",
  aliases: ["db", "pscale"],
  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    if (!ctx.dangerous) {
      return { content: "", error: "[database:BLOCKED] Database operations require --dangerous flag" };
    }
    const trimmed = args.trim();
    const parts = trimmed.split(/\s+/);
    const subcmd = parts[0] || "help";
    const restargs = parts.slice(1).join(" ");
    return runCmd(subcmd, restargs, ctx.cwd);
  }
};
