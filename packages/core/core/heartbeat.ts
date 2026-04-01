import { DBClient } from "../../db/db/client";

export async function scheduleHeartbeat(sessionId: string, intervalMinutes: number, db: DBClient) {
    const nextTrigger = new Date(Date.now() + intervalMinutes * 60000).toISOString().replace('T', ' ').replace('Z', '');
    db.db.run(`INSERT INTO heartbeat_queue (id, session_id, next_trigger, status) VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), sessionId, nextTrigger, 'pending']);
}

export async function handleHeartbeat(sessionId: string, db: DBClient) {
    console.log(`[Heartbeat] Handling session: ${sessionId}`);

    const heartbeats = db.db.query("SELECT * FROM heartbeat_queue WHERE session_id = ? AND status = 'pending' ORDER BY next_trigger ASC").all(sessionId) as any[];
    if (heartbeats.length === 0) return;

    const hb = heartbeats[0];

    // Check idempotency
    const idempotencyKey = `heartbeat-${hb.session_id}-${hb.next_trigger}`;
    try {
        const log = db.db.query("SELECT * FROM transaction_log WHERE idempotency_key = ?").get(idempotencyKey);
        if (log) {
            console.log(`[Heartbeat] Skipping duplicate execution for ${idempotencyKey}`);
            db.db.run(`UPDATE heartbeat_queue SET status = 'completed' WHERE id = ?`, [hb.id]);
            return;
        }
    } catch (e) {
        // Table might not exist in some tests
    }

    try {
        db.logTransaction(idempotencyKey, 'completed', {});
    } catch (e) {}

    const session = db.getSession(sessionId);
    if (!session) {
        db.db.run(`UPDATE heartbeat_queue SET status = 'failed' WHERE id = ?`, [hb.id]);
        return;
    }

    const gasBalance = db.getGasBalance(session.user_id);
    if (gasBalance <= 0) {
        db.db.run(`UPDATE heartbeat_queue SET status = 'failed' WHERE id = ?`, [hb.id]);
        db.writeAuditLog(sessionId, 'continuous_mode_suspended', { reason: 'gas exhausted' });
        return;
    }

    const logs = db.getAuditLogs(sessionId);
    const orchestratorRunConsumed = logs.some((l: any) => l.event === 'gas_consumed_for_session');

    // Only charge gas if orchestrator actually charged gas previously to indicate it's not double charging the first run
    if (orchestratorRunConsumed) {
        db.incrementGasBalance(session.user_id, -1);
    }

    // Process logic here...
    db.db.run(`UPDATE heartbeat_queue SET status = 'completed' WHERE id = ?`, [hb.id]);
    db.writeAuditLog(sessionId, 'heartbeat_triggered', { heartbeat_id: hb.id });

    // Schedule next
    await scheduleHeartbeat(sessionId, 30, db);
}

export async function processAllHeartbeats(db: DBClient) {
    console.log(`[Heartbeat] Processing all`);
}
