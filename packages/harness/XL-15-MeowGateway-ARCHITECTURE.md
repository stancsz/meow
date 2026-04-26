# XL-15: MeowGateway Architecture

## Status: PLANNING PHASE

## Goal
Standalone WebSocket server to replace Discord-coupled relay, achieving **Platform Sovereignty**.

## Motivation
- Current `relay.ts` is tightly coupled to Discord
- Meow should be accessible via any WebSocket client (browser, mobile, CLI)
- Gateway enables local-first architecture without Discord dependency

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  MeowGateway    │◄───────────────────►│  Sub-Kittens    │
│  (WebSocket     │                     │  (Background    │
│   Server)       │                     │   Agents)       │
└────────┬────────┘                     └────────┬────────┘
         │                                       │
         │ SQLite WAL                            │ SWARM_REPORT
         ▼                                       ▼
┌─────────────────┐                     ┌─────────────────┐
│  Shared Memory  │◄───────────────────►│  Orchestrator   │
│  Bus            │                     │  (bun-orchestrator)
└─────────────────┘                     └─────────────────┘
```

## Design Decisions

### 1. WebSocket Library
- **Primary**: `ws` library (widely supported)
- **Alternative**: Bun native `Bun.serve` with WebSocket upgrade
- **Decision**: Bun native (no external dependencies)

### 2. Message Protocol
```typescript
interface GatewayMessage {
  type: "PROMPT" | "RESULT" | "STATUS" | "HEARTBEAT" | "SWARM_REPORT";
  id: string;
  timestamp: number;
  payload: unknown;
  source?: string;
}
```

### 3. Client Authentication
- Simple token-based auth via `X-Gateway-Token` header
- Token stored in environment: `GATEWAY_TOKEN`

### 4. Backward Compatibility
- Keep `relay.ts` as optional Discord bridge
- Gateway operates independently
- Both can run simultaneously (different ports)

## Implementation Plan

### Phase 1: Core Gateway
- [ ] Create `src/gateway/meow-gateway.ts`
- [ ] Implement WebSocket server with Bun.serve
- [ ] Add message routing logic
- [ ] Implement heartbeat/keepalive

### Phase 2: Protocol Handler
- [ ] Implement prompt handling
- [ ] Implement streaming responses
- [ ] Add sub-kitten spawning support

### Phase 3: Dashboard
- [ ] Create simple web dashboard (`public/dashboard.html`)
- [ ] Real-time status display
- [ ] Prompt submission interface

### Phase 4: Integration
- [ ] Update relay.ts to optionally use gateway
- [ ] Add gateway health check to orchestrator
- [ ] Docker compose update for standalone mode

## File Structure
```
src/
  gateway/
    meow-gateway.ts      # Main WebSocket server
    protocol.ts          # Message type definitions
    client-manager.ts    # Client connection tracking
    dashboard/
      index.html         # Web dashboard
      styles.css         # Dashboard styles
      app.js             # Dashboard frontend logic
```

## Success Criteria
1. Gateway accepts WebSocket connections
2. Clients can send prompts and receive responses
3. Sub-kittens report status via gateway
4. Dashboard displays real-time system status
5. Can run standalone without Discord

## Next Step
Create `src/gateway/meow-gateway.ts` and `src/gateway/protocol.ts`
