#!/usr/bin/env bun
/**
 * meow — the heartbeat (nine-lives.md Layer 0).
 *
 * Owns the session boundary. One job: the resurrection loop.
 *   BIRTH   assemble waking context → spawn `claude -p`
 *   DEATH   enforce the exit contract (governor gates)
 *   REBIRTH budget/schedule check → next life
 *
 * Never makes judgments. All judgment lives in skills/meow (the mind).
 * All enforcement lives in scripts/ (the governor, Python).
 * This file only: parse args, assemble prompt, spawn, gate, decide rebirth.
 * Target budget: ≤ ~500 LOC. Compile: `bun build bin/meow.ts --compile --outfile meow`.
 */

import { spawnSync } from "child_process"; // exec-style, FEEDBACK.md lessons apply
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const MEOW = join(ROOT, ".meow");
const PY = process.platform === "win32" ? "python" : "python3";
const CLAUDE = process.platform === "win32" ? "claude.cmd" : "claude";

// ---------- helpers ----------------------------------------------------------

function read(p: string): string {
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
}

function governor(script: string, env: Record<string, string> = {}): { code: number; out: string } {
  const r = spawnSync(PY, [join(ROOT, "scripts", script)], {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
    timeout: 600_000,
  });
  return { code: r.status ?? 1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function ledgerTail(n = 10): string {
  const lines = read(join(MEOW, "ledger.md")).split("\n");
  return lines.filter((l) => l.trim().startsWith("- ")).slice(-n).join("\n");
}

// ---------- BIRTH: assemble the waking context -------------------------------

function birthPrompt(rolePhase: string, task?: string): string {
  const [role, phase] = rolePhase.split(":");
  const sections = [
    `# You are meow — life of ${new Date().toISOString()}`,
    `## Role this life: ${role} — phase: ${phase}`,
    `Load skills/meow/SKILL.md, then skills/meow/roles/${role}.md. Do ONE phase, then exit.`,
    `## Motive (PROBLEM.md)\n${read(join(MEOW, "PROBLEM.md"))}`,
    `## Campaign\n${read(join(MEOW, "campaign.md"))}`,
    `## Playbook (promoted law — follow it)\n${read(join(MEOW, "playbook.md"))}`,
    `## Ledger tail (what previous lives did)\n${ledgerTail()}`,
    `## Exit contract (your death is gated — non-negotiable)`,
    `Before you finish: gates green where applicable, ledger.md appended (one '- ' entry,`,
    `today's date, phase, outcome), brain distilled (brain_cli.py add), WIP serialized to`,
    `.meow/tasks/. The heartbeat runs scripts/ship_gate.py after you; do not fight it.`,
  ];
  if (task) sections.splice(3, 0, `## One-shot task from the human\n${task}`);
  return sections.join("\n\n");
}

// ---------- one life ----------------------------------------------------------

function oneLife(task?: string, dryRun = false): number {
  // Budget first — survive-first lives in the governor, not in prose.
  // Verifiers pass MEOW_SKIP_BUDGET to test birth mechanics without spending budget.
  if (!process.env.MEOW_SKIP_BUDGET) {
    const budget = governor("budget.py");
    if (budget.code !== 0) {
      console.error(`[heartbeat] HALT — ${budget.out.trim()}`);
      return 3;
    }
  }
  // Who am I this life? The schedule is data.
  const sched = governor("schedule.py");
  if (sched.code === 3) {
    console.error(`[heartbeat] ${sched.out.trim()}`);
    return 3;
  }
  const rolePhase = sched.out.trim() || "strategist:frame-select-premortem";

  const prompt = birthPrompt(rolePhase, task);
  const dir = mkdtempSync(join(tmpdir(), "meow-life-"));
  const promptFile = join(dir, "birth.md");
  writeFileSync(promptFile, prompt, "utf-8");

  console.log(`[heartbeat] birth: ${rolePhase} (prompt: ${promptFile})`);
  if (dryRun) {
    console.log(prompt);
    return 0;
  }

  // Spawn the life. FEEDBACK.md lessons: @file prompt, no shell-string games,
  // stdin ignored, output captured synchronously.
  const r = spawnSync(CLAUDE, ["-p", `@${promptFile}`, "--dangerously-skip-permissions"], {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 3600_000,
  });
  const lifeCode = r.status ?? 1;
  console.log(`[heartbeat] death: claude exited ${lifeCode}`);

  // DEATH: the exit contract is enforced here, outside the model.
  const gate = governor("ship_gate.py");
  console.log(gate.out.trim());
  if (gate.code !== 0) {
    console.error("[heartbeat] exit contract FAILED — life does not count as shipped");
    return 1;
  }
  return lifeCode;
}

// ---------- commands ----------------------------------------------------------

function cmdLive(lives: number): number {
  for (let i = 1; i <= lives; i++) {
    console.log(`\n[heartbeat] ===== life ${i}/${lives} =====`);
    const code = oneLife();
    if (code === 3) return 3; // budget/halt — stay dead until human or tomorrow
  }
  return 0;
}

function cmdStatus(): number {
  console.log("## PROBLEM\n" + (read(join(MEOW, "PROBLEM.md")) || "(none — run meow init)"));
  console.log("\n## Ledger tail\n" + (ledgerTail() || "(empty)"));
  console.log("\n## Budget\n" + governor("budget.py").out.trim());
  console.log("\n## Next up\n" + governor("schedule.py").out.trim());
  return 0;
}

function cmdReview(): number {
  const pending = new Bun.Glob("pending-*.md").scanSync({ cwd: join(MEOW, "reviews") });
  let n = 0;
  for (const f of pending) {
    n++;
    console.log(`\n--- ${f} ---\n${read(join(MEOW, "reviews", f))}`);
  }
  if (n === 0) console.log("no pending reviews — the leash is slack");
  return 0;
}

// ---------- main ----------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
let exit = 0;
switch (cmd) {
  case "-p":
    exit = oneLife(rest.join(" "), false);
    break;
  case "live":
  case "loop": {
    const li = rest.indexOf("--lives");
    exit = cmdLive(li >= 0 ? parseInt(rest[li + 1], 10) : 9);
    break;
  }
  case "status":
    exit = cmdStatus();
    break;
  case "review":
    exit = cmdReview();
    break;
  case "birth": // debug: print the assembled birth prompt without spawning
    exit = oneLife(rest.join(" ") || undefined, true);
    break;
  case "mock": {
    // Mocked life: write birth prompt to temp dir, simulate a phase by appending
    // to the real ledger, clean up. No real LLM, no ship_gate (v0002 verifies that).
    const dir = mkdtempSync(join(tmpdir(), "meow-life-mock-"));
    const promptFile = join(dir, "birth.md");
    const mockPrompt = birthPrompt("builder:execute");
    writeFileSync(promptFile, mockPrompt, "utf-8");
    console.log(`[mock] birth prompt: ${promptFile}`);

    // Simulate the phase: append to the real ledger (same path as a real life).
    // Timestamp suffix ensures uniqueness so v0002 sees a "new" line.
    const today = new Date().toISOString().split("T")[0];
    const ledgerLine = `- ${today} [builder:execute] one-shot echo test — zero failure modes, no WIP, exit contract honored [mock:${Date.now()}]`;
    const ledgerPath = join(MEOW, "ledger.md");
    const existing = read(ledgerPath);
    writeFileSync(ledgerPath, existing + (existing.endsWith("\n") ? "" : "\n") + ledgerLine + "\n", "utf-8");
    console.log(`[mock] ledger entry: ${ledgerLine}`);

    // Clean up temp dir.
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
    console.log(`[mock] done — temp dir removed`);
    exit = 0;
    break;
  }
  default:
    console.log(
      `meow — the heartbeat (Nine Lives)\n\n` +
        `  meow -p "<task>"      one life: birth → phase → exit contract → death\n` +
        `  meow live [--lives N] the loop: rebirth until budget/review halt (default 9)\n` +
        `  meow status           problem, ledger tail, budget, next role:phase\n` +
        `  meow review           pending human gates (the leash)\n` +
        `  meow birth            debug: print the birth prompt, spawn nothing\n` +
        `  meow mock             test: mocked end-to-end life (no real LLM)\n`,
    );
}
process.exit(exit);
