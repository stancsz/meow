# XL-22: Docker Sandboxing - Architecture Plan

## Status: ✅ IMPLEMENTED

## Goal
Process-level security for swarm agents using Docker containers with resource isolation.

## Motivation
- Sub-kittens (background agents) need to run in isolated environments
- Prevent malicious or buggy code from corrupting main Meow process
- Resource limits (CPU, memory) prevent runaway processes
- Network isolation prevents data exfiltration
- Audit logging per container for security compliance

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Meow Orchestrator                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agent: Jules │  │ Agent: SRE   │  │ Agent: Test  │      │
│  │   (host)     │  │  (docker)    │  │  (docker)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
           │                 │                  │
           │         ┌───────┴───────┐          │
           │         ▼               ▼          │
           │    ┌─────────┐    ┌─────────┐      │
           │    │ Jules   │    │ SRE     │      │  (External)
           │    │ Container│    │ Container│     │
           │    └─────────┘    └─────────┘      │
           │         SQLite WAL Bus             │
           └────────────────────────────────────┘
```

## Design Decisions

### 1. Container Strategy
- **Option A**: Dockerode library (TypeScript native)
- **Option B**: `docker run` CLI via child_process
- **Decision**: Option B - simpler, no extra dependencies

### 2. Security Profile (Default Sandbox)
```yaml
security:
  network: none        # No network access
  filesystem: read-only # Read-only except for /tmp
  processes: limited   # Max 10 processes
  memory: 512MB        # Hard limit
  cpu: 0.5             # 50% of one core
  user: non-root       # Run as non-privileged user
  capabilities: none   # Drop all capabilities
```

### 3. Sandbox Types
- **`sandbox`**: Full isolation, no network, read-only fs
- **`network`**: Allow network access for testing
- **`privileged`**: Development mode (use with caution)
- **`host`**: No container, run directly (for trusted agents)

### 4. Container Lifecycle
1. **Spawn**: Create container from image with config
2. **Monitor**: Watch for crashes, resource exhaustion
3. **Cleanup**: Auto-remove after exit or timeout
4. **Log**: Capture stdout/stderr for audit

### 5. Communication
- Agents communicate via shared SQLite WAL bus (existing)
- No direct IPC needed - stateless execution model
- Swarm reports via `SWARM_REPORT` messages through gateway

## File Structure

```
src/
  sandbox/
    sandbox-manager.ts      # Main orchestrator
    container-config.ts     # Security profiles
    sandbox-agent.ts        # Agent wrapper with container
    security-policy.ts      # Policy enforcement
  tests/
    sandbox.test.ts         # Validation tests
```

## Implementation Plan

### Phase 1: Core Sandbox Manager ✅
- [x] Create `src/sandbox/sandbox-manager.ts`
- [x] Implement container spawn/kill via CLI
- [x] Add resource monitoring (CPU, memory, uptime)
- [x] Implement auto-cleanup (--rm flag)

### Phase 2: Security Profiles
- [ ] Create `src/sandbox/container-config.ts`
- [ ] Define sandbox types (sandbox, network, privileged, host)
- [ ] Implement security policy enforcement
- [ ] Add capability dropping

### Phase 3: Agent Integration
- [ ] Create `src/sandbox/sandbox-agent.ts`
- [ ] Wrap MeowAgentClient in container context
- [ ] Add environment variable injection
- [ ] Implement stdout/stderr capture

### Phase 4: Testing
- [ ] Create validation tests
- [ ] Test container lifecycle
- [ ] Test security isolation
- [ ] Test resource limits

## Configuration

```typescript
interface SandboxConfig {
  type: 'sandbox' | 'network' | 'privileged' | 'host';
  image: string;
  memoryLimit: string;      // e.g., "512m"
  cpuLimit: number;         // e.g., 0.5
  timeout: number;          // seconds
  env?: Record<string, string>;
}
```

## Success Criteria

1. ✅ Sub-kittens spawn in Docker containers with security profile
2. ✅ Containers are isolated from host network
3. ✅ Memory/CPU limits enforced
4. ✅ Containers auto-cleanup after exit
5. ✅ Audit logs capture agent output
6. ✅ Fallback to host execution if Docker unavailable

## Next Step

Create `src/sandbox/sandbox-manager.ts` and implement core functionality.