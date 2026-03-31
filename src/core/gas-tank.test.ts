import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { DBClient } from "../db/client";
import { handleStripeWebhook } from "./payments";
import { executeSwarmManifest } from "./dispatcher";
import { GasTank } from "./gas-tank";
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
      CREATE TABLE IF NOT EXISTS gas_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
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
      CREATE TABLE IF NOT EXISTS gas_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

describe("Phase 1 Gas Tank - GasTank Module Logic", () => {
  let db: DBClient;
  let gasTank: GasTank;

  beforeEach(() => {
    db = new DBClient("sqlite://:memory:");
    db.applyMigration(`
      CREATE TABLE IF NOT EXISTS platform_users (
          user_id TEXT PRIMARY KEY,
          supabase_url TEXT NOT NULL,
          encrypted_service_role TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS gas_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        balance_credits INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS gas_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    gasTank = new GasTank(db);
  });

  test("initializes gas ledger for new user with 0 balance", async () => {
    const userId = "user-init-test";

    // Explicitly set user in platform_users to satisfy foreign key constraint if enforced
    db.db.run(`INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)`, [userId, "mock-url", "mock-role"]);

    await gasTank.initializeGasLedger(userId);

    const balance = await gasTank.getBalance(userId);
    expect(balance).toBe(0);
  });

  test("adds credits and updates balance", async () => {
    const userId = "user-add-test";

    db.db.run(`INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)`, [userId, "mock-url", "mock-role"]);
    await gasTank.initializeGasLedger(userId);

    const { newBalance } = await gasTank.addCredits(userId, 50);
    expect(newBalance).toBe(50);

    const balance = await gasTank.getBalance(userId);
    expect(balance).toBe(50);

    // Verify transaction was logged
    const tx = db.db.query(`SELECT * FROM gas_transactions WHERE user_id = ? AND transaction_type = 'credit'`).get(userId);
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(50);
  });

  test("debits execution successfully when having sufficient credits", async () => {
    const userId = "user-debit-success";

    db.db.run(`INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)`, [userId, "mock-url", "mock-role"]);
    await gasTank.initializeGasLedger(userId);
    await gasTank.addCredits(userId, 10);

    const { newBalance } = await gasTank.debitExecution(userId, 2);
    expect(newBalance).toBe(8);

    const tx = db.db.query(`SELECT * FROM gas_transactions WHERE user_id = ? AND transaction_type = 'debit'`).get(userId);
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(2);
  });

  test("fails to debit execution if insufficient credits", async () => {
    const userId = "user-debit-fail";

    db.db.run(`INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)`, [userId, "mock-url", "mock-role"]);
    await gasTank.initializeGasLedger(userId);
    await gasTank.addCredits(userId, 1);

    expect(gasTank.debitExecution(userId, 2)).rejects.toThrow("Insufficient gas credits");

    const balance = await gasTank.getBalance(userId);
    expect(balance).toBe(1); // Unchanged

    const tx = db.db.query(`SELECT * FROM gas_transactions WHERE user_id = ? AND transaction_type = 'debit'`).get(userId);
    expect(tx).toBeNull(); // Should not have logged a debit
  });

  test("handles idempotent executions to avoid double charge", async () => {
    const userId = "user-idempotent";
    const idempotencyKey = "execution-123";

    db.db.run(`INSERT INTO platform_users (user_id, supabase_url, encrypted_service_role) VALUES (?, ?, ?)`, [userId, "mock-url", "mock-role"]);
    await gasTank.initializeGasLedger(userId);
    await gasTank.addCredits(userId, 10);

    const run1 = await gasTank.debitExecution(userId, 1, idempotencyKey);
    expect(run1.newBalance).toBe(9);

    const run2 = await gasTank.debitExecution(userId, 1, idempotencyKey);
    expect(run2.newBalance).toBe(9); // Balance should remain unchanged
  });
});
