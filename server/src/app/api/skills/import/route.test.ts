import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// Mock NextResponse
const mockNextResponse = {
    json: mock((data, init) => {
        return {
            status: init?.status || 200,
            json: async () => data,
            _data: data
        };
    })
};

// Mock the whole next/server module BEFORE importing the route
mock.module('next/server', () => {
    return {
        NextResponse: mockNextResponse
    };
});

// Mock getDbClient
mock.module('../../../../../../src/db/client', () => {
    return {
        getDbClient: () => {
            return {
                checkSkillExists: mock(() => false),
                addSkillRef: mock(() => {})
            };
        }
    };
});

import { POST } from "./route";

describe("POST /api/skills/import", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        mockNextResponse.json.mockClear();
        global.fetch = mock(async (url: string) => {
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/test-skill.md") {
                return new Response("---\nname: route-test-skill\nversion: 1.0.0\nallowed_domains:\n  - api.example.com\n---\nTest Content", { status: 200, statusText: "OK" });
            }
            if (url === "https://raw.githubusercontent.com/user/repo/main/skills/unsafe-skill.md") {
                return new Response("---\nname: unsafe-skill\nversion: 1.0.0\nallowed_domains:\n  - \"*\"\n---\nTest Content", { status: 200, statusText: "OK" });
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

    it("should successfully import a skill and return 200", async () => {
        const req = new Request("http://localhost/api/skills/import", {
            method: "POST",
            body: JSON.stringify({
                url: "https://github.com/user/repo/blob/main/skills/test-skill.md",
                userId: "user-456"
            })
        });

        const response = await POST(req) as any;
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.skill.name).toBe("route-test-skill");
    });

    it("should return 400 for missing url or userId", async () => {
        const req = new Request("http://localhost/api/skills/import", {
            method: "POST",
            body: JSON.stringify({
                url: "https://github.com/user/repo/blob/main/skills/test-skill.md"
                // Missing userId
            })
        });

        const response = await POST(req) as any;
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBe("Missing url or userId");
    });

    it("should return 400 for invalid GitHub URL", async () => {
        const req = new Request("http://localhost/api/skills/import", {
            method: "POST",
            body: JSON.stringify({
                url: "https://example.com/skill.md",
                userId: "user-456"
            })
        });

        const response = await POST(req) as any;
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBe("Invalid GitHub URL");
    });

    it("should return 400 for unsafe skills", async () => {
        const req = new Request("http://localhost/api/skills/import", {
            method: "POST",
            body: JSON.stringify({
                url: "https://github.com/user/repo/blob/main/skills/unsafe-skill.md",
                userId: "user-456"
            })
        });

        const response = await POST(req) as any;
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBe("Skill cannot use wildcard \"*\" for allowed_domains");
    });
});
