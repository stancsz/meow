#!/usr/bin/env bun
/**
 * mission-agent.ts - Background Mission Tracker
 *
 * Runs parallel to relay.ts, periodically evaluating missions
 * and posting updates to Discord.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

// ============================================================================
// Config
// ============================================================================

function loadEnv() {
  // Docker-compose env_file creates .env file, but also sets env vars directly
  // First check process.env (set by docker-compose), then check .env file
  if (process.env.DISCORD_TOKEN) return; // Already set by docker-compose

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
  }
}
loadEnv();

const DATA_DIR = join(process.cwd(), "data");
const MISSIONS_FILE = join(DATA_DIR, "missions.json");
const CONFIG_FILE = join(DATA_DIR, "mission-agent.json");

interface Mission {
  id: string;
  title: string;
  description: string;
  goals: string[];
  status: "pending" | "in_progress" | "completed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  checkInterval: number; // seconds
  channelId: string;
  iteration: number;
  lastCheck: number;
  completionPercent: number;
  evalHistory: EvalRecord[];
}

interface EvalRecord {
  timestamp: number;
  percent: number;
  findings: string;
  nextSteps: string;
}

interface AgentConfig {
  enabled: boolean;
  defaultInterval: number; // seconds
  discordToken?: string;
}

// ============================================================================
// Mission Store
// ============================================================================

function loadMissions(): Mission[] {
  try {
    if (existsSync(MISSIONS_FILE)) {
      const data = JSON.parse(readFileSync(MISSIONS_FILE, "utf-8"));
      return data.missions || [];
    }
  } catch (e) {
    console.error("[mission-agent] Failed to load missions:", e);
  }
  return [];
}

function saveMissions(missions: Mission[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(MISSIONS_FILE, JSON.stringify({ missions }, null, 2));
  } catch (e) {
    console.error("[mission-agent] Failed to save missions:", e);
  }
}

function loadConfig(): AgentConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return { enabled: true, defaultInterval: 600 };
}

function saveConfig(config: AgentConfig) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("[mission-agent] Failed to save config:", e);
  }
}

// ============================================================================
// Discord Client
// ============================================================================

let discord: Client | null = null;

async function initDiscord() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.log("[mission-agent] No DISCORD_TOKEN configured, status updates disabled");
    return;
  }

  const { Client, GatewayIntentBits } = await import("discord.js");
  discord = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  discord.once("ready", () => {
    console.log(`[mission-agent] Discord connected as ${discord!.user?.tag}`);
  });

  await discord.login(token);
}

async function postUpdate(channelId: string, content: string) {
  if (!discord || !discord.user) {
    console.log("[mission-agent] Discord not connected, skipping update");
    return;
  }

  try {
    const channel = await discord.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await (channel as TextChannel).send(content);
    }
  } catch (e) {
    console.error(`[mission-agent] Failed to post to channel ${channelId}:`, e);
  }
}

// ============================================================================
// Claude Evaluation
// ============================================================================

async function evaluateMission(mission: Mission): Promise<EvalRecord> {
  const cliPath = process.env.CLAUDE_CLI_PATH ||
    "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js";

  const prompt = `You are evaluating progress on a mission.

Mission: "${mission.title}"
Description: ${mission.description}

Goals to achieve:
${mission.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}

Please:
1. Examine the current state of the codebase
2. Evaluate each goal for completion
3. Rate overall completion as a percentage (0-100)
4. If 100%, suggest ways to EXCEED the original goals
5. If <100%, identify what's missing and next steps

Respond in this format:
COMPLETION: [percentage]%
FINDINGS: [what's done, what's not]
NEXT_STEPS: [specific actions to complete or exceed]

Be honest and thorough. Look at actual files to verify completion.`;

  return new Promise((resolve) => {
    const proc = spawn("node", [cliPath, "--output-format", "text", "-p", prompt], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      const output = stdout.trim() || stderr.trim();

      // Parse response
      const completionMatch = output.match(/COMPLETION:\s*(\d+)%/);
      const findingsMatch = output.match(/FINDINGS:\s*([\s\S]*?)(?=NEXT_STEPS:|$)/i);
      const nextStepsMatch = output.match(/NEXT_STEPS:\s*([\s\S]*?)$/i);

      const percent = completionMatch ? parseInt(completionMatch[1]) : mission.completionPercent;
      const findings = findingsMatch ? findingsMatch[1].trim() : "Unable to evaluate";
      const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : "Continue working";

      resolve({
        timestamp: Date.now(),
        percent,
        findings,
        nextSteps,
      });
    });

    proc.on("error", () => {
      resolve({
        timestamp: Date.now(),
        percent: mission.completionPercent,
        findings: "Claude evaluation failed",
        nextSteps: "Retry later",
      });
    });

    // 5 minute timeout
    setTimeout(() => {
      proc.kill();
      resolve({
        timestamp: Date.now(),
        percent: mission.completionPercent,
        findings: "Evaluation timed out",
        nextSteps: "Retry later",
      });
    }, 300000);
  });
}

// ============================================================================
// Mission Processing
// ============================================================================

async function checkMission(mission: Mission): Promise<Mission> {
  const now = Date.now();

  // Skip if not time to check yet
  if (mission.lastCheck && (now - mission.lastCheck) < mission.checkInterval * 1000) {
    return mission;
  }

  // Skip cancelled/completed missions
  if (mission.status === "cancelled" || mission.status === "completed") {
    return mission;
  }

  console.log(`[mission-agent] Evaluating mission: ${mission.title}`);

  const eval_ = await evaluateMission(mission);

  mission.iteration++;
  mission.lastCheck = now;
  mission.completionPercent = eval_.percent;
  mission.updatedAt = now;
  mission.evalHistory.push(eval_);

  // Keep only last 10 eval records
  if (mission.evalHistory.length > 10) {
    mission.evalHistory = mission.evalHistory.slice(-10);
  }

  // Auto-complete if 100% and stable for 2 checks
  if (eval_.percent >= 100) {
    const recentEvals = mission.evalHistory.slice(-3);
    const allComplete = recentEvals.length >= 2 && recentEvals.every(e => e.percent >= 100);
    if (allComplete) {
      mission.status = "completed";
    }
  }

  // Build status message
  const statusMsg = buildStatusMessage(mission, eval_);
  await postUpdate(mission.channelId, statusMsg);

  return mission;
}

function buildStatusMessage(mission: Mission, eval_: EvalRecord): string {
  const emoji = eval_.percent >= 100 ? "✅" : eval_.percent >= 50 ? "🔄" : "⏳";
  const status = mission.status === "completed" ? "COMPLETE" : "IN PROGRESS";

  let msg = `${emoji} **Mission Update: ${mission.title}**\n`;
  msg += `Status: ${status} | Completion: ${eval_.percent}% | Iteration: ${mission.iteration}\n\n`;
  msg += `**Findings:**\n${eval_.findings}\n\n`;
  msg += `**Next Steps:**\n${eval_.nextSteps}\n`;

  if (eval_.percent >= 100 && mission.status !== "completed") {
    msg += `\n🎯 All goals met! Agent will continue pushing for excellence...`;
  }

  return msg;
}

// ============================================================================
// Main Loop
// ============================================================================

async function main() {
  console.log("[mission-agent] Starting Mission Agent...");

  await initDiscord();

  const config = loadConfig();
  if (!config.enabled) {
    console.log("[mission-agent] Agent disabled in config");
    return;
  }

  // Main loop - check every 30 seconds
  setInterval(async () => {
    const missions = loadMissions();
    const activeMissions = missions.filter(m =>
      m.status === "pending" || m.status === "in_progress"
    );

    if (activeMissions.length === 0) {
      return;
    }

    console.log(`[mission-agent] Checking ${activeMissions.length} active mission(s)`);

    for (const mission of activeMissions) {
      try {
        const updated = await checkMission(mission);
        // Update in array
        const idx = missions.findIndex(m => m.id === mission.id);
        if (idx >= 0) {
          missions[idx] = updated;
        }
      } catch (e) {
        console.error(`[mission-agent] Error checking mission ${mission.id}:`, e);
      }
    }

    saveMissions(missions);
  }, 30000); // Check every 30 seconds

  console.log("[mission-agent] Mission Agent running. Use 'create mission' to start tracking.");
}

// ============================================================================
// CLI Commands (for manual control)
// ============================================================================

const cmd = process.argv[2];

if (cmd === "list") {
  const missions = loadMissions();
  console.log("\n📋 Active Missions:");
  missions
    .filter(m => m.status !== "cancelled")
    .forEach(m => {
      console.log(`  [${m.id.slice(0, 8)}] ${m.title} - ${m.completionPercent}% (${m.status})`);
    });
  process.exit(0);
} else if (cmd === "create") {
  // Create a new mission (interactive - see relay.ts for Discord UI)
  const title = process.argv[3] || "Untitled Mission";
  const goals = process.argv.slice(4);

  const missions = loadMissions();
  const newMission: Mission = {
    id: Bun.randomUUIDv4(),
    title,
    description: "",
    goals: goals.length > 0 ? goals : ["Complete objective"],
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    checkInterval: 600,
    channelId: "",
    iteration: 0,
    lastCheck: 0,
    completionPercent: 0,
    evalHistory: [],
  };

  missions.push(newMission);
  saveMissions(missions);
  console.log(`Created mission: ${newMission.id}`);
  process.exit(0);
} else if (!cmd) {
  main();
}

export { loadMissions, saveMissions, type Mission };
