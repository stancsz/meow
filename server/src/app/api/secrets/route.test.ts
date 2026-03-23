import { expect, test, describe } from "bun:test";
import { GET, POST, DELETE } from "./route";
import { NextRequest } from "next/server";

describe("Secrets API (Deprecated - Redirects)", () => {
    test("GET /api/secrets redirects to /api/keys", async () => {
        const req = new NextRequest("http://localhost:3000/api/secrets");
        const res = await GET(req);
        
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost:3000/api/keys");
    });

    test("POST /api/secrets redirects to /api/keys with 307 status", async () => {
        const req = new NextRequest("http://localhost:3000/api/secrets", {
            method: "POST",
            body: JSON.stringify({})
        });
        const res = await POST(req);
        
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost:3000/api/keys");
    });

    test("DELETE /api/secrets redirects to /api/keys with 307 status", async () => {
        const req = new NextRequest("http://localhost:3000/api/secrets?id=123", {
            method: "DELETE"
        });
        const res = await DELETE(req);
        
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost:3000/api/keys");
    });
});
