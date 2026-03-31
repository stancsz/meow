import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "../../../../../src/db/client";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { scheduleHeartbeat } from "../../../../../src/core/heartbeat";
import { checkGasBalance } from "../../../../../src/core/gas";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { session_id } = body;

        if (!session_id) {
            return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
        }

        const db = getDbClient();
        const session = db.getSession(session_id);

        if (!session) {
            return NextResponse.json({ error: `Session not found for id: ${session_id}` }, { status: 404 });
        }

        if (session.status !== 'waiting_approval' && session.status !== 'active') {
            return NextResponse.json({ error: `Session status is ${session.status}, must be waiting_approval or active to execute` }, { status: 400 });
        }

        const manifest = session.manifest;
        if (!manifest) {
            return NextResponse.json({ error: "No manifest associated with this session." }, { status: 400 });
        }

        // We check gas balance here (the dispatcher also checks it)
        const userId = session.user_id;
        if (userId && !checkGasBalance(userId, db)) {
            db.writeAuditLog(session_id, 'swarm_execution_failed', { error: 'Insufficient gas credits' });
            db.updateSessionStatus(session_id, 'error');
            return NextResponse.json({ error: "Insufficient gas credits." }, { status: 402 });
        }

        // Update session status to running (internally the dispatch process logs 'executing' but we map it per spec)
        db.updateSessionStatus(session_id, 'running');

        // Continuous mode scheduling check
        if (manifest.schedule || session.continuous_mode) {
            await scheduleHeartbeat(session_id, 30, db);
        }

        // Fire and forget the swarm execution to return response immediately and let UI poll
        executeSwarmManifest(manifest, session_id, db).catch((err) => {
            console.error('Error executing swarm from execute route:', err);
            db.updateSessionStatus(session_id, 'error');
            db.writeAuditLog(session_id, 'swarm_execution_failed', { error: err.message || String(err) });
        });

        return NextResponse.json({
            execution_id: session_id,
            status: 'running',
            message: 'Session execution started.'
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error in execute route:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
