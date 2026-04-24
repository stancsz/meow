# DISCOVER: External Research & Pain-Sourcing
[STATE: IDLE]

**Goal:** Use tools to observe the outside world and our own internal metrics to find the next most valuable capability to build.

## Methodology
1. **External Browsing**: Use MCP/tools to browse changelogs, blogs, and repos of leading AI agents (Cursor, Windsurf, Letta, Mem0, Builder.io). Look for the *newest features* and interaction patterns.
2. **Local Pain-Sourcing**: Scan our own `dogfood/validation/` logs, fallback metrics, and recurrent errors. Fix our own house before adopting shiny object features.

## Output Zone: `evolve/backlog/`
- For each new finding, create a proposal at `evolve/backlog/{topic}.md`.
- Assign a priority score (1-5).
- Include links to original external sources if discovered via browser.

---

# PLAN: Architecture & Test-Driven Design (TDD)
[STATE: IDLE]

**Goal:** Take ONE top-priority item from the DISCOVER backlog and architect it rigorously. Do NOT write implementation code yet.

## Methodology
1. **Lock Epoch**: Choose exactly ONE feature to work on. Do not multitask.
2. **Architecture Spec**: Draft an `architecture.md` defining how this fits the Meow ecosystem (sidecars, MCP, registry, etc.). Check the Sovereign Palace memory to avoid past mistakes.
3. **Test Generation**: Write an executable test file (e.g., `feature.test.ts`) that will verify this feature. It must strictly test the boundaries and failure cases.

## Output Zone: `evolve/epoch/{n}/`
- `plan_architecture.md`
- `validation.test.ts`

---

# BUILD: Strict Implementation
[STATE: IDLE]

**Goal:** Write the actual implementation code to satisfy the `validation.test.ts` generated in the PLAN step.

## Methodology
1. Read `plan_architecture.md` and `validation.test.ts`.
2. Modify or create TypeScript codebase files.
3. Do not modify the test file to artificially pass. Adapt the code to the test. If the plan was fundamentally flawed, abort back to PLAN.

---

# DOGFOOD: Automated Quality Gate
[STATE: IDLE]

**Goal:** Provide an automated, undeniable verdict on whether the BUILD was successful.

## Methodology
1. Run `bun test path/to/validation.test.ts` for the current epoch.
2. **If FAIL**: Extract exact stack trace/error. Send it to the Orchestrator to spawn a `FIX` mission automatically. The epoch is BLOCKED.
3. **If PASS**: 
   - Record success in `dogfood/validation/epoch-{n}-history.json`.
   - Trigger the Memory Consolidator (Enzo) to store the successful pattern in long-term memory.
   - Unlock the orchestrator to pick the next DISCOVER item.
