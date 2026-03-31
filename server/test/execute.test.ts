import { expect, test, describe, beforeAll, afterAll, mock } from "bun:test";
import { DBClient } from "../../src/db/client";
import { POST as executeRoutePOST } from "../src/app/api/execute/route";
import { orchestratorHandler } from "../../src/core/orchestrator";
// Must mock NextRequest and NextResponse for bun:test to run successfully.
// The mock.module MUST be before the imports of modules that use it.
mock.module('next/server', () => ({
    NextRequest: class {
        url: string;
        body: any;
        constructor(url: string, init?: any) {
            this.url = url;
            this.body = init?.body ? JSON.parse(init.body) : {};
        }
        async json() { return this.body; }
    },
    NextResponse: {
        json: (body: any, init?: any) => ({
            status: init?.status || 200,
            json: async () => body,
            body
        })
    }
}));

import * as ff from '@google-cloud/functions-framework';
import type { PlanDiffApprove, SwarmManifest } from "../../src/core/types";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = "sqlite://server_test_execute.db";
let db: DBClient;

describe("API /api/execute Integration", () => {
    beforeAll(() => {
        const dbFile = TEST_DB_PATH.replace("sqlite://", "");
        if (fs.existsSync(dbFile)) {
            fs.unlinkSync(dbFile);
        }

        db = new DBClient(TEST_DB_PATH);
        const migrationSql = fs.readFileSync(path.join(process.cwd().includes('server') ? ".." : ".", "src", "db", "migrations", "001_motherboard.sql"), 'utf-8');
        db.applyMigration(migrationSql);

        // Ensure user has gas
        db.addGasCredits("test-user-id", 100);

        // Ensure platform user exists to avoid "Supabase credentials not found" error
        // We mock encrypt the key so the local KMS can decrypt it without throwing "Decryption failed: tampered or invalid ciphertext"
        const crypto = require("crypto");
        const keyMaterial = process.env.LOCAL_KMS_KEY || 'local-development-kms-key-32-byte-secret-padding-xxx';
        const key = crypto.createHash('sha256').update(keyMaterial).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update('mock_service_role', 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();
        const validEncryptedKey = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

        db.setPlatformUser("test-user-id", "https://mock.supabase.co", validEncryptedKey);

        const skillsDir = path.join(process.cwd(), "src/skills");
        if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

        fs.writeFileSync(path.join(skillsDir, "test-skill.md"), `---
skill_name: test-skill
version: "1.0.0"
---
Test body.
`);

        mock.module("../../src/core/llm", () => ({
            parseIntentToManifest: async (prompt: string, skills: string[]): Promise<SwarmManifest> => {
                return {
                    version: "1.0",
                    intent_parsed: prompt,
                    credentials_required: [],
                    skills_required: ["test-skill"],
                    steps: [
                        {
                            id: "step_1",
                            description: "Test execution",
                            worker: "test-worker",
                            action_type: "READ",
                            skills: ["test-skill"],
                            depends_on: [],
                            credentials: [],
                            parameters: { url: "https://mock.api/data" }
                        }
                    ]
                };
            }
        }));
    });

    afterAll(() => {
        const dbFile = TEST_DB_PATH.replace("sqlite://", "");
        if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

        const mockSkillPath = path.join(process.cwd(), "src/skills/test-skill.md");
        if (fs.existsSync(mockSkillPath)) fs.unlinkSync(mockSkillPath);

        mock.restore();
    });

    test("Full flow: Generate plan via orchestrator, execute via /api/execute", async () => {
        // Step 1: Generate plan
        process.env.DATABASE_URL = TEST_DB_PATH;
        let pdaResponse: any = null;
        let pdaStatus = 200;

        const req = {
            method: "POST",
            body: {
                prompt: "Use test api skill",
                user_id: "test-user-id"
            }
        } as ff.Request;

        const res = {
            set: () => {},
            status: (code: number) => { pdaStatus = code; return res; },
            json: (data: any) => { pdaResponse = data; },
            send: (data: string) => { pdaResponse = JSON.parse(data); }
        } as unknown as ff.Response;

        await orchestratorHandler(req, res);
        expect(pdaStatus).toBe(200);
        expect(pdaResponse?.status).toBe("success");

        const sessionId = pdaResponse.session_id;
        expect(sessionId).toBeDefined();

        // Ensure status is waiting_approval
        db.updateSessionStatus(sessionId, 'waiting_approval');

        // Step 2: Execute plan via API
        const originalFetch = global.fetch;
        global.fetch = mock(async () => {
            return new Response(JSON.stringify({ result: { status: "success", output: "API call successful" } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });

        // Set FORCE_MOCK_FETCH so `template.ts` doesn't make real requests to worker endpoints.
        process.env.FORCE_MOCK_FETCH = "true";

        const executeReq = new NextRequest("http://localhost/api/execute", {
            method: "POST",
            body: JSON.stringify({ session_id: sessionId })
        });

        const executeRes = await executeRoutePOST(executeReq);
        const executeBody = await executeRes.json();

        expect(executeRes.status).toBe(200);
        expect(executeBody.execution_id).toBe(sessionId);
        expect(executeBody.status).toBe("running");

        // Delay to allow async execution to finish
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Let's log if there's an error in task results
        const taskResults = db.getTaskResults(sessionId);
        if (taskResults.length > 0 && taskResults[0].status === "error") {
             console.error("Task error:", taskResults[0].error);
        }

        // Let's also check audit logs
        const auditLogs = db.getAuditLogs(sessionId);
        const errorLogs = auditLogs.filter((l: any) => l.event === "swarm_execution_failed");
        if (errorLogs.length > 0) {
             console.error("Audit log error:", errorLogs[0].metadata);
        }

        // Step 3: Verify Results
        const finalSession = db.getSession(sessionId);
        expect(finalSession.status).toBe("completed");

        expect(taskResults.length).toBe(1);
        expect(taskResults[0].status).toBe("success");

        global.fetch = originalFetch;
        delete process.env.FORCE_MOCK_FETCH;
    });
});
