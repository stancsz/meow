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

function pscale(args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = exec(, { cwd, timeout: timeoutMs || DEFAULT_TIMEOUT_MS, shell: true });
    let stdout = ""; let stderr = "";
    child.stdout && child.stdout.on("data", d => { stdout += d; });
    child.stderr && child.stderr.on("data", d => { stderr += d; });
    child.on("close", code => resolve({ stdout, stderr, code }));
    child.on("error", e => resolve({ stdout, stderr, code: null, error: e.message }));
  });
}

async function checkPscale() {
  return new Promise((resolve) => {
    exec("pscale version", { timeout: 10000, shell: true }, (err, stdout) => {
      if (err) return resolve({ installed: false });
      const m = stdout.match(/pscale version ([d.]+)/);
      resolve({ installed: true, version: m ? m[1] : undefined });
    });
  });
}

function parseArgs(args) {
  const parts = args.trim().split(/s+/);
  return { subcommand: parts[0] || "help", rest: parts.slice(1).join(" ") };
}

async function runDatabaseCmd(args, ctx) {
  const { subcommand, rest } = parseArgs(args);
  const pcheck = await checkPscale();
  if (!pcheck.installed) {
    return { content: "", error: "[database:NOT_INSTALLED] PlanetScale CLI (pscale) is not installed.
Install it: brew install planetscale/tap/pscale
Docs: https://github.com/planetscale/cli#installation" };
  }
  switch (subcommand.toLowerCase()) {
    case "list": case "ls": {
      const r = await pscale("database list", ctx.cwd);
      return { content:  + r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "create": {
      if (!rest) return { content: "", error: "Usage: /database create <name> [--region <region>]" };
      const r = await pscale(, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "delete": case "rm": {
      if (!rest) return { content: "", error: "Usage: /database delete <name>" };
      const r = await pscale(, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "branch": {
      if (!rest) {
        const r = await pscale("branch list", ctx.cwd);
        return { content: r.stdout, error: r.code === 0 ? undefined :  };
      }
      const parts = rest.split(/s+/);
      const sub = parts[0];
      if (sub === "create" && parts.length >= 2) {
        const r2 = await pscale(, ctx.cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined :  };
      }
      if (sub === "delete" && parts.length >= 3) {
        const r2 = await pscale(, ctx.cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined :  };
      }
      const r2 = await pscale(, ctx.cwd);
      return { content: r2.stdout, error: r2.code === 0 ? undefined :  };
    }
    case "connect": {
      if (!rest) return { content: "", error: "Usage: /database connect <name> [--branch <branch>]" };
      const r = await pscale(, ctx.cwd, 5000);
      return { content: , error: r.code === 0 ? undefined :  };
    }
    case "backup": {
      if (!rest) {
        const r = await pscale("backup list", ctx.cwd);
        return { content: r.stdout, error: r.code === 0 ? undefined :  };
      }
      const parts = rest.split(/s+/);
      if (parts[0] === "create" && parts.length >= 2) {
        const r2 = await pscale(, ctx.cwd);
        return { content: r2.stdout, error: r2.code === 0 ? undefined :  };
      }
      const r2 = await pscale(, ctx.cwd);
      return { content: r2.stdout, error: r2.code === 0 ? undefined :  };
    }
    case "shell": case "sql": {
      if (!rest) return { content: "", error: "Usage: /database sql <name> [--branch <branch>]" };
      const r = await pscale(, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "diff": {
      if (!rest) return { content: "", error: "Usage: /database diff <name> [--branch <branch>]" };
      const r = await pscale(, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "deploy-request": case "dr": {
      if (!rest) return { content: "", error: "Usage: /database dr <name> create [--from <branch>] [--to <branch>] [--title <title>]" };
      const r = await pscale(, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
    case "help": {
      return { content:  };
    }
    default: {
      const r = await pscale(args, ctx.cwd);
      return { content: r.stdout, error: r.code === 0 ? undefined :  };
    }
  }
}

export const database = {
  name: "database",
  description: "PlanetScale database operations — create, branch, connect, backup, migrate",
  aliases: ["db", "pscale"],
  async execute(args, ctx) {
    if (!ctx.dangerous) return { content: "", error: "[database:BLOCKED] Database operations require --dangerous flag" };
    return runDatabaseCmd(args, ctx);
  }
};
