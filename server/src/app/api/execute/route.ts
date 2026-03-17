import { NextRequest } from "next/server";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { getDbClient } from "../../../../../src/db/client";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { session_id, manifest, user_id } = body;

        if (!session_id || !manifest) {
            return Response.json({ error: "Missing session_id or manifest" }, { status: 400 });
        }

        const db = getDbClient();
        db.updateSessionStatus(session_id, "approved");

        // Execute the plan
        const results = await executeSwarmManifest(manifest, session_id, db);

        return Response.json({ status: "success", results }, { status: 200 });
    } catch (error) {
        console.error("Error in execute API route:", error);
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
