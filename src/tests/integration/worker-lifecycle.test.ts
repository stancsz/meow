import { describe, it, expect, beforeEach } from "bun:test";
import { MockWorkerRuntime, MockWorkerConfig } from "../utils/mock-worker-runtime";
import { MockGCPKMS } from "../utils/mock-kms";
import { Task } from "../../core/types";

describe("Worker Lifecycle & Execution Engine Integration", () => {
    let kms: MockGCPKMS;

    beforeEach(() => {
        kms = new MockGCPKMS();
    });

    it("should successfully boot, load skill, decrypt credentials and execute task", async () => {
        const config: MockWorkerConfig = { mockSkillResult: { data: "mock-result" } };
        const runtime = new MockWorkerRuntime(kms, config);

        const task: Task = {
            id: "gh-issue-fetch",
            description: "Fetch GitHub issues",
            worker: "worker-gh",
            skills: ["github-fetch-issues"],
            credentials: ["github_token"],
            depends_on: [],
            action_type: "READ"
        };

        const encryptedToken = await kms.encrypt("actual-github-token");
        const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

        expect(result.status).toBe("success");
        expect(result.skills_used).toContain("github-fetch-issues");
        expect(result.credentials_used).toBe(1);
        expect(result.skill_content_preview).toBe("loaded-github-fetch-issues-v1.0");
        expect(result.output).toEqual({ data: "mock-result" });
    });

    it("should fail gracefully if the worker fails to boot", async () => {
        const config: MockWorkerConfig = { failBoot: true };
        const runtime = new MockWorkerRuntime(kms, config);

        const task: Task = {
            id: "failed-boot-task",
            description: "Failed boot task",
            worker: "worker-gh",
            skills: ["github-fetch-issues"],
            credentials: ["github_token"],
            depends_on: [],
            action_type: "READ"
        };

        const encryptedToken = await kms.encrypt("actual-github-token");
        const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

        expect(result.status).toBe("error");
        expect(result.message).toBe("Worker failed to boot: out of memory");
        expect(result.error).toBe("Worker failed to boot: out of memory");
    });

    it("should fail gracefully if the execution engine fails", async () => {
        const config: MockWorkerConfig = { failExecution: true };
        const runtime = new MockWorkerRuntime(kms, config);

        const task: Task = {
            id: "failed-execution-task",
            description: "Failed execution task",
            worker: "worker-gh",
            skills: ["github-fetch-issues"],
            credentials: ["github_token"],
            depends_on: [],
            action_type: "READ"
        };

        const encryptedToken = await kms.encrypt("actual-github-token");
        const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

        expect(result.status).toBe("error");
        expect(result.message).toBe("Execution failed: network timeout");
        expect(result.error).toBe("Execution failed: network timeout");
    });

    it("should handle invalid skill load errors gracefully", async () => {
        const runtime = new MockWorkerRuntime(kms);

        const task: Task = {
            id: "missing-skill-task",
            description: "Missing skill task",
            worker: "worker-gh",
            skills: ["non-existent"],
            credentials: ["github_token"],
            depends_on: [],
            action_type: "READ"
        };

        const encryptedToken = await kms.encrypt("actual-github-token");
        const result = await runtime.simulateWorkerLifecycle(task, [encryptedToken]);

        expect(result.status).toBe("error");
        expect(result.message).toBe("Skill non-existent not found");
        expect(result.error).toBe("Skill non-existent not found");
    });

});
