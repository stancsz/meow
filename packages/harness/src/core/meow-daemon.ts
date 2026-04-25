/**
 * meow-daemon.ts - The Proactive Heartbeat
 * 
 * A background process that monitors the repository and environment,
 * triggering proactive actions (Vellum-style) without user prompts.
 * 
 * Features:
 * - Repository Health Check (Lint/Test monitoring)
 * - Scheduled Tasks (Daily summaries, maintenance)
 * - Event-driven proactivity (Triggers on file changes)
 */

import { MemoryStore } from "./memory";
import { MeowAgentClient } from "./meow-agent";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const CLAUDE_CWD = process.env.CLAUDE_CWD || process.cwd();
const MEMORY_DATA_DIR = join(CLAUDE_CWD, "data");
const memory = new MemoryStore(MEMORY_DATA_DIR);

const DAEMON_ID = `daemon_${Math.random().toString(36).slice(2, 8)}`;
const agentClient = new MeowAgentClient();

async function runHealthCheck() {
  console.log("[daemon] Running repository health check...");
  
  // Example: Check for lint errors or broken tests
  // In a real scenario, this would use the agent to analyze the repo
  // For now, we simulate a finding
  
  const hasLintError = false; // logic to check linting
  
  if (hasLintError) {
    memory.broadcastEvent("DISCORD_PING", {
      message: "🐱 Proactive Alert: I noticed some lint errors in the recent changes. Want me to pounce on them?",
      channelId: process.env.PRIMARY_CHANNEL_ID // if configured
    });
  }
}

async function startDaemon() {
  console.log(`[daemon] Starting Meow Heartbeat (ID: ${DAEMON_ID})`);
  
  // Register in the memory bus
  memory.heartbeat(DAEMON_ID, "Meow-Daemon", "SRE-Kitten");
  
  // Main background loop
  while (true) {
    try {
      // 1. Heartbeat
      memory.heartbeat(DAEMON_ID, "Meow-Daemon", "SRE-Kitten");
      
      // 2. Perform periodic tasks
      const now = new Date();
      
      // Every hour checks
      if (now.getMinutes() === 0) {
        await runHealthCheck();
      }
      
      // 3. Listen for bus events (if needed)
      
      // Wait before next tick
      await new Promise(r => setTimeout(r, 60000)); // Tick every minute
    } catch (e: any) {
      console.error(`[daemon] Loop error: ${e.message}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

// Global error handling
process.on("uncaughtException", (e) => console.error("[daemon] Uncaught:", e));
process.on("unhandledRejection", (e) => console.error("[daemon] Rejection:", e));

startDaemon();
