# MEOW End-to-End (E2E) Testing Guide

To maintain a "Super High" production standard, MEOW must be validated against real-world complex missions. This document describes the E2E test suite and the environment required to run it.

## 1. Test Environment Setup
E2E tests require a "sandbox" repository where the agent can safely make commits and run commands.

1. **Clean Workspace**: Use `scratch/e2e-test-env/`.
2. **Specialist Availability**: Ensure `claude` (Claude Code) and `aider` are in the PATH.
3. **LLM Access**: Set valid `ANTHROPIC_API_KEY`.
4. **Clean DB**: Start with a fresh `test-e2e.db`.

---

## 2. The "Golden Mission" Test Case
This is the primary E2E test that validates the entire orchestration loop.

### Goal:
"Create a simple Express server with one GET /hello route that returns { 'msg': 'world' }. Implement it in TypeScript, add a unit test, and verify it passes."

### Success Criteria:
1. **Decomposition**: Orchestrator breaks the goal into:
   - Setup project/tsconfig.
   - Install express.
   - Write server code.
   - Write test code.
   - Run tests.
2. **Delegation**: Specialists are summoned correctly.
3. **Verification**: `MissionReviewer` confirms:
   - No placeholders in server code.
   - `tsc` passes.
   - `npm test` passes.
4. **Completion**: All tasks marked `completed` in `test-e2e.db`.

---

## 3. The "Adversarial" Test Cases
These tests verify that the orchestrator is not easily fooled.

### Test A: The Lazy Specialist
- **Setup**: Manually mock a specialist response that says "Task complete" but only adds a `// TODO: implement` comment.
- **Expectation**: `MissionReviewer` detects the `TODO` and fails the mission, triggering a retry.

### Test B: Scope Bleed
- **Setup**: Specialist tries to delete a file outside the `scratch/` directory.
- **Expectation**: The `run` or `write` tool should block the operation, or `MissionReviewer` should flag the scope violation.

### Test C: Frozen Heartbeat
- **Setup**: Start a mission and manually kill the specialist subprocess.
- **Expectation**: `MeowKernel` watchdog detects the lack of pulse within the threshold and respawns the mission.

### Test D: Context Synthesis Quality
- **Setup**: Provide a goal that requires knowledge from a specific file (e.g., `package.json`) and has failed once before.
- **Expectation**: Verify that the generated specialist command correctly includes:
  - The path to `package.json`.
  - The `lastError` log from the previous failure.
  - The `Monolith Blueprint` and `npx skills find` instructions.

---

## 4. Performance Benchmarks
- **Memory Recall Latency**: Grover search over 1000 candidates must complete in <2s.
- **Kernel Batching**: 1000 simultaneous state updates must be drained to SQLite in <500ms.
- **Mission Completion Time**: A standard "Golden Mission" should complete in <3 minutes.

---

## 5. Continuous Integration (CI)
E2E tests should run on every release candidate.

```bash
# Example E2E run command
npx tsx src/index.ts --test-e2e --goal "Implement a math library"
```

> **Note**: For production readiness, E2E tests must be run in a Docker container to ensure environment isolation.
