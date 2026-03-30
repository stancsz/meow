import { expect, test, describe, beforeAll, afterAll, mock, beforeEach } from "bun:test";
import { NextRequest } from "next/server";

// Mock the Next.js API environment and underlying execution functions
mock.module("next/server", () => {
    class NextRequest {
        url: string;
        bodyData?: any;
        constructor(url: string, init?: any) {
            this.url = url;
            if (init?.body) {
                this.bodyData = JSON.parse(init.body);
            }
        }
        async json() {
            if (this.bodyData) return this.bodyData;
            throw new Error("No JSON body");
        }
    }

    return {
        NextRequest,
        NextResponse: {
            json: (body: any, init?: { status?: number }) => {
                return {
                    status: init?.status || 200,
                    body,
                    json: async () => body
                };
            }
        }
    };
});

// Since Next.js `Response` global is used in route.ts, mock it globally
globalThis.Response = {
    json: (body: any, init?: { status?: number }) => {
        return {
            status: init?.status || 200,
            body,
            json: async () => body
        };
    }
} as any;

let processAllHeartbeatsCalled = false;
mock.module("@/../../src/core/heartbeat", () => ({
    processAllHeartbeats: async () => {
        processAllHeartbeatsCalled = true;
    }
}));

let handleHeartbeatCalledWith: string | null = null;
mock.module("@/../../src/core/orchestrator", () => ({
    handleHeartbeat: async (sessionId: string) => {
        handleHeartbeatCalledWith = sessionId;
    }
}));

mock.module("@/../../src/db/client", () => ({
    getDbClient: () => ({})
}));

// Import after mocks are set up
import { POST } from "./route";

describe("Heartbeat API Route", () => {
    beforeEach(() => {
        processAllHeartbeatsCalled = false;
        handleHeartbeatCalledWith = null;
    });

    test("handles POST without session_id (triggers processAllHeartbeats)", async () => {
        const req = new NextRequest("http://localhost/api/heartbeat");
        const response = await POST(req as any);

        expect(response.status).toBe(200);
        expect(processAllHeartbeatsCalled).toBe(true);
        expect(handleHeartbeatCalledWith).toBeNull();
    });

    test("handles POST with session_id in URL search params", async () => {
        const req = new NextRequest("http://localhost/api/heartbeat?session_id=url-session-123");
        const response = await POST(req as any);

        expect(response.status).toBe(200);
        expect(processAllHeartbeatsCalled).toBe(false);
        expect(handleHeartbeatCalledWith).toBe("url-session-123");
    });

    test("handles POST with session_id in JSON body", async () => {
        const req = new NextRequest("http://localhost/api/heartbeat", {
            method: "POST",
            body: JSON.stringify({ session_id: "body-session-456" })
        });
        const response = await POST(req as any);

        expect(response.status).toBe(200);
        expect(processAllHeartbeatsCalled).toBe(false);
        expect(handleHeartbeatCalledWith).toBe("body-session-456");
    });

    test("handles POST with sessionId in JSON body", async () => {
        const req = new NextRequest("http://localhost/api/heartbeat", {
            method: "POST",
            body: JSON.stringify({ sessionId: "body-session-789" })
        });
        const response = await POST(req as any);

        expect(response.status).toBe(200);
        expect(processAllHeartbeatsCalled).toBe(false);
        expect(handleHeartbeatCalledWith).toBe("body-session-789");
    });

    test("returns 500 on internal error", async () => {
        // Temporarily break a module to force an error
        const originalHandle = handleHeartbeatCalledWith;
        mock.module("@/../../src/core/orchestrator", () => ({
            handleHeartbeat: async () => {
                throw new Error("Simulated backend failure");
            }
        }));

        // Have to re-import or simulate since module cache might hold onto it.
        // In Bun, throwing inside the mock actually works immediately for subsequent calls if the mock is re-evaluted, but let's just do an inline hack for the test:
        const { POST: brokenPOST } = require("./route");

        // However, we can also just mock the db client to throw
        mock.module("@/../../src/db/client", () => ({
            getDbClient: () => { throw new Error("DB Error"); }
        }));

        const req = new NextRequest("http://localhost/api/heartbeat");
        const response = await brokenPOST(req as any);

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Internal server error");

        // Restore
        mock.module("@/../../src/db/client", () => ({
            getDbClient: () => ({})
        }));
        mock.module("@/../../src/core/orchestrator", () => ({
            handleHeartbeat: async (sessionId: string) => {
                handleHeartbeatCalledWith = sessionId;
            }
        }));
    });
});
