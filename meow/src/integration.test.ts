import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "./db/client";
import { executeSwarmManifest } from "./core/dispatcher";
import type { SwarmManifest, Task } from "./core/types";
import { onboardUserKey } from "./security/onboarding";
import { platformDbMock } from "./workers/template";
import { getKMSProvider } from "./security/kms";
import * as fs from "fs";

// Mock Supabase to prevent real network calls
mock.module("@supabase/supabase-js", () => {
  return {
    createClient: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "mock_session" }, error: null })
          })
        }),
        insert: async () => ({ error: null })
      })
    })
  };
});

describe("End-to-End Integration: Worker Dispatch and Execution Loop", () => {
  let db: DBClient;

  beforeEach(async () => {
    // 1. Initialize an in-memory database and apply migrations.
    db = new DBClient("sqlite://:memory:");
    const schemaPath = fs.existsSync("src/db/migrations/001_motherboard.sql")
      ? "src/db/migrations/001_motherboard.sql"
      : "../src/db/migrations/001_motherboard.sql";
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.applyMigration(schema);

    // Set KMS provider to local for deterministic testing
    process.env.KMS_PROVIDER = "local";
  });

  afterEach(() => {
    platformDbMock.clear();
  });

  it("should parse intent, dispatch worker, fetch demo-skill, decrypt credential, and log results", async () => {
    const userId = "test_user_demo";
    const sessionId = "session_test_demo";
    const testSecret = "demo_test_token_123";

    // 2. Insert a user test credential and platform mock
    const kmsProvider = getKMSProvider();

    // Create platform user mapping
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");
    platformDbMock.set(userId, { supabaseUrl: "https://mock.supabase.co", encryptedKey: encryptedServiceRole });
    db.applyMigration(`
      INSERT OR IGNORE INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('${userId}', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    // Add demo skill test credential
    const encryptedSecret = await kmsProvider.encrypt(testSecret);
    const originalSimulateReadSecret = db.simulateReadSecret.bind(db);
    db.simulateReadSecret = (credId: string) => {
      if (credId === "demo_api_key") return encryptedSecret;
      return originalSimulateReadSecret(credId);
    };

    // 3. Mock the global.fetch to intercept HTTP calls
    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      if (url === "https://httpbin.org/json" || url.toString().includes("httpbin.org")) {
        // Verify Auth header is present
        const headers: any = init?.headers || {};
        if (headers["Authorization"] === `Bearer ${testSecret}`) {
           return new Response(JSON.stringify({
             slideshow: {
               title: "Sample Slide Show",
               author: "Yours Truly"
             }
           }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
      }
      return originalFetch(url, init);
    };

    try {
      // 4. Create predictable SwarmManifest utilizing demo-skill
      // Instead of relying on LLM to parse, we inject the expected output manifest
      const task: Task = {
        id: "demo-task-1",
        description: "Fetch JSON from httpbin using demo skill",
        worker: "demo-worker",
        skills: ["demo-skill"],
        credentials: ["demo_api_key"],
        depends_on: [],
        action_type: "READ",
      };

      const manifest: SwarmManifest = {
        version: "1.0",
        intent_parsed: "Fetch a sample JSON from httpbin.",
        skills_required: ["demo-skill"],
        credentials_required: ["demo_api_key"],
        steps: [task]
      };

      db.createSession(userId, { prompt: "Fetch a sample JSON from httpbin." }, manifest);

      // We explicitly set session id for testing predictability
      db.applyMigration(`UPDATE orchestrator_sessions SET id = '${sessionId}' WHERE user_id = '${userId}';`);

      // 5. Start the execution by invoking executeSwarmManifest
      const result = await executeSwarmManifest(manifest, sessionId, db);

      // Wait a tick for async db logs
      await new Promise(resolve => setTimeout(resolve, 50));

      // 6. Assert results
      expect(result["demo-task-1"]).toBeDefined();
      expect(result["demo-task-1"].status).toBe("success");

      const dbClientAny = db as any;
      const resultsLogs = dbClientAny.db.query(`SELECT * FROM task_results WHERE session_id = '${sessionId}'`).all();

      expect(resultsLogs.length).toBe(1);
      const parsedOutput = JSON.parse(resultsLogs[0].output);

      // Check that the output matches our mocked fetch payload
      expect(parsedOutput.api_response).toBeDefined();
      expect(parsedOutput.api_response.slideshow.title).toBe("Sample Slide Show");
      expect(parsedOutput.api_response.slideshow.author).toBe("Yours Truly");

      // Verify that the KMS decryption flow logged correctly
      const auditLogs = dbClientAny.db.query(`SELECT * FROM audit_log WHERE session_id = '${sessionId}' AND event = 'worker_decrypted_credential'`).all();
      expect(auditLogs.length).toBeGreaterThan(0);
      const credAuditLog = JSON.parse(auditLogs[0].metadata);
      expect(credAuditLog.cred_id).toBe("demo_api_key");
      expect(credAuditLog.decrypted_value).toBe("[masked]");

      // Check db state
      const session = db.getSession(sessionId);
      expect(session.status).toBe("completed");

    } finally {
      db.simulateReadSecret = originalSimulateReadSecret;
      global.fetch = originalFetch;
    }
  });
});
