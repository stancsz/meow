# SimpleClaw Delegation Protocol

## Overview

The Delegation Protocol in SimpleClaw dictates how ephemeral workers pass work tasks securely and reliably to execution engines (like `opencode`). This ensures the orchestrator remains completely stateless while enforcing rigorous security and reliability semantics around execution.

## Key Principles

1.  **State Isolation:** The worker is fully responsible for establishing context (fetching credentials, preparing skills) but executes no complex logic itself. It purely acts as a delegator.
2.  **Idempotency Preservation:** The `WRITE` actions delegated to the engine must only execute if the result has not already been successfully recorded. Idempotency checks are done before engine execution.
3.  **Secure Credential Passing:** Credentials obtained via the local KMS (or actual Supabase Vault) are passed securely into the execution context. Any audit logs generated must strictly obscure (mask) the actual values, logging only the keys or IDs.

## Data Contracts

### 1. `ExecutionContext` (Input)

This is the payload securely bundled and passed to an execution engine.

```typescript
export interface ExecutionContext {
    credentials: Record<string, string>; // e.g., { "github_token": "ghp_abc123" }
    skillContent: string;                // The JIT Markdown skill content
    sessionId: string;                   // The parent Orchestrator Session ID
    userId?: string;                     // The user performing the execution
}
```

### 2. `TaskResult` (Output)

This is the required output schema from the execution engine, enabling SimpleClaw to understand execution outcomes.

```typescript
export interface TaskResult {
    message: string;        // Human-readable outcome description
    skills_used: string[];  // The skills successfully utilized during execution
    delegated_to: string;   // Identifier for the execution engine (e.g., 'opencode')
    status: string;         // Result ('success', 'error', 'skipped')
    [key: string]: any;     // Free-form output variables (e.g. API responses)
}
```

## Error Handling & Resiliency

The Delegation Protocol defines standard error handling mechanisms:

-   `EngineUnavailableError`: Thrown immediately if the engine cannot be discovered or initialized.
-   `TimeoutError`: Enforced at the worker boundary. If the engine takes longer than the configured timeout (default: 30 seconds), execution is interrupted and marked as failed.
-   `DelegationError`: An overarching error that wraps generic engine runtime failures or crashes, maintaining a standard interface for upstream error aggregation.

## Worker Lifecycle Integrations

The delegation protocol utilizes optional hooks to support complex workloads:

-   **Progress Reporting (`ProgressCallback`):** For long-running engine executions, engines can intermittently trigger the callback to log progression updates to the SimpleClaw audit log.
-   **Resource Cleanup (`CleanupHook`):** Ensures that orphaned processes or temporary resources are strictly torn down once the engine returns or times out.

## Engine Discovery Mechanism

In Phase 2, engines are instantiated within the worker scope natively (e.g., `new OpenCodeExecutionEngine()`).
Future updates target discovering available engines dynamically through configured remote endpoints or RPC.
