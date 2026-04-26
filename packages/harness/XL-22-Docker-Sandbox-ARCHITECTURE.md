# XL-22 Docker Sandboxing - Architecture

## Context
Process-level security for swarm agents. Sub-kittens (spawned via `pounce`) need sandboxed execution environments.

## Core Design

### Agent Sandbox Interface
```typescript
interface SandboxConfig {
  maxMemoryMB: number;
  maxCpuPercent: number;
  timeoutMs: number;
  allowedPaths: string[];
  networkIsolation: boolean;
}

interface SandboxAgent {
  id: string;
  spawn(config: SandboxConfig): Promise<PID>;
  execute(script: string): Promise<ExecutionResult>;
  terminate(): Promise<void>;
}
```

### Implementation Options
1. **Docker Container Per Agent** - Full isolation, heavyweight
2. **Child Process with ulimit** - Lightweight, Linux-specific  
3. **VMSandbox viaisolette** - Cross-platform, complex
4. **Bun Worker Threads + resource limits** - Bun-native, moderate isolation

### Recommended: Hybrid Approach
- **Primary**: Bun Worker Threads with resource limits
- **Fallback**: Child process with systemd slice limits
- **Future**: Docker containers for untrusted code

## Integration Points
- Wire into `relay.ts` DoneHooks for audit logging
- Use existing `reasoning-audit` pattern for sandbox decisions
- Environment variable `SWARM_SANDBOX_MODE` for config

## TODO
- [ ] Implement `SandboxAgent` class
- [ ] Add resource limit configuration
- [ ] Wire into DoneHooks for audit trail
- [ ] Test with actual sub-kitten spawning