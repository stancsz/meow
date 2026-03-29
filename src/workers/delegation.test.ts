import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { MockExecutionEngine } from "./mock-engine";
import { delegateExecution, DelegationError, TimeoutError, EngineUnavailableError } from "./delegation";
import { Task, ExecutionContext } from "../core/types";
import * as fs from "fs";

describe("Delegation Layer", () => {
  let db: DBClient;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);
  });

  const baseTask: Task = {
    id: "task-1",
    description: "Test task",
    worker: "worker-1",
    skills: ["skill-1"],
    credentials: ["secret-key-1"],
    depends_on: [],
    action_type: "READ",
  };

  const baseContext: ExecutionContext = {
    sessionId: "session-1",
    skillContent: "mock skill content",
    credentials: {
      "secret-key-1": "super-secret-value",
    },
  };

  const setupSession = async (db: DBClient, sessionId: string) => {
    import { getKMSProvider } from "../security/kms";
const kmsProvider = getKMSProvider();
    const encryptedServiceRole = await kmsProvider.encrypt("mock_service_role_key");
    const testUserId = `user-test-${sessionId}`;
    db.applyMigration(`
      INSERT OR IGNORE INTO platform_users (user_id, supabase_url, encrypted_service_role)
      VALUES ('${testUserId}', 'https://mock.supabase.co', '${encryptedServiceRole}');
    `);

    // Insert a valid session first so the foreign keys on audit logs succeed
    db.createSession(testUserId, { prompt: "Test delegation" }, { version: "1.0", steps: [], skills_required: [], credentials_required: [], intent_parsed: "delegation test" });

    // Manually update the session to match the expected sessionId
    const anyDb = db as any;
    anyDb.db.query(`UPDATE orchestrator_sessions SET id = ? WHERE user_id = '${testUserId}'`).run(sessionId);
    // Delete any existing audit logs for the session
    anyDb.db.run("DELETE FROM audit_log WHERE session_id = ?", [sessionId]);
  };

  it("should prepare execution context and mask credentials in logs", async () => {
    await setupSession(db, "session-1");
    const engine = new MockExecutionEngine({ executionDelayMs: 0 });

    const result = await delegateExecution(baseTask, baseContext, { engine, db });

    expect(result.status).toBe("success");
    expect(result.delegated_to).toBe("mock-engine");
    expect(result.output.credentialsPassed).toContain("secret-key-1");

    // Verify logs
    const auditLogs = db.getAuditLogs("session-1");

    // Started log
    const startLog = auditLogs.find(log => log.event === "delegation_started");
    expect(startLog).toBeDefined();

    // We parse the details and ensure credentials are not leaked
    const details = JSON.parse(startLog!.metadata);
    expect(details.credentials_provided).toContain("secret-key-1");
    // The details should only contain the keys, not the values
    expect(JSON.stringify(details)).not.toContain("super-secret-value");

    // Completed log
    const completedLog = auditLogs.find(log => log.event === "delegation_completed");
    expect(completedLog).toBeDefined();
  });

  it("should preserve idempotency for WRITE tasks across delegation boundaries", async () => {
    await setupSession(db, "session-idempotent");

    const writeTask: Task = { ...baseTask, id: "task-write", action_type: "WRITE" };
    const context = { ...baseContext, sessionId: "session-idempotent" };

    // First, simulate a completed transaction for this task
    db.logTransaction("task-write", "completed", { test: true });

    const engine = new MockExecutionEngine({ executionDelayMs: 0 });
    const result = await delegateExecution(writeTask, context, { engine, db });

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("idempotency check");
    expect(result.delegated_to).toBe("none");

    // Verify idempotency skip was logged
    const logs = db.getAuditLogs("session-idempotent");
    const skipLog = logs.find(l => l.event === "delegation_skipped_idempotent");
    expect(skipLog).toBeDefined();
  });

  it("should handle engine timeout failures correctly", async () => {
    await setupSession(db, "session-timeout");

    // Engine simulates a long delay
    const engine = new MockExecutionEngine({ simulateTimeout: true });
    const context = { ...baseContext, sessionId: "session-timeout" };

    // Set delegation timeout to be very short to force error quickly
    try {
      await delegateExecution(baseTask, context, { engine, db, timeoutMs: 10 });
      expect.unreachable("Should have thrown TimeoutError");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TimeoutError);
      expect(e.message).toContain("Execution timed out");

      // Verify log contains the failure
      const logs = db.getAuditLogs("session-timeout");
      const failLog = logs.find(l => l.event === "delegation_failed");
      expect(failLog).toBeDefined();
      const details = JSON.parse(failLog!.metadata);
      expect(details.error).toContain("Execution timed out");
    }
  });

  it("should handle engine unavailability errors", async () => {
    await setupSession(db, "session-unavailable");

    const engine = new MockExecutionEngine({ simulateUnavailable: true });
    const context = { ...baseContext, sessionId: "session-unavailable" };

    try {
      await delegateExecution(baseTask, context, { engine, db });
      expect.unreachable("Should have thrown EngineUnavailableError");
    } catch (e: any) {
      expect(e).toBeInstanceOf(EngineUnavailableError);
      expect(e.message).toContain("currently unavailable");
    }
  });

  it("should wrap raw engine errors in DelegationError", async () => {
    await setupSession(db, "session-raw-error");

    const engine = new MockExecutionEngine({ simulateError: true, executionDelayMs: 0 });
    const context = { ...baseContext, sessionId: "session-raw-error" };

    try {
      await delegateExecution(baseTask, context, { engine, db });
      expect.unreachable("Should have thrown DelegationError");
    } catch (e: any) {
      expect(e).toBeInstanceOf(DelegationError);
      expect(e.message).toContain("Delegation failed: Simulated engine error");
    }
  });
  it("should support progress reporting and resource cleanup callbacks", async () => {
    await setupSession(db, "session-callbacks");

    const engine = new MockExecutionEngine({ executionDelayMs: 10 });
    const context = { ...baseContext, sessionId: "session-callbacks" };

    const progressUpdates: { progress: number; message: string }[] = [];
    const onProgress = (progress: number, message: string) => progressUpdates.push({ progress, message });

    let cleanupCalled = false;
    const onCleanup = async () => { cleanupCalled = true; };

    await delegateExecution(baseTask, context, { engine, db, onProgress, onCleanup });

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates.some(u => u.message.includes("Starting delegation"))).toBeTrue();
    expect(cleanupCalled).toBeTrue();
  });
});
