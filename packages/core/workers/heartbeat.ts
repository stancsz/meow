import * as ff from '@google-cloud/functions-framework';
import { getDbClient } from '../../db/db/client';
import { handleHeartbeat, processAllHeartbeats } from '../core/heartbeat';

export const heartbeatCloudFunctionHandler = async (req: ff.Request, res: ff.Response) => {
    // Basic CORS handling
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    try {
        let sessionId: string | undefined;

        // Extract session_id from query parameters
        if (req.query && typeof req.query.session_id === 'string') {
            sessionId = req.query.session_id;
        }

        // Extract session_id from JSON body if not found in query
        if (!sessionId && req.body) {
            if (req.body.sessionId && typeof req.body.sessionId === 'string') {
                sessionId = req.body.sessionId;
            } else if (req.body.session_id && typeof req.body.session_id === 'string') {
                sessionId = req.body.session_id;
            }
        }

        const db = getDbClient();

        if (sessionId) {
            console.log(`[Heartbeat] Processing specific session: ${sessionId}`);
            await handleHeartbeat(sessionId, db);
        } else {
            console.log(`[Heartbeat] Processing all pending heartbeats`);
            await processAllHeartbeats(db);
        }

        res.status(200).json({ status: 'success', message: 'Heartbeat processed successfully' });
    } catch (error: any) {
        console.error('[Heartbeat] Execution failed:', error);
        res.status(500).json({
            status: 'error',
            error: error.message || 'Internal server error during heartbeat processing'
        });
    }
};

ff.http('heartbeatCloudFunctionHandler', heartbeatCloudFunctionHandler);
