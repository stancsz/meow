import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { cloudFunctionHandler } from "./cloud-function";
import type { Task } from "../core/types";

// Mock the core dependencies
mock.module("../security/kms", () => ({
  getKMSProvider: () => ({
    decrypt: mock(async (ciphertext: string) => `decrypted-${ciphertext}`),
  })
}));

mock.module("../core/skill-loader", () => ({
  loadSkillFromRef: mock(async (ref: string) => {
    if (ref === "invalid-skill") throw new Error("Skill not found");
    return { content: `Mocked skill content for ${ref}` };
  })
}));

const mockSupabaseQuery = mock((table: string) => {
  if (table === "transaction_log") {
    return {
      select: mock(() => ({
        eq: mock(() => ({
          maybeSingle: mock(async () => ({ data: null, error: null })),
        }))
      })),
      insert: mock(async () => ({ data: null, error: null }))
    };
  }
  if (table === "skill_refs") {
    return {
      select: mock(() => ({
        eq: mock(() => ({
          maybeSingle: mock(async () => ({ data: null, error: null })),
        }))
      }))
    };
  }
  return {
    insert: mock(async () => ({ data: null, error: null }))
  };
});

mock.module("@supabase/supabase-js", () => ({
  createClient: mock(() => ({
    from: mockSupabaseQuery
  }))
}));

mock.module("../core/execution-engine", () => {
  return {
    OpenCodeExecutionEngine: class {
      execute = mock(async (task: any, ctx: any) => ({
        message: "Executed",
        skills_used: [ctx.skillContent],
        delegated_to: "opencode-mock",
        status: "completed"
      }));
    }
  };
});

describe("Cloud Function Worker Runtime", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    mockSupabaseQuery.mockClear();

    req = {
      method: "POST",
      body: {
        session_id: "test-session",
        worker_id: "worker-1",
        supabase_url: "https://mock.supabase.co",
        supabase_service_role_ciphertext: "encrypted-service-role",
        task_config: {
          id: "task-1",
          description: "A test task",
          worker: "worker-1",
          skills: ["test-skill"],
          credentials: [],
          depends_on: [],
          action_type: "READ"
        } as Task,
      }
    };

    res = {
      status: mock((code: number) => res),
      json: mock((body: any) => body),
      set: mock((key: string, value: string) => {}),
      send: mock((body: string) => {})
    };
  });

  afterEach(() => {
    mock.restore();
  });

  it("should reject non-POST requests", async () => {
    req.method = "GET";
    await cloudFunctionHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: "Method Not Allowed. Use POST." });
  });

  it("should successfully execute a READ task and log results", async () => {
    await cloudFunctionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseJson = res.json.mock.calls[0][0];

    expect(responseJson.status).toBe("success");
    expect(responseJson.output.status).toBe("completed");

    // Check that we inserted the result to task_results
    expect(mockSupabaseQuery).toHaveBeenCalledWith("task_results");
  });

  it("should process user credential if provided", async () => {
    req.body.credential_ciphertext = "encrypted-user-secret";
    req.body.task_config.credentials = ["my-github-token"];

    await cloudFunctionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseJson = res.json.mock.calls[0][0];
    expect(responseJson.status).toBe("success");
  });

  it("should check and handle idempotency for WRITE tasks", async () => {
    req.body.task_config.action_type = "WRITE";

    // Mock the query to return an existing transaction
    const mockMaybeSingle = mock(async () => ({ data: { id: "existing-tx" }, error: null }));
    mockSupabaseQuery.mockImplementation((table: string) => {
      if (table === "transaction_log") {
        return {
          select: mock(() => ({
            eq: mock(() => ({
              maybeSingle: mockMaybeSingle
            }))
          })),
          insert: mock(async () => ({ data: null, error: null }))
        } as any;
      }
      if (table === "skill_refs") {
        return {
          select: mock(() => ({
            eq: mock(() => ({
              maybeSingle: mock(async () => ({ data: null, error: null })),
            }))
          }))
        } as any;
      }
      // fallback for other tables
      return {
        insert: mock(async () => ({ data: null, error: null }))
      } as any;
    });

    await cloudFunctionHandler(req, res);

    expect(mockMaybeSingle).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const responseJson = res.json.mock.calls[0][0];
    expect(responseJson.status).toBe("skipped");
    expect(responseJson.output.message).toBe("Task skipped due to idempotency check.");
  });

  it("should handle skill load errors gracefully", async () => {
    req.body.skill_ref = "invalid-skill";

    await cloudFunctionHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const responseJson = res.json.mock.calls[0][0];
    expect(responseJson.status).toBe("error");
    expect(responseJson.error).toContain("Failed to load skill");
  });
});
