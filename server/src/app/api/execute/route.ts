import { NextRequest } from "next/server";
import { executeSwarmManifest } from "../../../../../src/core/dispatcher";
import { getDbClient } from "../../../../../src/db/client";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // UI passes sessionId as per the updated instruction
        const { sessionId } = body;

        if (!sessionId) {
            return Response.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const db = getDbClient();
        let session = db.getSession(sessionId);
        let manifest = body.manifest;

        if (!session) {
            console.warn("Session not found in DB (likely running in Next.js stub DBClient), falling back to provided manifest.");
        } else {
            manifest = session.manifest || manifest;
        }

        if (!manifest) {
            return Response.json({ error: "Manifest not provided and could not be found in session" }, { status: 400 });
        }

        db.updateSessionStatus(sessionId, "approved");

        // Execute the plan
        const results = await executeSwarmManifest(manifest, sessionId, db);

        // Convert the record to an array of results for the frontend
        const taskResults = Object.values(results);

        return Response.json({ status: "success", results: taskResults }, { status: 200 });
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
