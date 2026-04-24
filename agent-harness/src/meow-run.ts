#!/usr/bin/env bun
/**
 * meow-run.ts - Meow Agent Runner
 *
 * Thin launcher that runs lean-agent.ts inside Docker.
 * lean-agent.ts handles the full OODA loop including tool execution.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEAN_AGENT = join(__dirname, "..", "..", "agent-kernel", "src", "core", "lean-agent.ts");

/**
 * Strip lean-agent's debug output prefix to get only the actual content.
 * lean-agent outputs: "🐱 Meow lean agent\nPrompt: ...\n\n✅ Completed...\n[xxx tokens]\n\n--- Output ---\n<content>"
 * We want to extract only the content after "--- Output ---".
 */
function stripDebugPrefix(output: string): string {
  const marker = "--- Output ---";
  const idx = output.indexOf(marker);
  if (idx !== -1) {
    return output.slice(idx + marker.length).trim();
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  // Pass --dangerous to lean-agent so it can execute shell commands
  const spawnArgs = ["run", "--bun", LEAN_AGENT, "--dangerous", "--", prompt];

  console.error(`[meow-run] Starting lean-agent with prompt: ${prompt.slice(0, 80)}...`);
  console.error(`[meow-run] cwd: ${process.cwd()}`);
  console.error(`[meow-run] LLM_API_KEY: ${process.env.LLM_API_KEY ? "(set)" : "(missing)"}`);
  console.error(`[meow-run] LLM_BASE_URL: ${process.env.LLM_BASE_URL}`);

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "300000");

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", spawnArgs, {
      cwd: process.env.CLAUDE_CWD || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: false,
      detached: false,
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      console.error(`[meow-run] Timeout after ${timeoutMs}ms — killing process`);
      proc.kill("SIGTERM");
      reject(new Error(`Meow timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;
      console.error(`[meow-run] lean-agent exited ${code} in ${elapsed}ms`);

      if (code === 0 && stdout.trim()) {
        // Strip lean-agent's debug output prefix to get only the actual content
        const output = stripDebugPrefix(stdout.trim());
        console.log(output);
        resolve();
      } else {
        const errMsg = stderr.trim().slice(0, 500) || `lean-agent exited with code ${code}`;
        console.error(`[meow-run] Error: ${errMsg}`);
        reject(new Error(errMsg));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[meow-run] Spawn error: ${err.message}`);
      reject(err);
    });
  });
}

main().catch((e) => {
  console.error("Meow error:", e.message);
  process.exit(1);
});