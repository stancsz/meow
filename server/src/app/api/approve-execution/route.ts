import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { session_id } = body;

        if (!session_id || typeof session_id !== 'string') {
            return Response.json({ error: 'Missing or invalid "session_id" field for execution.' }, { status: 400 });
        }

        const dbClient = getDbClient();
        const session = dbClient.getSession(session_id);

        if (!session) {
            return Response.json({ error: `Session not found for id: ${session_id}` }, { status: 404 });
        }

        const manifest = session.manifest;
        if (!manifest) {
            return Response.json({ error: 'No manifest associated with this session.' }, { status: 400 });
        }

        dbClient.updateSessionStatus(session_id, 'executing');

        // Dispatch worker execution asynchronously so the UI can immediately poll for results
        executeSwarmManifest(manifest, session_id, dbClient).catch((err) => {
            console.error('Error in asynchronous executeSwarmManifest:', err);
            dbClient.updateSessionStatus(session_id, 'error');
            dbClient.writeAuditLog(session_id, 'swarm_execution_failed', { error: err.message || String(err) });
        });

        return Response.json({
            status: 'dispatched',
            executionId: session_id,
            message: 'Session approved and execution started.',
            workers: manifest.steps?.map((s: any) => s.worker) || []
        }, { status: 200 });
    } catch (error) {
        console.error("Error in approve-execution API route:", error);
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
