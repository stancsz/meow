import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { dispatchApprovedManifest } from "@/../../src/core/dispatcher";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { session_id, decision } = body;

        if (!session_id || typeof session_id !== "string") {
            return Response.json({ error: "Missing or invalid session_id" }, { status: 400 });
        }

        if (decision !== "approve" && decision !== "reject") {
            return Response.json({ error: "Decision must be 'approve' or 'reject'" }, { status: 400 });
        }

        const db = getDbClient();
        const session = db.getSession(session_id);

        if (!session) {
            return Response.json({ error: "Session not found" }, { status: 404 });
        }

        if (session.status !== "waiting_approval") {
            return Response.json({ error: `Session is not in waiting_approval state. Current state: ${session.status}` }, { status: 400 });
        }

        if (decision === "approve") {
            db.updateSessionStatus(session_id, "approved");

            // Fire and forget execution to allow polling
            dispatchApprovedManifest(session_id, db).catch((err) => {
                console.error("Error executing approved manifest:", err);
                db.updateSessionStatus(session_id, "error");
                db.writeAuditLog(session_id, "swarm_execution_failed", { error: err.message || String(err) });
            });

            return Response.json({
                status: "approved",
                message: "Session approved and execution started.",
                executionId: session_id
            }, { status: 200 });
        } else {
            db.updateSessionStatus(session_id, "rejected");
            db.writeAuditLog(session_id, "plan_rejected", { decision });

            return Response.json({
                status: "rejected",
                message: "Session rejected.",
                executionId: session_id
            }, { status: 200 });
        }
    } catch (error) {
        console.error("Error in orchestrator approve route:", error);
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
