import { DBClient } from "../db/index";
import { processAllHeartbeats } from "./heartbeat";

export function startLocalScheduler(db: DBClient, intervalMs: number = 30 * 60 * 1000) {
    console.log(`Starting local heartbeat scheduler running every ${intervalMs}ms`);

    setInterval(() => {
        processAllHeartbeats(db).catch(err => {
            console.error("Local scheduler loop error:", err);
        });
    }, intervalMs);
}

// Development cron simulator using pg_cron SQL ready for Supabase
// Included as requested for Phase 2 Heartbeat documentation/setup
export const PG_CRON_SQL = `
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'swarms-continuous-mode-heartbeat',
    '*/30 * * * *',
    'SELECT swarms.heartbeat()'
);
`;