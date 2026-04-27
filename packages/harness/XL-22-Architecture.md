# XL-22 Docker Sandboxing - Architecture

## Context
Process-level security for swarm agents. Meow's sub-kittens need isolation to prevent resource runaway and ensure safe multi-agent orchestration.

## Goal
Create a Docker sandboxing system that:
1. Spawns sub-agents in isolated containers
2. Limits CPU/memory per agent
3. Enforces network restrictions
4. Provides audit logging of container activity

## Implementation

### Core Components

#### 1. SandboxManager (`src/sandbox/sandbox-manager.ts`)
```typescript
interface SandboxConfig {
  image: string;           // Docker image to use
  cpuLimit: number;        // CPU cores (0.5 = 50%)
  memoryLimit: string;     // e.g., "256m"
  timeout: number;         // Max execution time in ms
  networkMode: "none" | "bridge" | "host";
}

interface SandboxResult {
  sandboxId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  killed: boolean;         // true if timeout exceeded
}
```

#### 2. AgentSandbox wrapper (`src/sandbox/agent-sandbox.ts`)
- Wraps existing sub-kitten spawning
- Enforces sandbox config per agent
- Handles timeout/kill scenarios

#### 3. Sandbox audit table
```sql
CREATE TABLE sandbox_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sandbox_id TEXT NOT NULL,
  agent_name TEXT,
  config JSON,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  exit_code INTEGER,
  killed BOOLEAN DEFAULT 0,
  duration_ms INTEGER
);
```

## Validation Test
- Unit tests for sandbox creation/kill
- Mock Docker commands to verify config passed correctly
- Verify audit table writes on sandbox completion

## Docker Requirements
```bash
# Required: Docker daemon running
docker --version

# Base image for agents (can be customized)
docker pull oven/bun:1
```

## Out of Scope
- Kubernetes integration (future phase)
- Multi-node orchestration
- GPU passthrough