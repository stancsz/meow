import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { parseSkillMarkdown, loadSkillFromRef, validateSkill } from "./skill-loader";
import * as fs from "fs";

describe("Skill Loader", () => {
    describe("parseSkillMarkdown", () => {
        it("should parse valid YAML frontmatter", () => {
            const markdown = "---\nskill_name: shopify-order-sync\nversion: 1.2.0\nrequired_credentials:\n  - shopify_api_key\nallowed_domains:\n  - \"*.myshopify.com\"\nauthor: simpleclaw-community\n---\n# Content Here\nSome instructions.";

            const skill = parseSkillMarkdown(markdown);
            expect(skill.name).toBe("shopify-order-sync");
            expect(skill.version).toBe("1.2.0");
            expect(skill.required_credentials).toEqual(["shopify_api_key"]);
            expect(skill.allowed_domains).toEqual(["*.myshopify.com"]);
            expect(skill.author).toBe("simpleclaw-community");
            expect(skill.content).toBe("# Content Here\nSome instructions.");
        });

        it("should handle missing frontmatter gracefully", () => {
            const markdown = "# Just Content\nNo frontmatter here.";

            const skill = parseSkillMarkdown(markdown);
            expect(skill.name).toBe("unknown");
            expect(skill.content).toBe("# Just Content\nNo frontmatter here.");
        });

        it("should handle invalid YAML gracefully", () => {
            const markdown = "---\ninvalid: yaml: : : \n---\n# Content";

            const skill = parseSkillMarkdown(markdown);
            expect(skill.name).toBe("unknown");
            expect(skill.content).toBe("# Content");
        });
    });

    describe("validateSkill", () => {
        it("should return true for valid skill", () => {
            const skill = {
                name: "test-skill",
                content: "Some content"
            };
            expect(validateSkill(skill)).toBe(true);
        });

        it("should return false for missing name or 'unknown'", () => {
            const skill1 = {
                name: "",
                content: "Some content"
            };
            const skill2 = {
                name: "unknown",
                content: "Some content"
            };
            expect(validateSkill(skill1)).toBe(false);
            expect(validateSkill(skill2)).toBe(false);
        });

        it("should return false for missing content", () => {
            const skill = {
                name: "test-skill",
                content: ""
            };
            expect(validateSkill(skill)).toBe(false);
        });
    });

    describe("loadSkillFromRef", () => {
        const originalFetch = global.fetch;

        beforeEach(() => {
            global.fetch = mock(async (url: string) => {
                if (url === "https://example.com/mock-skill.md") {
                    return new Response("---\nname: web-skill\nversion: 1.0.0\n---\nWeb Content", { status: 200, statusText: "OK" });
                }
                return new Response("Not Found", { status: 404, statusText: "Not Found" });
            });
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it("should load a skill from an HTTP URL", async () => {
            const skill = await loadSkillFromRef("https://example.com/mock-skill.md");
            expect(skill.name).toBe("web-skill");
            expect(skill.content).toBe("Web Content");
        });

        it("should load a skill from local file path", async () => {
            fs.writeFileSync("src/skills/temp-test-skill.md", "---\nname: temp-local-skill\n---\nLocal Content");

            try {
                const skill = await loadSkillFromRef("temp-test-skill");
                expect(skill.name).toBe("temp-local-skill");
                expect(skill.content).toBe("Local Content");
            } finally {
                fs.unlinkSync("src/skills/temp-test-skill.md");
            }
        });

        it("should throw error if skill is not found", async () => {
            await expect(loadSkillFromRef("non-existent-skill-12345")).rejects.toThrow("Failed to load skill from ref");
        });

        it("should throw error if local skill is invalid", async () => {
            fs.writeFileSync("src/skills/invalid-skill-test.md", " ");
            try {
                await expect(loadSkillFromRef("invalid-skill-test")).rejects.toThrow("Invalid skill format in file: src/skills/invalid-skill-test.md");
            } finally {
                fs.unlinkSync("src/skills/invalid-skill-test.md");
            }
        });
    });
});
