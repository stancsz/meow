import { NextRequest } from "next/server";
import { orchestratorHandler } from "@/../../src/core/orchestrator";
import { getDbClient } from "@/../../src/db/client";
import { executeSwarmManifest } from "@/../../src/core/dispatcher";
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

        // Handle direct approval execution action
        if (body.action === 'approve') {
            const { sessionId, manifest } = body;

            if (!sessionId || typeof sessionId !== 'string') {
                return Response.json({ error: 'Missing or invalid "sessionId" field for execution.' }, { status: 400 });
            }
            if (!manifest) {
                return Response.json({ error: 'Missing "manifest" field for execution.' }, { status: 400 });
            }

            const dbClient = getDbClient();
            dbClient.updateSessionStatus(sessionId, 'executing');

            // Dispatch worker execution asynchronously so the UI can immediately poll for results
            executeSwarmManifest(manifest, sessionId, dbClient).catch((err) => {
                console.error('Error in asynchronous executeSwarmManifest:', err);
                dbClient.updateSessionStatus(sessionId, 'error');
                dbClient.writeAuditLog(sessionId, 'swarm_execution_failed', { error: err.message || String(err) });
            });

            return Response.json({
                status: 'dispatched',
                executionId: sessionId,
                message: 'Session approved and execution started.',
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
