import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/../../src/db/client";

export async function GET(req: NextRequest) {
    try {
        const db = getDbClient();

        // 1. Check DB Connectivity
        let dbStatus = "ok";
        try {
            // A simple query to verify connection
            db.checkIdempotency("health-check-test-key");
        } catch (dbError) {
            dbStatus = "error";
            console.error("Health check DB error:", dbError);
        }

        // 2. Check KMS Availability (simulated)
        let kmsStatus = "ok";
        try {
            // A simple read to verify simulation
            db.simulateReadSecret("health-check-test-secret");
        } catch (kmsError) {
            kmsStatus = "error";
            console.error("Health check KMS error:", kmsError);
        }

        // Overall status
        const isHealthy = dbStatus === "ok" && kmsStatus === "ok";
        const httpStatus = isHealthy ? 200 : 503;

        return NextResponse.json({
            status: isHealthy ? "healthy" : "unhealthy",
            version: "1.0.0",
            services: {
                database: dbStatus,
                kms: kmsStatus,
                orchestrator: "ok" // the API is running if this route is hit
            },
            timestamp: new Date().toISOString()
        }, { status: httpStatus });

    } catch (error: any) {
        console.error("Fatal error in health check route:", error);
        return NextResponse.json({
            status: "unhealthy",
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}
