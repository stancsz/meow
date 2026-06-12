#!/usr/bin/env node
/**
 * meow driver — wraps bin/meow.ts for programmatic use.
 * Usage: node driver.mjs <command> [opts]
 * 
 * Commands: status, -p <task>, live [--lives N], review, birth, mock
 * Options:
 *   --target <path>   operate on a different repo's .meow/ (default: ~/github/meow)
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(homedir(), "github", "meow");

// .cmd files on Windows need shell: true to work with spawnSync
const BUN = process.platform === "win32" ? "bun.cmd" : "bun";
const MEOW_BIN = join(REPO_ROOT, "bin", "meow.ts");

function run(args) {
  if (!existsSync(MEOW_BIN)) {
    console.error(`[driver] meow binary not found: ${MEOW_BIN}`);
    return 1;
  }
  const r = spawnSync(BUN, [MEOW_BIN, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 3_600_000,
    shell: process.platform === "win32",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

const args = process.argv.slice(2);

// Handle --target globally (applies to all commands)
const targetIdx = args.indexOf("--target");
let target = null;
const cleanArgs = args.filter((a, i) => {
  if (a === "--target") { target = args[i + 1]; return false; }
  if (target && args[i - 1] === "--target") return false;
  return true;
});

const [cmd, ...rest] = cleanArgs;

const COMMANDS = {
  status: () => target ? run(["--target", target, "status"]) : run(["status"]),
  "-p": (task) => target ? run(["--target", target, "-p", task]) : run(["-p", task]),
  live: () => {
    const livesIdx = rest.indexOf("--lives");
    const liveArgs = ["live"];
    if (livesIdx !== -1 && rest[livesIdx + 1]) {
      liveArgs.push("--lives", rest[livesIdx + 1]);
    }
    if (target) liveArgs.unshift("--target", target);
    return run(liveArgs);
  },
  review: () => target ? run(["--target", target, "review"]) : run(["review"]),
  birth: () => target ? run(["--target", target, "birth"]) : run(["birth"]),
  mock: () => target ? run(["--target", target, "mock"]) : run(["mock"]),
};

if (!cmd) {
  process.exit(run(["status"]));
}

const handler = COMMANDS[cmd];
if (!handler) {
  console.error(`[driver] unknown command: ${cmd}`);
  console.error(`[driver] available: ${Object.keys(COMMANDS).join(", ")}`);
  process.exit(1);
}

process.exit(handler(...rest));
