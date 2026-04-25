#!/usr/bin/env bun
/**
 * meow-run.ts - Meow Agent Runner
 *
 * Thin launcher that runs lean-agent.ts inside Docker.
 * lean-agent.ts handles the full OODA loop including tool execution.
 *
 * EPOCH 24: Supports --json mode for Harness integration (skill crystallization).
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple .env loader
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }

  // Map Anthropic keys to LLM keys for lean-agent
  if (process.env.ANTHROPIC_API_KEY && !process.env.LLM_API_KEY) {
    process.env.LLM_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.ANTHROPIC_BASE_URL && !process.env.LLM_BASE_URL) {
    process.env.LLM_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  }
}

const LEAN_AGENT = join(__dirname, "..", "..", "kernel", "src", "core", "lean-agent.ts");

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
  const rawArgs = process.argv.slice(2);
  const jsonMode = rawArgs.includes("--json");
  const args = rawArgs.filter((a) => !a.startsWith("--"));
  const prompt = args.join(" ") || "Hello world";

  // Build spawn args for lean-agent
  const spawnArgs = ["run", "--bun", LEAN_AGENT, "--dangerous"];
  if (jsonMode) {
    spawnArgs.push("--json");
  }
  spawnArgs.push("--", prompt);

  console.error(`[meow-run] Starting lean-agent with prompt: ${prompt.slice(0, 80)}...`);
  console.error(`[meow-run] jsonMode: ${jsonMode}`);
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
        if (jsonMode) {
          // EPOCH 24: In JSON mode, pass through the raw JSON from lean-agent
          // This includes full AgentResult with messages[] containing tool_calls
          console.log(stdout.trim());
        } else {
          // Strip lean-agent's debug output prefix to get only the actual content
          const output = stripDebugPrefix(stdout.trim());
          console.log(output);
        }
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