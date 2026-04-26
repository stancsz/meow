# XL-15 MeowGateway Integration - Architecture
## Task: Integrate MeowGateway with MeowAgentClient

### Problem
MeowGateway WebSocket server exists (`src/gateway/meow-gateway.ts`) but uses a stub:
```typescript
// TODO: Integrate with MeowAgentClient
const response = await simulateAgentResponse(prompt.text);
```

### Solution
Replace stub with real `MeowAgentClient` integration, enabling WebSocket clients to trigger Meow agent prompts.

### Architecture

```
WebSocket Client
       │
       ▼
MeowGateway WebSocket Server
       │
       ▼  routePrompt(PromptPayload)
MeowAgentClient.promptJson(prompt)  ← NEW integration
       │
       ▼
[RESULT] → broadcast RESULT to client
```

### Changes Required

**File: `src/gateway/meow-gateway.ts`**
1. Import `MeowAgentClient`
2. Replace `simulateAgentResponse` with real `MeowAgentClient.promptJson()`
3. Handle `AgentResult` → `ResultPayload` mapping
4. Handle streaming via `promptStreaming` if `options.streaming === true`

### Validation Test

```typescript
// validation.test.ts
import { test, expect } from "bun:test";
import { simulate } from "bun:test";
import { WebSocket } from "ws";

// Start gateway in test mode
test("MeowGateway routes PROMPT to MeowAgentClient", async () => {
  const gateway = Bun.spawn(["bun", "run", "src/gateway/meow-gateway.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  await new Promise(r => setTimeout(r, 2000)); // Wait for startup
  
  // Connect WebSocket client
  const ws = new WebSocket(`ws://localhost:8080?token=dev-token-change-me`);
  
  await new Promise((res) => ws.onopen = res);
  
  // Authenticate
  ws.send(JSON.stringify({ 
    type: "AUTH_REQUEST", 
    id: "auth-1", 
    timestamp: Date.now(), 
    payload: { token: "dev-token-change-me" } 
  }));
  
  // Wait for AUTH_RESPONSE
  const authResult = await new Promise(res => ws.once("message", (data) => {
    const msg = JSON.parse(data.toString());
    expect(msg.type).toBe("AUTH_RESPONSE");
    expect(msg.payload.success).toBe(true);
    res(msg);
  }));
  
  // Send PROMPT
  ws.send(JSON.stringify({
    type: "PROMPT",
    id: "p-1",
    timestamp: Date.now(),
    payload: { text: "hello from gateway test" }
  }));
  
  // Wait for RESULT or STATUS
  const result = await new Promise(res => ws.once("message", (data) => {
    const msg = JSON.parse(data.toString());
    res(msg);
  }));
  
  expect(["RESULT", "STATUS"]).toContain(result.type);
  
  ws.close();
  gateway.kill();
  
  gateway.exited.then(() => {
    console.log("[validation] Gateway test PASSED");
  });
});
```

### Success Criteria
- Gateway receives PROMPT → sends to MeowAgentClient → returns RESULT to client
- WebSocket dashboard shows agent responses
- Gateway runs standalone (no Discord dependency)