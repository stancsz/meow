import { describe, it, expect, mock, beforeEach } from "bun:test";
import * as ff from "@google-cloud/functions-framework";
import { heartbeatCloudFunctionHandler } from "./heartbeat";

// Mock the DB and core modules to prevent side effects
mock.module("../../db/db/client", () => ({
    getDbClient: () => ({
        db: true,
        isMockDb: true
    })
}));

const processAllHeartbeatsMock = mock(() => Promise.resolve());
const handleHeartbeatMock = mock((sessionId: string, db: any) => Promise.resolve());

mock.module("../core/heartbeat", () => ({
    processAllHeartbeats: (...args: any[]) => processAllHeartbeatsMock(...args),
    handleHeartbeat: (...args: any[]) => handleHeartbeatMock(...args)
}));

describe("heartbeatCloudFunctionHandler", () => {
    beforeEach(() => {
        processAllHeartbeatsMock.mockClear();
        handleHeartbeatMock.mockClear();
    });

    const createMockReqRes = (method: string, query: any = {}, body: any = {}) => {
        const req: any = {
            method,
            query,
            body
        };
        const res: any = {
            status: mock((code: number) => res),
            json: mock((data: any) => res),
            send: mock((data: any) => res),
            set: mock((header: string, value: string) => res)
        };
        return { req, res };
    };

    it("should handle CORS preflight requests", async () => {
        const { req, res } = createMockReqRes("OPTIONS");

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(res.set).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
        expect(res.set).toHaveBeenCalledWith("Access-Control-Allow-Methods", "POST");
        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send).toHaveBeenCalledWith("");
        expect(processAllHeartbeatsMock).not.toHaveBeenCalled();
        expect(handleHeartbeatMock).not.toHaveBeenCalled();
    });

    it("should reject non-POST requests", async () => {
        const { req, res } = createMockReqRes("GET");

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith({ error: "Method Not Allowed. Use POST." });
    });

    it("should process all heartbeats when no session_id is provided", async () => {
        const { req, res } = createMockReqRes("POST");

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(processAllHeartbeatsMock).toHaveBeenCalled();
        expect(handleHeartbeatMock).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: "success", message: "Heartbeat processed successfully" });
    });

    it("should process a specific session heartbeat when session_id is in query", async () => {
        const { req, res } = createMockReqRes("POST", { session_id: "test-session-1" });

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(processAllHeartbeatsMock).not.toHaveBeenCalled();
        expect(handleHeartbeatMock).toHaveBeenCalled();
        expect(handleHeartbeatMock.mock.calls[0][0]).toBe("test-session-1");
        expect(handleHeartbeatMock.mock.calls[0][1].isMockDb).toBe(true);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should process a specific session heartbeat when session_id is in body", async () => {
        const { req, res } = createMockReqRes("POST", {}, { session_id: "test-session-2" });

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(processAllHeartbeatsMock).not.toHaveBeenCalled();
        expect(handleHeartbeatMock).toHaveBeenCalled();
        expect(handleHeartbeatMock.mock.calls[0][0]).toBe("test-session-2");
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should process a specific session heartbeat when sessionId is in body", async () => {
        const { req, res } = createMockReqRes("POST", {}, { sessionId: "test-session-3" });

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(processAllHeartbeatsMock).not.toHaveBeenCalled();
        expect(handleHeartbeatMock).toHaveBeenCalled();
        expect(handleHeartbeatMock.mock.calls[0][0]).toBe("test-session-3");
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle errors thrown from core heartbeat logic", async () => {
        const { req, res } = createMockReqRes("POST");

        processAllHeartbeatsMock.mockImplementation(() => Promise.reject(new Error("Core error")));

        await heartbeatCloudFunctionHandler(req as ff.Request, res as ff.Response);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            status: "error",
            error: "Core error"
        });
    });
});
