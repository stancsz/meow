/**
 * compare-and-fix.ts - Background Meow improvement agent
 *
 * After a fallback from Meow to Claude Code, this script runs in background to:
 * 1. Compare the two responses
 * 2. Identify why Meow failed
 * 3. Fix the relevant Meow kernel code
 *
 * Runs asynchronously - does NOT block the Discord relay.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LOGS_DIR = join(process.cwd(), "logs");
const AGENT_KERNEL = "/app/agent-kernel";

// Find the most recent fallback log (meow→claude-code)
function findLatestFallbackLog(): string | null {
  if (!existsSync(LOGS_DIR)) return null;
  const files = readdirSync(LOGS_DIR).filter(f => f.includes("meow-claude-code"));
  if (files.length === 0) return null;
  files.sort();
  return join(LOGS_DIR, files[files.length - 1]);
}

// Spawn Claude Code to analyze and fix Meow
function spawnClaudeFix(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cliPath = "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js";
    const args = [
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--mcp-config", "/app/mcp-null.json",
      "-p", prompt
    ];

    const proc = spawn("node", [cliPath, ...args], {
      cwd: AGENT_KERNEL,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Claude Code timed out after 5 minutes"));
    }, 300000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const errMsg = stderr.trim() || `Claude exited with code ${code}`;
        // If it already tried to make changes, still resolve with what we got
        if (stdout.includes("```") || stdout.includes("edit") || stdout.includes("diff")) {
          resolve(stdout.trim());
        } else {
          reject(new Error(errMsg));
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Spawn error: ${err.message}`));
    });
  });
}

async function main() {
  const logPath = findLatestFallbackLog();
  if (!logPath) {
    console.log("[compare-fix] No fallback log found to analyze");
    return;
  }

  console.log(`[compare-fix] Analyzing: ${logPath}`);

  const logContent = readFileSync(logPath, "utf-8");
  const log = JSON.parse(logContent);

  if (!log.meowError) {
    console.log("[compare-fix] Meow succeeded, no need to fix");
    return;
  }

  // Build comparison prompt for Claude Code
  const comparisonPrompt = `You are helping improve Meow (the native agent) by fixing failures.

A user sent this message to the Discord relay:
"${log.userPrompt}"

Meow tried to respond but FAILED with this error:
"${log.meowError}"

Claude Code (the fallback) successfully responded with ${log.finalResponseLength} characters.

Your task:
1. Analyze why Meow failed
2. Look at the relevant Meow kernel source files to understand the issue
3. FIX the code to prevent this failure

Relevant Meow kernel files to examine (they're in ${AGENT_KERNEL}):
- src/core/lean-agent.ts (main agent loop)
- src/sidecars/tool-registry.ts (tool execution)
- src/core/auto-agent.ts (autonomous loop)

Also check the meow-run.ts in /app/ for any issues.

After analyzing, make the necessary EDITS to fix the issue.
Use the write or edit tool to make changes.
If the issue is in meow-run.ts (/app/meow-run.ts), also fix that.

If you cannot determine the root cause, explain what you found and what else needs investigation.

IMPORTANT: Make real edits to fix the actual bug. Do not just describe what to do.`;

  console.log("[compare-fix] Spawning Claude Code to analyze and fix...");
  console.log(`[compare-fix] Prompt length: ${comparisonPrompt.length} chars`);

  try {
    const result = await spawnClaudeFix(comparisonPrompt);
    console.log("[compare-fix] Claude Code response:");
    console.log("---");
    console.log(result.slice(0, 2000));
    console.log("---");

    // Log the comparison result
    const comparisonLog = {
      timestamp: new Date().toISOString(),
      originalLog: logPath,
      userPrompt: log.userPrompt,
      meowError: log.meowError,
      claudeFixOutput: result.slice(0, 5000),
      fixed: result.includes("```") || result.includes("edit") || result.includes("diff"),
    };

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const comparisonPath = join(LOGS_DIR, `comparison_${ts}.json`);
    writeFileSync(comparisonPath, JSON.stringify(comparisonLog, null, 2));
    console.log(`[compare-fix] Comparison logged to: ${comparisonPath}`);

  } catch (e: any) {
    console.error(`[compare-fix] Failed: ${e.message}`);
    // Log the failure
    const failureLog = {
      timestamp: new Date().toISOString(),
      originalLog: logPath,
      userPrompt: log.userPrompt,
      meowError: log.meowError,
      claudeFixError: e.message,
    };
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const failurePath = join(LOGS_DIR, `comparison_failed_${ts}.json`);
    writeFileSync(failurePath, JSON.stringify(failureLog, null, 2));
    console.log(`[compare-fix] Failure logged to: ${failurePath}`);
  }

  console.log("[compare-fix] Done");
}

main().catch((e) => {
  console.error("[compare-fix] Fatal:", e.message);
  process.exit(1);
});