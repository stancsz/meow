import { DBClient } from "../db/client";
import { processAllHeartbeats } from "./heartbeat";

// Simple local polling loop for development purposes. In production this would be replaced by pg_cron.
export function startLocalScheduler(db: DBClient, intervalMs: number = 60000) {
    console.log(`Starting local heartbeat scheduler running every ${intervalMs}ms`);

    setInterval(() => {
        processAllHeartbeats(db).catch(err => {
            console.error("Local scheduler loop error:", err);
        });
    }, intervalMs);
}
