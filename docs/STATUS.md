# STATUS

> **Read `docs/HANDOFF.md` first**, then this. Cleanup plan: `docs/MIGRATION.md`.
> Last updated: 2026-06-11

---

## Current Phase

**NINE LIVES REPIVOT (2026-06-11) — supersedes everything below.** Read `docs/rfc/nine-lives.md` first. meow is being rebuilt as the **exoskeleton for Claude Code**: a Bun heartbeat that owns the session boundary (birth context → exit contract → rebirth), meow-the-skill (markdown roles) as the mind, Python gate scripts as the trust layer, second-brain as memory. Combines architect-builder, mochu, spec-driven-qa, monkey-skills, and second-brain. Wave 5 (ECOMODE/AUTOPILOT/TUI/REPL/RALPH) is **cancelled** — do not pick those items. `src/` is frozen pending the `legacy-swarm` branch. **Scaffold landed 2026-06-11:** `bin/meow.ts` (Bun heartbeat) · `skills/meow/` (mind: strategist/builder/verifier) · `scripts/` (governor: schedule, budget, run_corpus, ship_gate, select_gap, audit_verifiers, compact) · `.meow/` (state: PROBLEM, campaign, goals, gaps, verifiers/v0001, brain). Gate chain verified green. Legacy docs moved to `docs/.refs/`. Next work = gaps.md #1 (heartbeat verifier suite), per RFC §5 step 4.

<details><summary>Pre-repivot phase (historical)</summary>

**Wave 4 — Operational Hardening.** All prior waves and the 5-phase AI-native self-improvement plan are complete. The loop now fixes bugs that are actively breaking the running system.

</details>

---

## Open Bugs — Pick from Here

Fix highest severity first. Mark done in `ROADMAP.md` and append to `loop-decisions.md`.

### Medium (fix after criticals)

**BUG-03 — `DelegationProtocol` routes to unregistered workers** — completed

**BUG-04 — `FedClient` infinite reconnect loop** — completed

**BUG-05 — `FileCoordinator` not enforced in `Orchestrator`** — completed

**BUG-06 — PID mismatch on respawn** — completed

**BUG-07 — Architect fallback validation always passes** — completed

---

## Unimplemented Planned Work

**Wave 5 — Mode activation + CLI rewrite.** Read `docs/rfc/architect-guidance.md` before picking any of these. Order matters.

1. **ECOMODE handler** — implement `EcoModeHandler.execute()` in `ExecutionModes.ts` (Haiku-first, Sonnet fallback)
2. **AUTOPILOT handler** — implement multi-stage pipeline: Liaison → Architect → workers → Auditor
3. **TUI rewrite** — per `docs/rfc/tui-spec.md`; do after AUTOPILOT so the task tree has real events to render
4. **REPL rewrite** — replace `parallelMode` boolean with `ExecutionMode`, add readline history, add `/abort`; do alongside TUI
5. **RALPH handler** — AUTOPILOT wrapper with 100-retry loop; do last
6. **Persistent error log** — tee stderr + uncaught exceptions to `~/.meow/logs/error.log` with rotation; do in first Wave 5 commit alongside the Orchestrator inline-stub cleanup

---

## Completed

| What | Where |
|------|-------|
| Waves 1–3 (infra, hardening, ecosystem) | `ROADMAP.md` |
| 5-phase AI-native self-improvement plan | `docs/rfc/ai-native-meow-plan.md` |
| Quantum branding removed | committed |
| Architectural gaps 1–6 (modes, validation, SQLite coord, delegation) | `docs/rfc/architectural-decisions.md` |
| BUG-02: Fixed `fixMeow()` timeout on Windows by using `exec()` instead of `spawn()` | `src/agent/agent.ts`, commit e0cfe07 |
| BUG-01: Fixed `vec_memory` integer PK crash via correct `vec0_insert()` API | `src/agent/memory.ts`, `src/kernel/database.ts`, commit ca20ee4 |
| BUG-03: Registered `browseros` and `qa` workers in `DelegationProtocol` | `src/orchestrator/DelegationProtocol.ts` |
| BUG-04: Capped `FedClient` reconnect attempts; emits `permanently_disconnected` | `src/swarm/federation/FedHub.ts` |
| BUG-05: Enforced `FileCoordinator.requestAccess()` in dispatch; requeue on denied | `src/orchestrator/ParallelExecutor.ts` |
| BUG-06: `respawnAgent()` now returns new PID; callers update registry | `src/kernel/kernel.ts` |
| BUG-07: Replaced no-op fallback with explicit failure when no test file | `src/architect/Architect.ts` |

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
| Wave 5 build order + REPL/TUI/mode architecture | `docs/rfc/architect-guidance.md` |

---

## Windows Environment Notes

- Node.js required (Bun not supported)
- Extension discovery fails on Windows (non-fatal, caught and swallowed)
- `claude -p` via `spawnSync` hangs — use `spawn` with `shell: false` (see BUG-02)
- Husky pre-push hook may fail even when individual commands succeed (MSYS2 exit code issue)
