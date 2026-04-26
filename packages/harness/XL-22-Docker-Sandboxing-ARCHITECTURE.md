# XL-22 Docker Sandboxing - Architecture

## Problem Statement
Swarm agents (sub-kittens) currently run in the same process context as the main orchestrator. This creates security and stability risks:
- A misbehaving agent can crash the entire swarm
- No resource isolation between agents
- Potential for privilege escalation if agents spawn child processes

## Solution: Process-Level Security via Docker

### Core Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HOST (Meow Main)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Orchestrator│  │   Agent 1   │  │   Agent 2   │     │
│  │             │──│ (container) │  │ (container) │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │              │
│         │     ┌──────────┴──────────┐     │              │
│         └─────│    IPC Socket Bus    │─────┘              │
│               │  (Unix Domain Sock) │                     │
│               └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Components

#### 1. DockerSandboxManager
- Spawns agents in isolated Docker containers
- Manages lifecycle (create, monitor, destroy)
- Enforces resource limits per agent
- Routes IPC via Unix domain sockets

#### 2. AgentContainerProfile
- Pre-defined container configs for agent types
- Defines CPU limits, memory limits, network policies
- Mounts shared SQLite volume for bus access

#### 3. ContainerHealthMonitor
- Watches container health status
- Auto-restarts crashed containers
- Reports agent status to orchestrator

### Implementation Plan

#### Phase 1: Basic Containerization
1. Create `DockerSandboxManager` class
2. Agent spawning via `docker run` with `--rm`
3. Shared volume mount for SQLite bus
4. Unix socket IPC within shared network namespace

#### Phase 2: Resource Limits
1. CPU quota enforcement per agent
2. Memory limits (--memory)
3. PID limits (--pids-limit)
4. Read-only root filesystem

#### Phase 3: Security Hardening
1. Drop capabilities (--cap-drop=ALL)
2. No new privileges (--security-opt=no-new-privileges)
3. Seccomp profile (--seccomp=unconfined for dev)
4. AppArmor profile (future)

### Database Schema Extension

```sql
CREATE TABLE agent_containers (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  container_id TEXT,
  status TEXT CHECK(status IN ('pending','running','stopped','failed')),
  resource_limits TEXT, -- JSON: {cpu: '0.5', memory: '256m'}
  created_at INTEGER,
  exited_at INTEGER,
  exit_code INTEGER
);
```

### API Surface

```typescript
interface DockerSandboxManager {
  spawn(agentName: string, config: ContainerConfig): Promise<string>; // returns container_id
  kill(containerId: string): Promise<void>;
  status(containerId: string): Promise<ContainerStatus>;
  list(): Promise<ContainerStatus[]>;
  enforceLimits(containerId: string, limits: ResourceLimits): Promise<void>;
}
```

### Validation Criteria

1. ✅ Agent can spawn inside Docker container
2. ✅ Agent can connect to SQLite bus (shared volume)
3. ✅ Agent can communicate via IPC socket
4. ✅ Resource limits are enforced
5. ✅ Container crash doesn't crash host
6. ✅ Orchestrator can monitor container health

### Success Metrics

| Metric | Target |
|--------|--------|
| Agent spawn time | < 2 seconds |
| Memory isolation | 256MB hard limit per agent |
| CPU isolation | 0.5 cores per agent |
| Crash recovery | Auto-restart within 5 seconds |
| IPC latency | < 50ms roundtrip |

---

## Files to Create

1. `src/core/docker-sandbox-manager.ts` - Main sandbox class
2. `src/core/agent-container-profile.ts` - Container configs
3. `src/core/container-health-monitor.ts` - Health watcher
4. `src/migrations/XL-22-add-agent-containers.sql` - DB schema
5. `src/tests/docker-sandbox.test.ts` - Validation tests
6. `Dockerfile.agent` - Minimal agent container image

---

## Dependencies

- `dockerode` - Docker API client for Node.js
- `@aspect/build.docker` - Alternative lightweight Docker client

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Docker not available | Fall back to fork() isolation |
| Container overhead | Lazy spawn (on-demand) |
| Socket path conflicts | Use unique socket names per agent |
| Volume permission issues | Pre-create volumes with correct permissions |