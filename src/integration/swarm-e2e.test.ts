import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { executeSwarmManifest } from "../core/dispatcher";
import type { SwarmManifest } from "../core/types";
import * as fs from "fs";
import { getKMSProvider } from "../security/kms";
import * as llm from "../core/llm";
import { orchestratorHandler } from "../core/orchestrator";

// Mock the openAI call to avoid actual API requests during testing
mock.module("../core/llm", () => ({
  parseIntentToManifest: mock(async (prompt: string, availableSkills: string[]): Promise<SwarmManifest> => {
    return {
      version: "1.0",
      intent_parsed: prompt,
      skills_required: ["test-shopify-fetch"],
      credentials_required: ["shopify_mock_token"],
      steps: [
        {
          id: "step-fetch-orders",
          description: "Fetch Shopify orders from the last 24 hours",
          worker: "worker-shopify",
          skills: ["test-shopify-fetch"],
          credentials: ["shopify_mock_token"],
          depends_on: [],
          action_type: "READ",
        },
      ],
    };
  }),
}));

describe("End-to-End Swarm Orchestrator Workflow", () => {
  let db: DBClient;
  let originalDbUrl: string | undefined;

  beforeEach(() => {
    process.env.KMS_PROVIDER = "local";
    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "sqlite://:memory:";

    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);

    // Mock the DBClient constructor to use the same in-memory DB connection
    mock.module("../db/client", () => ({
      DBClient: mock(() => db),
      getDbClient: mock(() => db),
    }));
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    mock.restore();
  });

  it("should successfully plan, approve, and execute a natural language intent", async () => {
    // 1. Setup Data
    const kmsProvider = getKMSProvider();

    // Create an encrypted service role for the user
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");

    // Create an encrypted credential (mock shopify token)
    const encryptedShopifyToken = await kmsProvider.encrypt("shpat_mock_12345");

    db.applyMigration(`
      INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('user_shopify_1', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    db.applyMigration(`
      INSERT INTO vault_user_secrets (id, user_id, name, secret, provider)
      VALUES ('shopify_mock_token', 'user_shopify_1', 'Shopify Token', '${encryptedShopifyToken}', 'mock');
    `);

    db.applyMigration(`
      INSERT INTO gas_ledger (id, user_id, balance_credits)
      VALUES ('ledger_shopify_1', 'user_shopify_1', 10);
    `);

    // 2. Planning Phase: Orchestrator generates a manifest from intent
    let planResCode = 0;
    let planResBody: any = null;

    const planReq = {
      method: "POST",
      body: {
        prompt: "Fetch my Shopify orders from the last 24 hours",
        user_id: "user_shopify_1",
      },
    } as any;

    const planRes = {
      set: () => {},
      status: (code: number) => { planResCode = code; return planRes; },
      json: (data: any) => { planResBody = data; },
      send: (data: string) => { planResBody = data; },
    } as any;

    await orchestratorHandler(planReq, planRes);

    expect(planResCode).toBe(200);
    expect(planResBody.status).toBe("success");
    expect(planResBody.session_id).toBeDefined();

    const sessionId = planResBody.session_id;
    const manifest = planResBody.pda.plan;

    // Verify that the LLM parsed intent mapped to the expected skill
    expect(manifest.skills_required).toContain("test-shopify-fetch");

    // 3. Execution Phase: Simulate the user approving the plan and dispatcher executing it
    const results = await executeSwarmManifest(manifest, sessionId, db);

    // Verify step status
    expect(results["step-fetch-orders"]).toBeDefined();
    expect(results["step-fetch-orders"].status).toBe("success");

    // 4. Verification: Query Motherboard to ensure state is correctly logged
    const dbClientAny = db as any;

    // Check Task Results logged to DB
    const taskLogs = dbClientAny.db.query("SELECT * FROM task_results WHERE session_id = ?").all(sessionId);
    expect(taskLogs.length).toBe(1);
    expect(taskLogs[0].status).toBe("success");
    expect(taskLogs[0].skill_ref).toBe("test-shopify-fetch");

    // Check Audit Logs generated
    const auditLogs = dbClientAny.db.query("SELECT * FROM audit_log WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    const auditEvents = auditLogs.map((log: any) => log.event);

    expect(auditEvents).toContain("swarm_execution_started");
    expect(auditEvents).toContain("worker_skill_loaded");
    expect(auditEvents).toContain("worker_decrypted_credential");
    expect(auditEvents).toContain("worker_completed");
    expect(auditEvents).toContain("swarm_execution_completed");

    // Check that KMS effectively decrypted the requested token for the worker
    const decryptLog = auditLogs.find((log: any) => log.event === "worker_decrypted_credential");
    expect(decryptLog).toBeDefined();

    const decryptMeta = JSON.parse(decryptLog.metadata);
    expect(decryptMeta.cred_id).toBe("shopify_mock_token");
    expect(decryptMeta.decrypted_value).toBe("[masked]"); // Log scrubbing validation

    // Verify JIT skill loading logged
    const skillLoadLog = auditLogs.find((log: any) => log.event === "worker_skill_loaded");
    expect(skillLoadLog).toBeDefined();

    const skillLoadMeta = JSON.parse(skillLoadLog.metadata);
    expect(skillLoadMeta.skill_name).toBe("test-shopify-fetch");

    // Validate gas consumption (assuming successful execution consumes 1 gas)
    const currentGas = db.getGasBalance("user_shopify_1");
    expect(currentGas).toBe(9); // Initial 10 - 1 used
  });
});
