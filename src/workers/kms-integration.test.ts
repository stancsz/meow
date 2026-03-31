import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DBClient } from "../db/client";
import { executeWorkerTask } from "./template";
import type { Task } from "../core/types";
import { getKMSProvider } from "../security/kms";
import * as fs from "fs";

let mockSupabaseKeyReceived: string | null = null;
let mockSupabaseUrlReceived: string | null = null;
let mockInsertCalled = false;

mock.module("@supabase/supabase-js", () => {
  return {
    createClient: (url: string, key: string) => {
      mockSupabaseUrlReceived = url;
      mockSupabaseKeyReceived = key;
      return {
        from: (table: string) => {
          if (table === 'orchestrator_sessions' || table === 'vault.user_secrets') {
              return {
                select: () => ({
                  eq: () => ({
                    single: async () => ({ data: { id: "mock_data" }, error: null })
                  })
                })
              };
          }
          if (table === 'task_results') {
              return {
                  insert: async () => {
                      mockInsertCalled = true;
                      return { error: null };
                  }
              }
          }
          return {
              select: () => ({
                  eq: () => ({
                      single: async () => ({ data: null, error: null })
                  })
              }),
              insert: async () => ({ error: null })
          };
        }
      };
    }
  };
});

describe("KMS Credential Flow Integration", () => {
  let db: DBClient;

  beforeEach(() => {
    // Reset mocks
    mockSupabaseKeyReceived = null;
    mockSupabaseUrlReceived = null;
    mockInsertCalled = false;

    process.env.KMS_PROVIDER = "local";
    db = new DBClient("sqlite://:memory:");
    const schema = fs.readFileSync("src/db/migrations/001_motherboard.sql", "utf-8");
    db.applyMigration(schema);
  });

  afterEach(() => {
    delete process.env.KMS_PROVIDER;
  });

  it("should fetch, decrypt, and use platform user credentials without persisting decrypted key", async () => {
    const kmsProvider = getKMSProvider();
    const testUserId = "user-kms-test";
    const testSessionId = "session-kms-test";
    const plaintextServiceRole = "super-secret-service-role-key-999";
    const mockSupabaseUrl = "https://kms-test.supabase.co";

    // 1. Encrypt a mock service key
    const encryptedServiceRole = await kmsProvider.encrypt(plaintextServiceRole);

    // 2. Store it in the platform DB
    db.setPlatformUser(testUserId, mockSupabaseUrl, encryptedServiceRole);

    const task: Task = {
      id: "kms-integration-task",
      description: "Verify KMS credential decryption",
      worker: "worker-mock",
      skills: [],
      credentials: [],
      depends_on: [],
      action_type: "READ",
    };

    // Ensure session exists
    db.createSession(testUserId, { prompt: "KMS Test" }, { version: "1.0", intent_parsed: "KMS Test", skills_required: [], credentials_required: [], steps: [task] });

    // 3. Execute worker task
    const result = await executeWorkerTask(task, testSessionId, db, testUserId);

    expect(result.status).toBe("success");

    // 4. Verify that the worker instantiated the Supabase client with the DECRYPTED key
    expect(mockSupabaseUrlReceived).toBe(mockSupabaseUrl);
    expect(mockSupabaseKeyReceived).toBe(plaintextServiceRole);

    // 5. Verify that the worker logged the task result via the new Supabase client
    expect(mockInsertCalled).toBe(true);

    // 6. Assert decrypted key is not logged in task result output
    const outputString = JSON.stringify(result.output);
    expect(outputString).not.toContain(plaintextServiceRole);

    // 7. Verify audit logs don't contain plaintext key
    const auditLogs = db.getAuditLogs(testSessionId);
    for (const log of auditLogs) {
        expect(log.metadata).not.toContain(plaintextServiceRole);
    }
  });
});