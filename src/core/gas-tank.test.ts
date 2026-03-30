import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { handleStripeWebhook } from "./payments";
import { executeSwarmManifest } from "./dispatcher";
import { stripe } from "./stripe";
import type { SwarmManifest, Task } from "./types";

// Mocking the Stripe module to control webhook event construction
mock.module("./stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: mock((payload: string, sig: string, secret: string) => {
        if (sig === "invalid") {
          throw new Error("Invalid signature");
        }
        return JSON.parse(payload);
      })
    }
  },
  STRIPE_WEBHOOK_SECRET: "whsec_test"
}));

// Mock executeWorkerTask inside dispatcher to avoid real execution during tests
mock.module("../workers/template", () => ({
  executeWorkerTask: mock(async (task: any, sessionId: string, db: any) => {
    return { status: "success", output: { result: `Executed ${task.id}` } };
  })
}));

describe("Phase 1 Gas Tank - Stripe Webhook Handling", () => {
  let db: DBClient;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");
    db.applyMigration(`
      CREATE TABLE IF NOT EXISTS gas_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        balance_credits INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        credits_used INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transaction_log (
        idempotency_key TEXT PRIMARY KEY,
        status TEXT,
        result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        event TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterEach(() => {
    mock.restore();
  });

  test("successfully processes a valid checkout.session.completed event", () => {
    const userId = "user-123";
    const eventId = "evt_1";
    const payload = JSON.stringify({
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: userId,
          metadata: {
            userId: userId,
            credits: "1000"
          }
        }
      }
    });

    // Verify initial balance
    expect(db.getGasBalance(userId)).toBe(10); // DBClient defaults new users to 10

    const success = handleStripeWebhook(payload, "valid_sig", db);
    expect(success).toBe(true);

    // Verify balance was incremented
    expect(db.getGasBalance(userId)).toBe(1010);

    // Verify idempotency log
    expect(db.checkIdempotency(eventId)).toBe(true);
  });

  test("skips processing if event is already processed (idempotency)", () => {
    const userId = "user-123";
    const eventId = "evt_2";

    // Log it first
    db.logTransaction(eventId, "completed", { amount: 1000 });

    const payload = JSON.stringify({
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            userId: userId,
            credits: "1000"
          }
        }
      }
    });

    const success = handleStripeWebhook(payload, "valid_sig", db);
    expect(success).toBe(true);

    // Balance should remain at default 10
    expect(db.getGasBalance(userId)).toBe(10);
  });

  test("fails gracefully on invalid signature", () => {
    const payload = JSON.stringify({ id: "evt_3" });
    const success = handleStripeWebhook(payload, "invalid", db);
    expect(success).toBe(false);
  });
});

describe("Phase 1 Gas Tank - Credit Debit Logic", () => {
  let db: DBClient;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");
    db.applyMigration(`
      CREATE TABLE IF NOT EXISTS orchestrator_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        context TEXT,
        manifest TEXT,
        continuous_mode INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        credits_used INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        event TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS gas_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        balance_credits INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        credits_used INTEGER DEFAULT 0
      );
    `);
  });

  test("blocks execution when user has no gas credits", async () => {
    const userId = "user-no-gas";
    const sessionId = "session-no-gas";

    // Explicitly set gas to 0 (default is 10, so we have to update it to 0)
    db.getGasBalance(userId); // initialize
    db.db.run("UPDATE gas_ledger SET balance_credits = 0 WHERE user_id = ?", [userId]);

    db.createSession(userId, {}, {});
    db.db.run("UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?", [sessionId, userId]);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent: "Test task",
      steps: [{ id: "task1", action_type: "READ", description: "test" }]
    };

    const results = await executeSwarmManifest(manifest, sessionId, db);

    expect(results.error).toBeDefined();
    expect(results.error.error).toBe("Insufficient gas credits");

    const session = db.getSession(sessionId);
    expect(session.status).toBe("error");
  });

  test("executes swarm and debits 1 credit upon success", async () => {
    const userId = "user-with-gas";
    const sessionId = "session-success";

    // Get initial balance (should be 10)
    const initialBalance = db.getGasBalance(userId);
    expect(initialBalance).toBe(10);

    db.createSession(userId, {}, {});
    db.db.run("UPDATE orchestrator_sessions SET id = ? WHERE user_id = ?", [sessionId, userId]);

    const manifest: SwarmManifest = {
      version: "1.0",
      intent: "Test task",
      steps: [{ id: "task1", action_type: "READ", description: "test" }]
    };

    const results = await executeSwarmManifest(manifest, sessionId, db);

    expect(results.task1.status).toBe("success");

    const session = db.getSession(sessionId);
    expect(session.status).toBe("completed");

    // Balance should be debited by 1
    const newBalance = db.getGasBalance(userId);
    expect(newBalance).toBe(9);

    // Verify audit log has gas_consumed_for_session
    const logs = db.getAuditLogs(sessionId);
    expect(logs.some(l => l.event === "gas_consumed_for_session")).toBe(true);
  });
});
