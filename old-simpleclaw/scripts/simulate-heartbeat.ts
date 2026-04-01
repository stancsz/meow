import { DBClient } from "../src/db/client";
import { HeartbeatScheduler } from "../src/core/heartbeat";
import { join } from "path";

const INTERVAL_MS = 30000;

console.log("Starting SimpleClaw Local Heartbeat Simulator...");

// Initialize DB Client with local SQLite path (same as tests)
const dbPath = join(process.cwd(), "local.db");
const db = new DBClient(`sqlite://${dbPath}`);
const scheduler = new HeartbeatScheduler(db);

console.log(`Connected to database at ${dbPath}`);

async function pollHeartbeat() {
    try {
        console.log(`[${new Date().toISOString()}] Running scheduler tick...`);
        await scheduler.tick();
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] Simulator error:`, error.message);
    }
}

// Start scheduler running every 30 seconds
setInterval(pollHeartbeat, INTERVAL_MS);

console.log(`Heartbeat simulator running. Calling scheduler.tick() every ${INTERVAL_MS / 1000} seconds...`);
console.log("Press Ctrl+C to stop.");
