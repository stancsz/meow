import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import type { WorkerResult } from "./template";
import { getKMSProvider } from "../security/kms";
import { platformDbMock } from "./template";

export async function executeDemoWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient
): Promise<WorkerResult> {
  // 1. Boot: Log start (simulated)

  // 2. Idempotency check before executing WRITE tasks
  if (task.action_type === "WRITE") {
    const isCompleted = db.checkIdempotency(task.id);
    if (isCompleted) {
      db.writeAuditLog(sessionId, "worker_skipped_idempotent", { task_id: task.id });
      return { status: "skipped", output: { message: "Task skipped due to idempotency check." } };
    }
  }

  try {
    // 3. Load JIT Skill
    let skillContent = "";
    if (task.skills && task.skills.length > 0) {
      try {
        skillContent = await Bun.file(`src/skills/${task.skills[0]}.md`).text();
      } catch (err: any) {
        skillContent = "Skill file not found or failed to load.";
      }
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills, loaded_content_preview: skillContent.substring(0, 50) });

    // 4. Fetch credential
    const kmsProvider = getKMSProvider();
    let authHeader = "";
    const decryptedCredentials: Record<string, string> = {};

    const session = db.getSession(sessionId);
    const resolvedUserId = session?.user_id;

    if (resolvedUserId) {
      const mockCreds = platformDbMock.get(resolvedUserId);
      if (mockCreds) {
        const decryptedServiceRole = await kmsProvider.decrypt(mockCreds.encryptedKey);
        decryptedCredentials['supabase_service_role'] = decryptedServiceRole;
        decryptedCredentials['supabase_url'] = mockCreds.supabaseUrl;
      } else {
        const platformUser = db.getPlatformUser(resolvedUserId);
        if (platformUser && platformUser.encrypted_service_role) {
            const decryptedServiceRole = await kmsProvider.decrypt(platformUser.encrypted_service_role);
            decryptedCredentials['supabase_service_role'] = decryptedServiceRole;
            decryptedCredentials['supabase_url'] = platformUser.supabase_url;
        }
      }
    }

    for (const cred of task.credentials) {
      const encryptedSecret = db.simulateReadSecret(cred);
      if (encryptedSecret && encryptedSecret !== "MOCK_SUPABASE_SECRET") {
         const decryptedSecret = await kmsProvider.decrypt(encryptedSecret);
         authHeader = `Bearer ${decryptedSecret}`;
         decryptedCredentials[cred] = decryptedSecret;
         db.writeAuditLog(sessionId, "worker_decrypted_credential", { task_id: task.id, cred_id: cred, decrypted_value: "[masked]" });
      }
    }

    // 5. Execute HTTP request (Demo logic)
    // The demo skill dictates a GET to https://httpbin.org/json
    const targetEndpoint = "https://httpbin.org/json";

    const headers: Record<string, string> = {
        "Accept": "application/json",
        "User-Agent": "SimpleClaw-DemoWorker"
    };

    if (authHeader) {
        headers["Authorization"] = authHeader;
    }

    const res = await fetch(targetEndpoint, { headers });
    const responseJson = await res.json();

    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText} - ${JSON.stringify(responseJson)}`);
    }

    const mockOutput = {
      message: `Executed demo task ${task.id}: ${task.description}`,
      skills_used: task.skills,
      api_response: responseJson
    };

    // 6. Explicitly delete key from local variables
    decryptedCredentials['supabase_service_role'] = '';
    authHeader = '';

    // 7. Write result to DB and terminate
    if (task.action_type === "WRITE") {
      db.logTransaction(task.id, "completed", mockOutput);
    }

    // Log result for all tasks
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "success", mockOutput, false);
    db.writeAuditLog(sessionId, "worker_completed", { task_id: task.id, output: mockOutput });

    return { status: "success", output: mockOutput };

  } catch (error: any) {
    db.writeAuditLog(sessionId, "worker_failed", { task_id: task.id, error: error.message });
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "error", error.message, true);

    return { status: "error", error: error.message };
  }
}
