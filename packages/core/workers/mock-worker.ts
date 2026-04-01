import { DBClient } from "../db/client";
import type { Task } from "../core/types";
import type { WorkerResult } from "./template";

export async function executeMockWorkerTask(
  task: Task,
  sessionId: string,
  db: DBClient
): Promise<WorkerResult> {
  // 1. Idempotency check before WRITE
  if (task.action_type === "WRITE") {
    const isCompleted = db.checkIdempotency(task.id);
    if (isCompleted) {
      db.writeAuditLog(sessionId, "worker_skipped_idempotent", { task_id: task.id });
      return { status: "skipped", output: { message: "Task skipped due to idempotency check." } };
    }
  }

  try {
    // 2. Load JIT Skill
    let skillContent = "";
    if (task.skills && task.skills.length > 0) {
      try {
        skillContent = await Bun.file(`src/skills/${task.skills[0]}.md`).text();
      } catch (err: any) {
        skillContent = "Skill file not found or failed to load.";
      }
    }
    db.writeAuditLog(sessionId, "worker_loading_skill", { task_id: task.id, skills: task.skills, loaded_content_preview: skillContent.substring(0, 50) });

    // 3. Execute actual Mock API call
    let mockOutput: any = {
      message: `Executed task ${task.id}: ${task.description}`,
      skills_used: task.skills,
    };

    const targetEndpoint = "https://jsonplaceholder.typicode.com/todos/1";

    const res = await fetch(targetEndpoint, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "SimpleClaw-Worker"
        }
    });

    const responseJson = await res.json();

    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText} - ${JSON.stringify(responseJson)}`);
    }

    mockOutput.api_response = responseJson;

    // 4. Write result to DB and terminate
    if (task.action_type === "WRITE") {
      db.logTransaction(task.id, "completed", mockOutput);
    }

    // Log result for all tasks
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "success", mockOutput, false);
    db.writeAuditLog(sessionId, "worker_completed", { task_id: task.id });

    return { status: "success", output: mockOutput };

  } catch (error: any) {
    db.writeAuditLog(sessionId, "worker_failed", { task_id: task.id, error: error.message });
    db.logTaskResult(sessionId, `worker-${task.id}`, task.skills[0] || "none", "error", error.message, true);

    return { status: "error", error: error.message };
  }
}
