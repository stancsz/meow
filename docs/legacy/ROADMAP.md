# ROADMAP

---

## Wave 4 — Operational Hardening (current)

Fix the bugs breaking the running system. See `STATUS.md` for bug details and root causes.

- [x] BUG-01: Fix `vec_memory` integer PK crash — memory broken every session
- [x] BUG-02: Fix `fixMeow()` ETIMEDOUT on Windows — self-repair dead
- [x] BUG-03: Register or remove unregistered `DelegationProtocol` workers (`browseros`, `qa`)
- [x] BUG-04: Cap `FedClient.triggerReconnection()` at max attempts
- [x] BUG-05: Enforce `FileCoordinator.requestAccess()` in `Orchestrator` dispatch
- [x] BUG-06: Fix PID mismatch on `respawnAgent()` — watchdog loses track
- [x] BUG-07: Fix Architect fallback validation no-op (`node -e "console.log('passed')"`)
- [ ] TUI rewrite per `docs/rfc/tui-spec.md` (pick after criticals done)

---

## Completed Waves

| Wave | Summary |
|------|---------|
| Wave 1 | Reproducibility, cost tracking, cross-session memory, observability |
| Wave 2 | Audit trails, ambiguity tolerance, agent registry, MCP server |
| Wave 3 | Eval harness, skill marketplace, MonitoringAgent, KnowledgeSynthesizer, EvolveHarness |
| AI-native plan | All 5 phases done: task_outcomes, MonitoringAgent, fixMeow eval-gate, skill effectiveness, TUI review panel, autoDeployThreshold |

---

## CLI reference (v0.3.0)

```bash
meow -p "<task>"          # headless (primary)
meow                      # interactive REPL
meow --tui                # TUI
meow --continue           # resume previous run
meow-mcp                  # MCP server (stdio)
meow-eval --suite=coding  # run eval benchmark
meow-skills find <topic>  # skill marketplace
```
