import { NextRequest } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { handleHeartbeat, processHeartbeat } from "@/../../src/core/heartbeat";

export async function POST(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get("session_id");

        const db = getDbClient();

        if (sessionId) {
            // Process a specific session
            await processHeartbeat(sessionId, db);
        } else {
            // This simulates a cron trigger hitting the endpoint without session_id,
            // which then triggers handleHeartbeat to check for all pending triggers
            await handleHeartbeat(db);
        }

        return Response.json({ status: "success", message: "Heartbeat processed successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error in heartbeat route:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
