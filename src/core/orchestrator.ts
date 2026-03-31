import * as ff from '@google-cloud/functions-framework';
import * as yaml from 'yaml';
import { SwarmManifest, Task, PlanDiffApprove } from './types';
import { parseIntentToManifest } from './llm';
import { DBClient } from '../db/client';
import { executeSwarmManifest } from './dispatcher';
import { scheduleHeartbeat } from './heartbeat';
import { checkGasBalance, debitGas } from './gas';
import { GasTank } from './gas-tank';

export async function processHeartbeat(sessionId: string, providedDb?: DBClient): Promise<void> {
    const db = providedDb || new DBClient(process.env.DATABASE_URL || 'sqlite://local.db');

    const pending = db.getPendingHeartbeats();
    const heartbeat = pending.find((h: any) => h.session_id === sessionId);

    if (!heartbeat) {
        return;
    }

    const idempotencyKey = `heartbeat-${heartbeat.session_id}-${heartbeat.next_trigger}`;
    if (db.checkIdempotency(idempotencyKey)) {
        db.updateHeartbeatStatus(heartbeat.id, 'completed');
        return;
    }

    db.updateHeartbeatStatus(heartbeat.id, 'processing');
    db.createTransactionLogEntry(idempotencyKey, 'started', {});

    try {
        const session = db.getSession(heartbeat.session_id);
        if (!session || !session.manifest) {
            db.updateHeartbeatStatus(heartbeat.id, 'error');
            db.logTransaction(idempotencyKey, 'failed', { error: 'Session or manifest not found' });
            return;
        }

        const userId = session.user_id;
        const gasBalance = db.getGasBalance(userId);

        if (gasBalance <= 0) {
            db.writeAuditLog(heartbeat.session_id, 'continuous_mode_suspended', { reason: 'insufficient_gas' });
            db.updateHeartbeatStatus(heartbeat.id, 'failed');
            db.logTransaction(idempotencyKey, 'failed', { error: 'Insufficient gas' });
            return;
        }

        db.writeAuditLog(heartbeat.session_id, 'heartbeat_triggered', { next_trigger: heartbeat.next_trigger });

        const results = await executeSwarmManifest(session.manifest, heartbeat.session_id, db);

        const hasErrors = Object.values(results).some(res => res.status === "error");

        if (!hasErrors) {
            const runId = `gas_consumed_for_heartbeat_${heartbeat.id}`;
            const logs = db.getAuditLogs(heartbeat.session_id);
            const alreadyConsumedForThisRun = logs.some((l: any) => l.event === runId);
            const orchestratorRunConsumed = logs.some((l: any) => l.event === 'gas_consumed_for_session');

            if (orchestratorRunConsumed && !alreadyConsumedForThisRun) {
                const gasTank = new GasTank(db);
                await gasTank.debitExecution(userId, 1);
                db.writeAuditLog(heartbeat.session_id, runId, { amount: 1 });
            }
        }

        db.logTransaction(idempotencyKey, 'completed', results);

        if (hasErrors) {
            db.updateHeartbeatStatus(heartbeat.id, 'failed');
        } else {
            db.updateHeartbeatStatus(heartbeat.id, 'completed');
        }

        const nextTriggerDate = new Date(Date.now() + 30 * 60 * 1000);
        const nextTriggerStr = nextTriggerDate.toISOString().replace('T', ' ').replace('Z', '');

        // Use createHeartbeat to append a new pending heartbeat iteration and preserve history.
        db.createHeartbeat(session.id, nextTriggerStr);

    } catch (error: any) {
        console.error(`Error processing heartbeat for session ${heartbeat.session_id}:`, error);
        db.updateSessionStatus(heartbeat.session_id, 'error');
        db.writeAuditLog(heartbeat.session_id, 'heartbeat_execution_failed', { error: error.message || String(error) });
        db.logTransaction(idempotencyKey, 'failed', { error: error.message || String(error) });
        db.updateHeartbeatStatus(heartbeat.id, 'failed');
    }
}

export function validateManifest(manifest: SwarmManifest, availableSkills: string[]): boolean {
    const stepIds = new Set(manifest.steps.map(s => s.id));

    // Check skills
    for (const skill of manifest.skills_required) {
        if (!availableSkills.includes(skill)) {
            console.error(`Skill ${skill} is not in available skills`);
            return false;
        }
    }

    // Check DAG cycles and dependencies
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (nodeId: string): boolean => {
        if (recStack.has(nodeId)) return true; // Cycle detected
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recStack.add(nodeId);

        const node = manifest.steps.find(s => s.id === nodeId);
        if (node) {
            for (const dep of node.depends_on) {
                if (!stepIds.has(dep)) {
                    console.error(`Dependency ${dep} does not exist in steps`);
                    return true; // We use true here to abort the check loop early and fail validation
                }
                if (checkCycle(dep)) return true;
            }
        }

        recStack.delete(nodeId);
        return false;
    };

    for (const step of manifest.steps) {
        if (checkCycle(step.id)) {
            console.error(`Cycle detected or missing dependency involving step ${step.id}`);
            return false;
        }
    }

    return true;
}

// Export the handler for testing
export const orchestratorHandler = async (req: ff.Request, res: ff.Response) => {
    // Basic CORS handling
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    const body = req.body;
    const prompt = body?.prompt;
    const user_id = body?.user_id;
    const session_id = body?.session_id;
    const action = body?.action;

    if (!user_id || typeof user_id !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "user_id" field in request body.' });
        return;
    }

    const dbClient = new DBClient(process.env.DATABASE_URL || 'sqlite://local.db');

    const continuous_mode = body?.continuous_mode;

    if (action === 'approve' || action === 'execute') {
        if (!session_id || typeof session_id !== 'string') {
            res.status(400).json({ error: 'Missing or invalid "session_id" field for execution.' });
            return;
        }

        const session = dbClient.getSession(session_id);
        if (!session) {
            res.status(404).json({ error: `Session not found for id: ${session_id}` });
            return;
        }

        const manifest = session.manifest;
        if (!manifest) {
            res.status(400).json({ error: 'No manifest associated with this session.' });
            return;
        }

        // Check for sufficient gas before execution
        if (!checkGasBalance(user_id, dbClient)) {
            dbClient.writeAuditLog(session_id, 'swarm_execution_failed', { error: 'Insufficient gas credits' });
            dbClient.updateSessionStatus(session_id, 'error');
            res.status(402).json({ error: 'Insufficient gas credits. Please purchase more credits to execute this swarm.' });
            return;
        }

        const currentGasBalance = dbClient.getGasBalance(user_id);
        if (currentGasBalance < 100) {
            dbClient.writeAuditLog(session_id, 'low_gas_balance_warning', { balance: currentGasBalance });
        }

        dbClient.updateSessionStatus(session_id, 'approved');

        // Setup heartbeat for continuous mode if schedule exists
        if (manifest.schedule || continuous_mode === true) {
            await scheduleHeartbeat(session_id, 30, dbClient);
        }

        // Execute asynchronously so UI can poll for results
        executeSwarmManifest(manifest, session_id, dbClient)
            .then(async (results) => {
                // Determine if execution was overall successful to merit a charge
                const hasErrors = Object.values(results).some(res => res.status === "error");
                if (!hasErrors) {
                    // Use audit logs to prevent double-debiting (idempotency)
                    const logs = dbClient.getAuditLogs(session_id);
                    const alreadyConsumed = logs.some(log => log.event === 'gas_consumed_for_session');

                    if (!alreadyConsumed) {
                        const gasTank = new GasTank(dbClient);
                        await gasTank.debitExecution(user_id, 1);
                        dbClient.writeAuditLog(session_id, 'gas_consumed_for_session', { amount: 1 });
                    }
                }
            })
            .catch((err) => {
                console.error('Error in asynchronous executeSwarmManifest:', err);
                dbClient.updateSessionStatus(session_id, 'error');
                dbClient.writeAuditLog(session_id, 'swarm_execution_failed', { error: err.message || String(err) });
            });

        res.status(200).json({
            status: 'dispatched',
            executionId: session_id,
            message: 'Session approved and execution started.',
            workers: manifest.steps?.map((s: any) => s.worker) || []
        });
        return;
    }

    // Default to 'plan' action if prompt is provided
    if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing or invalid "prompt" field in request body.' });
        return;
    }

    // Example available skills - in real life this comes from DB / standard library
    const availableSkills = [
        'github',
        'github-fetch-issues',
        'shopify-order-sync',
        'google-sheets-inventory',
        'slack-digest-poster',
        'gmail-drafter',
        'data-gatherer',
        'data-analyzer',
        'generic-web-search',
        'generic-writer',
        'mock-skill',
        'mock-fetch',
        'echo',
        'demo-skill',
        'shell',
        'test-skill',
        'test-shopify-fetch'
    ];

    try {
        // Parse the intent into a swarm manifest using LLM
        const manifest = await parseIntentToManifest(prompt, availableSkills);

        // Validate the manifest
        if (!validateManifest(manifest, availableSkills)) {
            res.status(400).json({ error: 'Generated manifest failed validation.' });
            return;
        }

        // Compute read/write operations for Plan-Diff-Approve
        const write_operations = manifest.steps.filter(s => s.action_type === 'WRITE').length;
        const read_operations = manifest.steps.filter(s => s.action_type === 'READ').length;

        const context = { prompt, availableSkills, continuous_mode: !!manifest.schedule };
        const newSessionId = dbClient.createSession(user_id, context, manifest, 'waiting_approval');

        const pda: PlanDiffApprove = {
            plan: manifest,
            write_operations,
            read_operations,
            status: 'waiting_approval',
            sessionId: newSessionId,
            estimated_credit_cost: 1
        };

        // Return both the structured JSON and the YAML format
        res.status(200).json({
            status: 'success',
            session_id: newSessionId,
            pda,
            yaml: yaml.stringify(manifest)
        });
    } catch (error: any) {
        console.error('Error generating manifest:', error);
        res.status(500).json({ error: error.message || 'Internal server error while generating manifest.' });
    }
};

// Orchestrator HTTP endpoint
ff.http('orchestrator', orchestratorHandler);
