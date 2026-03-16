# Beautiful Swarms - Worker Template

This directory contains the foundational Worker Template for the Beautiful Swarms architecture (see `SWARM_SPEC.md` §8).

Workers are the ephemeral "muscle" of the platform. They are deployed as standalone Cloud Functions (GCF) or AWS Lambdas that execute tasks delegated by the Orchestrator.

## Worker Lifecycle

1. **Invocation**: The Worker is invoked via HTTP by the Orchestrator with a JSON payload containing task details (`sessionId`, `taskId`, `skillRef`, `credentialId`).
2. **JIT Skill Loading**: The Worker loads the requested skill instructions (`SkillManifest`) just-in-time from the user's Supabase or GitHub.
3. **KMS Credential Fetching**: The Worker calls the platform's KMS encryption service to fetch a decrypted credential for the execution. This credential only exists in volatile RAM.
4. **Idempotency Check**: Before executing a write task, the Worker ensures the task hasn't already been completed to prevent double-execution (especially important for Continuous Mode).
5. **Execution**: The task is executed using the JIT skill and the decrypted credential.
6. **Result Logging**: The Worker writes its success/failure state back to the user's Sovereign Motherboard (Supabase `task_results` table).
7. **Termination**: The function terminates. All decrypted secrets are purged from RAM. No state is persisted in the Worker itself.

## Development

- **`types.ts`**: Contains the shared TypeScript interfaces for payloads, responses, and manifests.
- **`template.ts`**: The core execution shell for a worker. Future Workers will extend or mimic this structure.

### Local Testing

You can use the Firebase Emulator Suite or `@google-cloud/functions-framework` to run this template locally:

```bash
# Example test payload
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_123",
    "taskId": "task_abc",
    "skillRef": "shopify-read-orders",
    "credentialId": "cred_xyz",
    "parameters": {}
  }'
```
