# STATUS

> **Read this first, every session.** Everything an agent needs to orient and pick work.
> Last updated: 2026-05-23

---

## Current Phase

**Wave 4 — Operational Hardening.** All prior waves and the 5-phase AI-native self-improvement plan are complete. The loop now fixes bugs that are actively breaking the running system.

---

## Open Bugs — Pick from Here

Fix highest severity first. Mark done in `ROADMAP.md` and append to `loop-decisions.md`.

### Critical (fix now)

**BUG-01 — `vec_memory` integer primary key crash**
- Symptom: `Memory store failed: SqliteError: Only integers are allowed for primary key values on vec_memory` — fires 7–10× per session
- Impact: memory subsystem broken; MonitoringAgent, cross-session recall, KnowledgeSynthesizer all non-functional
- File: `src/agent/memory.ts` (or wherever `vec_memory` rows are inserted)
- Fix: pass an integer PK — use `INTEGER PRIMARY KEY AUTOINCREMENT`, store UUID as a separate column

**BUG-02 — `fixMeow()` ETIMEDOUT on Windows**
- Symptom: `claude -p spawnSync ETIMEDOUT` on every MEOW-3-RULE failure — self-repair loop dead
- File: `src/agent/agent.ts` → `fixMeow()`
- Fix: replace `spawnSync("cmd.exe", ...)` with `spawn("node", [claudeBin, "-p", ...], { shell: false, stdio: ["pipe","pipe","pipe"] })` and close stdin immediately

### Medium (fix after criticals)

**BUG-03 — `DelegationProtocol` routes to unregistered workers**
- `browseros` and `qa` delegate types silently fall back to `claude`
- File: `src/orchestrator/DelegationProtocol.ts`
- Fix: register workers or remove dead routes

**BUG-04 — `FedClient` infinite reconnect loop**
- On permanent network failure, `triggerReconnection()` retries forever
- File: `src/swarm/federation/FedHub.ts:238`
- Fix: add `maxReconnectAttempts` counter; emit `permanently_disconnected` after N

**BUG-05 — `FileCoordinator` not enforced in `Orchestrator`**
- `requestAccess()` returns `allowed: false` but Orchestrator dispatches anyway
- Files: `src/orchestrator/FileCoordinator.ts`, `src/orchestrator/Orchestrator.ts`
- Fix: check `allowed` before dispatch; requeue with backoff if false

**BUG-06 — PID mismatch on respawn**
- `respawnAgent()` spawns new PID but caller keeps old reference; watchdog loses the agent
- File: `src/kernel/kernel.ts`
- Fix: `respawnAgent()` returns new PID; all callers update the mission registry

### Low

**BUG-07 — Architect fallback validation always passes**
- No test file found → contract runs `node -e "console.log('passed')"` → exits 0 always
- File: `src/architect/Architect.ts:125`
- Fix: real sanity check, or fail explicitly when no test file exists

---

## Unimplemented Planned Work

**TUI rewrite** — `docs/rfc/tui-spec.md` describes a task-tree + streaming output redesign not yet built. Pick this after all criticals are resolved.

---

## Completed

| What | Where |
|------|-------|
| Waves 1–3 (infra, hardening, ecosystem) | `ROADMAP.md` |
| 5-phase AI-native self-improvement plan | `docs/rfc/ai-native-meow-plan.md` |
| Quantum branding removed | committed |
| Architectural gaps 1–6 (modes, validation, SQLite coord, delegation) | `docs/rfc/architectural-decisions.md` |

---

## Reference Docs (read only when needed)

Don't read these proactively. Look them up when the task requires it.

| Need | File |
|------|------|
| Detailed error root causes + fix options | `docs/rfc/errors.md` |
| TUI redesign spec | `docs/rfc/tui-spec.md` |
| Architectural ADRs and gap history | `docs/rfc/architectural-decisions.md` |
| Claim verification (proven vs aspirational) | `docs/rfc/evidence-report.md` |
| Peer comparison | `docs/rfc/competitive-analysis.md` |
| Strategic north star (YC talk) | `docs/rfc/ai-native-company-strategy.md` |
| Self-improvement plan (all phases done) | `docs/rfc/ai-native-meow-plan.md` |
| Token efficiency implementation | `docs/rfc/token-optimization.md` |
| npm publishing guide | `docs/rfc/publish-guide.md` |
| Agentic SDLC gap analysis (vs mid-2026 state of the art) | `docs/rfc/agentic-sdlc-gap-analysis.md` |

---

## Windows Environment Notes

- Node.js required (Bun not supported)
- Extension discovery fails on Windows (non-fatal, caught and swallowed)
- `claude -p` via `spawnSync` hangs — use `spawn` with `shell: false` (see BUG-02)
- Husky pre-push hook may fail even when individual commands succeed (MSYS2 exit code issue)
