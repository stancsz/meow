import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TestMotherboard } from "../utils/test-motherboard";
import { SwarmManifest, Task } from "../../core/types";

describe("Sovereign Motherboard Integrations", () => {
    let mb: TestMotherboard;

    beforeEach(async () => {
        mb = new TestMotherboard();
        await mb.setup();
    });

    afterEach(async () => {
        await mb.teardown();
    });

    it("should correctly persist and retrieve orchestrator sessions", async () => {
        const manifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Test intent",
            skills_required: ["test-skill"],
            credentials_required: [],
            steps: []
        };

        const sessionId = mb.db.createSession("test_user_1", { prompt: "test prompt" }, manifest);

        const session = mb.db.getSession(sessionId);

        expect(session).toBeDefined();
        expect(session.user_id).toBe("test_user_1");
        expect(session.status).toBe("active");
        expect(JSON.stringify(session.manifest)).toContain("test-skill");
    });

    it("should update session status correctly", async () => {
        const manifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Test intent status",
            skills_required: ["test-skill"],
            credentials_required: [],
            steps: []
        };

        const sessionId = mb.db.createSession("test_user_1", { prompt: "test status" }, manifest);

        mb.db.updateSessionStatus(sessionId, "completed");

        const session = mb.db.getSession(sessionId);
        expect(session.status).toBe("completed");
    });

    it("should log task results and retrieve them", async () => {
        const manifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Test task results",
            skills_required: ["test-skill"],
            credentials_required: [],
            steps: []
        };

        const sessionId = mb.db.createSession("test_user_1", { prompt: "test results" }, manifest);

        mb.db.logTaskResult(sessionId, "worker_1", "test-skill", "success", {
            message: "Success!",
            data: "Test Data"
        });

        const results = mb.getTaskResults(sessionId);

        expect(results.length).toBe(1);
        expect(results[0].worker_id).toBe("worker_1");
        expect(results[0].skill_ref).toBe("test-skill");
        expect(results[0].status).toBe("success");
        expect(JSON.parse(results[0].output)).toEqual({
            message: "Success!",
            data: "Test Data"
        });
    });

    it("should successfully debit gas from ledger", async () => {
        const result = await mb.db.debitCredits("test_user_1", 10);

        expect(result).toBe(true);

        const gasLedger = (mb.db as any).db.query("SELECT balance_credits FROM gas_ledger WHERE user_id = 'test_user_1'").get();
        expect(gasLedger.balance_credits).toBe(90);
    });

    it("should fail to debit gas if insufficient balance", async () => {
        mb.setGasBalance("test_user_1", 100); // Reset balance explicitly
        // Current balance is 100
        const result = await mb.db.debitCredits("test_user_1", 150);

        expect(result).toBe(false);

        const gasLedger = (mb.db as any).db.query("SELECT balance_credits FROM gas_ledger WHERE user_id = 'test_user_1'").get();
        expect(gasLedger.balance_credits).toBe(100);
    });
});
