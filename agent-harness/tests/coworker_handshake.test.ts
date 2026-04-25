import { describe, it, expect, beforeEach } from "bun:test";
import { GovernanceEngine } from "../src/sidecars/governance-engine.ts";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";

describe("Meowju Coworker Handshake", () => {
    const testRoot = join(process.cwd(), "tests", "fixtures");
    const testConfig = join(testRoot, "meow.json");

    beforeEach(() => {
        if (existsSync(testConfig)) unlinkSync(testConfig);
        // Create initial config with 'ask' for shell
        writeFileSync(testConfig, JSON.stringify({
            permissions: [{ tool: "run_command", action: "ask" }]
        }));
    });

    it("should BLOCK sensitive tools by default when action is 'ask'", async () => {
        const gov = new GovernanceEngine(testRoot);
        
        let gatePassed = false;
        const checkPromise = gov.checkPermission("run_command").then(res => {
            gatePassed = res;
            return res;
        });

        // Wait a small amount to see if it resolved instantly (it shouldn't)
        await new Promise(r => setTimeout(r, 100));
        expect(gatePassed).toBe(false);

        // Now resolve it
        const pending = gov.getPendingApprovals();
        expect(pending.length).toBe(1);
        
        gov.resolveApproval(pending[0], true);
        
        const result = await checkPromise;
        expect(result).toBe(true);
    });

    it("should AUTO-ALLOW safe tools", async () => {
        const gov = new GovernanceEngine(testRoot);
        const result = await gov.checkPermission("view_file");
        expect(result).toBe(true);
    });

    it("should DENY blacklisted tools", async () => {
        writeFileSync(testConfig, JSON.stringify({
            permissions: [{ tool: "rm", action: "deny" }]
        }));
        const gov = new GovernanceEngine(testRoot);
        const result = await gov.checkPermission("rm");
        expect(result).toBe(false);
    });
});
