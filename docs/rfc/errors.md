# meow-swarm Error Reference

> Documents every known error, warning, and failure mode in meow-swarm with root cause analysis and fix status.

---

## Critical Runtime Errors (fix these first)

### `Memory store failed: SqliteError: Only integers are allowed for primary key values on vec_memory`

**Severity:** Critical — fires 7–10× per session. Every memory write silently fails. Cross-session recall, MonitoringAgent clustering, and KnowledgeSynthesizer all depend on this table. Nothing learns until it's fixed.

**Root cause:** `sqlite-vec` requires integer rowids for vector tables. The insert is passing a non-integer primary key (likely a UUID string or derived text key).

**Affected files:** Wherever `vec_memory` rows are inserted — likely `src/agent/memory.ts` or `src/kernel/database.ts`.

**Fix:** Use an auto-increment integer PK. If the caller needs a UUID, store it as a separate column but let the PK be `INTEGER PRIMARY KEY AUTOINCREMENT`.

**Workaround:** None — the error is caught and swallowed, so meow continues, but memory is non-functional.

**Tracking:** Visible in `.meow/logs/meow-2026-05-21.log` through `meow-2026-05-23.log` on every session.

---

## Startup Errors

### `Cannot find module 'C:\Users\stanc\github\meow\src\extensions\Extension'`

**Severity:** Warning (non-fatal) — meow continues to work without extensions

**Root cause:** `ExtensionManager.discover()` uses `globby("src/extensions/*/index.ts")`. On Windows, the absolute `file://` URL constructed from the matched path has a colon in `C:` that makes it invalid per the WHATWG URL spec. Node.js `import()` fails with `ERR_MODULE_NOT_FOUND`.

**Affected paths:**
- `src/extensions/audio/index.ts` — `import { Extension } from '../Extension'` resolves to `C:\Users\stanc\github\meow\src\extensions\Extension` (no `.ts` extension in the URL, but the path itself is invalid as a file URL on Windows)
- `src/extensions/database/extension.ts` — same issue

**Why non-fatal:** The error is caught in `ExtensionManager.discover()` line 52-55 with `try/catch`, logged to console, and swallowed. Extension discovery fails silently and the agent continues without any extensions.

**Fix options:**
1. Use a relative import in the extension files instead of an absolute path URL
2. Convert extension discovery to use `import.meta.resolve` instead of `pathToFileURL`
3. Use `node --experimental-network-imports` (doesn't apply to file:// URLs)
4. Add `.js` extension to the import path in extension files so they work as both ESM and in the bundler

**Tracking:** Affects all extensions (`audio`, `database`) in Node.js mode on Windows.

---

### `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`

**Severity:** Warning (cosmetic) — appears at shutdown, does not affect functionality

**Root cause:** Node.js/Bun process teardown race condition. When meow calls `process.exit(0)`, the blessed TUI or WebSocket heartbeat may still be closing handles. This is a known Node.js issue on Windows where `uv_close()` is called twice on the same handle. Unrelated to meow code — it's in Node's own `async.c`.

**Fix status:** None needed. The process exits cleanly (exit code 0). The assertion is a debug trap in Node's internal handle management and fires when `handle->flags & UV_HANDLE_CLOSING` is already set when a second close is attempted. Cosmetic only.

**Tracking:** Affects all platforms running meow with `--tui` or WebSocket federation enabled.

---

### `Accessing non-existent property 'INVALID_ALT_NUMBER' of module exports inside circular dependency`

**Severity:** Warning — Node.js 25 module resolution edge case

**Root cause:** Circular dependency in `@modelcontextprotocol/sdk` where a require cache lookup finds an already-destructured module. Happens when `cross-spawn` loads before the circular dependency is fully initialized. The actual `INVALID_ALT_NUMBER` export is never accessed in meow's code path — this is the SDK's internal issue.

**Fix status:** Non-blocking warning. Filed as upstream issue against `@modelcontextprotocol/sdk`.

**Tracking:** Node.js 25 only. Does not occur on Node.js 18/20/22.

---

## Operational Errors

### `claude -p spawnSync ETIMEDOUT`

**Severity:** Critical — prevents `fixMeow()` self-repair from working

**Root cause:** When `fixMeow()` calls `claude -p` via `spawnSync()`, the Windows `cmd.exe` spawn times out. This happens because the shell wrapper for `claude` (likely an npm shim) doesn't properly forward signals or the TTY detection causes it to wait for input.

**Frequency:** Every time `fixMeow()` is triggered (MEOW-3-RULE failure path)

**Impact:** The MEOW-3-RULE self-repair loop is broken — meow can detect failures but cannot patch its own code. Tasks must be re-run manually after a failure.

**Fix options:**
1. Run `claude` as a direct subprocess without shell expansion: `spawn("node", ["path/to/claude"], { shell: false })`
2. Add a timeout longer than 30s for the `claude -p` subprocess
3. Use `execFile` instead of `spawnSync` to avoid shell wrapping

---

### `401 - Invalid API key` (biosphere gateway)

**Severity:** Operational — meow cannot make LLM calls

**Root cause:** The `LLM_API_KEY` in the shell environment uses an expired or invalid key. The gateway at `https://biosphere-gateway-242248356997.us-central1.run.app/anthropic/v1/messages` rejects requests with the old `sk-cp-...` prefix key.

**Fix:** Use the correct key (`sk-ant-api03-...`) in `~/.bashrc`:
```bash
export LLM_API_KEY="sk-ant-api03-y7XcGi4-O5TQQIxzDR9OEWSQaIf9Lx5NPlSBsTPEj4BdjSljxUJCfSsdHQi4UvYy7KOizFUKv3GLmkyZ9-wVhFj4LZOsfP4"
```

---

## LINT-FIX Loop Errors

### `LINT-FIX LOOP` max recovery attempts reached

**Severity:** Operational — meow hits the lint-fix loop repeatedly and flags for human review

**Root cause:** When meow runs `bun run typecheck && bun run lint` after applying edits, if there are any lint errors or warnings that are not auto-fixable, the LINT-FIX LOOP tries to fix them. After 3 failed attempts, it maxes out and either retries the full task or flags for human review. The underlying issue is often:
1. A change that introduces a new lint error not caught by `--fix`
2. A type error that requires manual intervention
3. A lint error that is in a different file than the one being edited

**Fix options:**
- Fix the specific lint error manually before running a task
- Ensure code being modified follows existing conventions
- Run `bun run check` locally before dispatching

---

## Architectural Gaps (Documented Bugs)

### `DelegationProtocol` routes to unregistered workers

**File:** `src/orchestrator/DelegationProtocol.ts`

**Issue:** Routes `browseros` and `qa` delegate types are defined but no actual workers are registered for them. Tasks that would route to `browseros` or `qa` silently fall back to `claude`.

**Impact:** Medium — delegation routing is effectively a no-op for UI/docs tasks

**Fix:** Either register workers for these types, or remove the routing logic and always use `claude` until workers exist

---

### `FedClient.triggerReconnection()` has no max attempts cap

**File:** `src/swarm/federation/FedHub.ts:238-262`

**Issue:** On permanent network failure, `triggerReconnection()` recurses indefinitely with exponential backoff capped at 5000ms. It will never give up.

**Impact:** Medium — a permanently disconnected FedClient will keep attempting reconnection forever

**Fix:** Add a `maxReconnectAttempts` counter and stop after N attempts

---

### `Architect.ts` fallback validation always passes

**File:** `src/architect/Architect.ts:125`

**Issue:** When no test file is discovered, the fallback validation contract runs `node -e "console.log('passed')"` — which always exits 0, making it a no-op gate.

**Impact:** Low — only affects tasks with no test file; real quality gates still run on tasks with tests

**Fix:** Make the fallback actually validate something, or at minimum run the task output through a basic sanity check

---

### `FileCoordinator` blocks conflicts but orchestrator doesn't enforce

**File:** `src/orchestrator/FileCoordinator.ts` + `src/orchestrator/Orchestrator.ts`

**Issue:** `FileCoordinator.requestAccess()` returns `allowed: false` when a conflict is detected, but the orchestrator doesn't check this result before dispatching the task. Task B proceeds despite being blocked.

**Impact:** File lock coordinator is advisory only — two tasks writing the same file can run concurrently

**Fix:** Have the orchestrator check `FileCoordinator.requestAccess()` before dispatching and skip/block the task if `allowed === false`

---

### PID mismatch on respawn

**File:** `src/kernel/kernel.ts`

**Issue:** When `respawnAgent()` spawns a new process with a new PID, the caller retains the old PID reference and cannot track the new process.

**Impact:** Medium — watchdog cannot reliably monitor the respawned agent

**Fix:** Have `respawnAgent()` return the new PID and update the mission registry

---

## Pre-push Hook Failures

### `git push` fails with Husky pre-push hook exit 1

**Issue:** `bun run typecheck && bun run lint` runs as the pre-push hook but exits 1 despite individual commands exiting 0.

**Likely cause (Windows):** The Husky wrapper script (`_/husky.sh`) uses `#!/bin/sh` but on Windows Git's bundled MSYS2 shell may not be correctly forwarding exit codes. Or `npm run check` (which runs both commands) exits non-zero due to ESLint warnings being counted as errors.

**Fix options:**
1. Change pre-push hook to run `bun run typecheck && bun run lint` separately with explicit `|| exit 1`
2. Check if `.husky/pre-push` has `--max-warnings 0` in ESLint config
3. Temporarily disable Husky: `git push --no-verify`

---

## Status Summary

| Error | Severity | Status |
|---|---|---|
| `vec_memory` integer PK crash (BUG-01) | **Critical** | **Needs fix — top priority** |
| `claude -p` spawnSync ETIMEDOUT (BUG-02) | **Critical** | **Needs fix** |
| DelegationProtocol unregistered workers (BUG-03) | Medium | **Resolved** |
| FedClient reconnect infinite loop (BUG-04) | Medium | **Resolved** |
| FileCoordinator orchestrator non-enforcement (BUG-05) | Medium | **Needs fix** |
| PID mismatch on respawn (BUG-06) | Medium | **Needs fix** |
| Architect fallback validation no-op (BUG-07) | Low | **Needs fix** |
| Extension discovery fails on Windows | Warning | Not fixed (non-fatal) |
| UV_HANDLE_CLOSING assertion | Cosmetic | None needed |
| INVALID_ALT_NUMBER circular dep | Warning | Non-blocking |
| 401 Invalid API key | Operational | Config fix only |
| LINT-FIX LOOP exhaustion | Operational | Known gap |
| Husky pre-push hook failure | Operational | **Needs fix** |