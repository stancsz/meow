import { NextRequest } from "next/server";
import { orchestratorHandler } from "@/../../src/core/orchestrator";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";
import { checkGasBalance } from "@/../../src/core/gas";
import { scheduleHeartbeat } from "@/../../src/core/heartbeat";
import type { Request, Response } from "@google-cloud/functions-framework";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("sessionId");

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const db = getDbClient();
        const results = db.getTaskResults(sessionId);
        const session = db.getSession(sessionId);

        return Response.json({ status: "success", results, sessionStatus: session?.status || "unknown" }, { status: 200 });
    } catch (error) {
        console.error("Error in orchestrator GET route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Explicit handling for 'execute' mode directly in the Next.js API route
        // to support both 'plan' and 'execute' modes and dispatch workers
        if (body?.action === 'execute') {
            const { session_id, user_id, continuous_mode } = body;

            if (!session_id) {
                return Response.json({ error: "Missing or invalid session_id field for execution." }, { status: 400 });
            }

            const db = getDbClient();
            const session = db.getSession(session_id);
            if (!session) {
                return Response.json({ error: `Session not found for id: ${session_id}` }, { status: 404 });
            }

            const manifest = session.manifest;
            if (!manifest) {
                return Response.json({ error: "No manifest associated with this session." }, { status: 400 });
            }

            if (!checkGasBalance(user_id, db)) {
                db.writeAuditLog(session_id, 'swarm_execution_failed', { error: 'Insufficient gas credits' });
                db.updateSessionStatus(session_id, 'error');
                return Response.json({ error: "Insufficient gas credits." }, { status: 402 });
            }

            db.updateSessionStatus(session_id, 'executing');

            if (manifest.schedule || continuous_mode) {
                await scheduleHeartbeat(session_id, 30, db);
            }

            // Fire and forget execution to allow polling (dispatcher handles updates and state persistence)
            executeSwarmManifest(manifest, session_id, db).catch((err) => {
                console.error('Error executing swarm:', err);
                db.updateSessionStatus(session_id, 'error');
                db.writeAuditLog(session_id, 'swarm_execution_failed', { error: err.message || String(err) });
            });

            return Response.json({
                status: 'dispatched',
                executionId: session_id,
                message: 'Session approved and execution mode started.',
                workers: manifest.steps?.map((s: any) => s.worker) || []
            }, { status: 200 });
        }

        // Create mock Request and Response objects to interface with the GCF handler
        const mockReq = {
            method: "POST",
            body: body
        } as Request;

        let statusCode = 200;
        let responseBody: any = null;

        const mockRes = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return mockRes;
            },
            json: (data: any) => {
                responseBody = data;
            },
            send: (data: string) => {
                responseBody = data;
            }
        } as Response;

        // Call the orchestrator handler
        await orchestratorHandler(mockReq, mockRes);

        return Response.json(responseBody, { status: statusCode });
    } catch (error) {
        console.error("Error in orchestrator API route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
