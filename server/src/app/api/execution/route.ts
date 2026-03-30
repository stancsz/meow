import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/../../src/db/client";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("session_id");
        const workerId = searchParams.get("worker_id");
        const statusParam = searchParams.get("status");

        // Pagination
        const limitStr = searchParams.get("limit");
        const offsetStr = searchParams.get("offset");

        const limit = limitStr ? parseInt(limitStr, 10) : 50;
        const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

        const db = getDbClient();

        const results = db.getExecutionLogs({
            sessionId: sessionId || undefined,
            workerId: workerId || undefined,
            status: statusParam || undefined,
            limit,
            offset
        });

        // Optional real-time subscription info for clients
        const realtimeConfig = {
            enabled: !!process.env.SUPABASE_URL,
            channel: sessionId ? `execution_${sessionId}` : 'execution_all',
            event: 'UPDATE'
        };

        return NextResponse.json({
            status: "success",
            data: results,
            pagination: {
                limit,
                offset,
                count: results.length
            },
            realtime: realtimeConfig
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error in execution monitor GET route:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}