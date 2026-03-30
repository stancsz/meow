import { describe, it, expect, mock } from "bun:test";
import { z } from "zod";

// Mocks must be defined before imports for them to take effect in Bun

mock.module("next/server", () => ({
    NextResponse: {
        json: (data, options) => ({
            ...options,
            json: async () => data
        })
    }
}));

import { DBClient } from "../db/client";
mock.module("../db/client", () => ({
    getDbClient: () => ({
        getExecutionLogs: () => [
            {
                id: "log1",
                session_id: "test-session",
                worker_id: "worker1",
                status: "success",
                worker_metadata: { duration: 100 }
            }
        ],
        checkIdempotency: () => true,
        simulateReadSecret: () => "secret"
    })
}));

import { GET as getExecution } from "../../server/src/app/api/execution/route";
import { GET as getHealth } from "../../server/src/app/api/health/route";

// OpenAPI-like Schemas via Zod
const ExecutionMonitorSchema = z.object({
    status: z.string(),
    data: z.array(
        z.object({
            id: z.string().optional(),
            session_id: z.string().optional(),
            worker_id: z.string().optional(),
            status: z.string().optional(),
            worker_metadata: z.any().optional()
        }).passthrough()
    ),
    realtime: z.object({ enabled: z.boolean(), channel: z.string(), event: z.string() }).optional(),
    pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        count: z.number()
    })
});

const HealthCheckSchema = z.object({
    status: z.enum(["healthy", "unhealthy"]),
    version: z.string(),
    services: z.object({
        database: z.string(),
        kms: z.string(),
        orchestrator: z.string()
    }),
    timestamp: z.string()
});

describe("API Contract Tests", () => {
    it("should match Execution Monitor API contract", async () => {
        const req = {
            url: "http://localhost/api/execution?session_id=test-session&limit=10"
        } as any;

        const response = await getExecution(req);
        expect(response.status).toBe(200);

        const data = await response.json();

        // Zod throws an error if it fails validation
        ExecutionMonitorSchema.parse(data);
    });

    it("should match Health Check API contract", async () => {
        const req = {
            url: "http://localhost/api/health"
        } as any;

        const response = await getHealth(req);
        expect(response.status).toBe(200);

        const data = await response.json();
        HealthCheckSchema.parse(data);
    });
});
