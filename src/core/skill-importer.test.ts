import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { importGitHubSkill } from "./skill-importer";
import { DBClient } from "../db/client";

describe("Skill Importer", () => {
    let db: DBClient;
    const mockUserId = "user-123";
    const originalFetch = global.fetch;

    beforeEach(() => {
        db = new DBClient();
        db.applyMigration(`
            CREATE TABLE IF NOT EXISTS skill_refs (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                skill_name TEXT,
                source TEXT,
                ref TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add the methods to the class prototype directly for testing if they don't exist
        if (!(db as any).checkSkillExists) {
            (db as any).checkSkillExists = (userId: string, skillName: string) => {
                const row = (db as any).db.query("SELECT * FROM skill_refs WHERE user_id = ? AND skill_name = ?").get(userId, skillName);
                return !!row;
            };
        }

        if (!(db as any).addSkillRef) {
             (db as any).addSkillRef = (userId: string, skillName: string, source: string, ref: string) => {
                 const id = crypto.randomUUID();
                 (db as any).db.run(
                    "INSERT INTO skill_refs (id, user_id, skill_name, source, ref) VALUES (?, ?, ?, ?, ?)",
                    [id, userId, skillName, source, ref]
                 );
             };
        }

        // Clean table
        (db as any).db.run("DELETE FROM skill_refs");

        global.fetch = mock(async (url: string) => {
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/test-skill.md") {
                return new Response("---\nname: test-skill\nversion: 1.0.0\nallowed_domains:\n  - api.example.com\n---\nTest Content", { status: 200, statusText: "OK" });
            }
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/unsafe-skill.md") {
                return new Response("---\nname: unsafe-skill\nversion: 1.0.0\nallowed_domains:\n  - \"*\"\n---\nTest Content", { status: 200, statusText: "OK" });
            }
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/no-domain-skill.md") {
                return new Response("---\nname: no-domain-skill\nversion: 1.0.0\n---\nTest Content", { status: 200, statusText: "OK" });
            }
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/invalid-skill.md") {
                return new Response("Invalid Content", { status: 200, statusText: "OK" });
            }
            return new Response("Not Found", { status: 404, statusText: "Not Found" });
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should successfully import a valid GitHub skill", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/test-skill.md";
        const skill = await importGitHubSkill(url, mockUserId, db);

        expect(skill.name).toBe("test-skill");
        expect((db as any).checkSkillExists(mockUserId, "test-skill")).toBe(true);
    });

    it("should reject non-GitHub URLs", async () => {
        const url = "https://example.com/skill.md";
        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Invalid GitHub URL");
    });

    it("should handle fetch errors gracefully", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/non-existent.md";
        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Failed to load skill from ref");
    });

    it("should reject skills with invalid formats", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/invalid-skill.md";
        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Invalid skill format");
    });

    it("should prevent duplicate skill imports", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/test-skill.md";
        await importGitHubSkill(url, mockUserId, db); // First import

        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Skill test-skill already exists");
    });

    it("should reject skills with wildcard allowed_domains", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/unsafe-skill.md";
        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Skill cannot use wildcard \"*\" for allowed_domains");
    });

    it("should reject skills without allowed_domains", async () => {
        const url = "https://github.com/user/repo/blob/main/skills/no-domain-skill.md";
        await expect(importGitHubSkill(url, mockUserId, db)).rejects.toThrow("Skill must explicitly declare allowed_domains for safety");
    });
});
