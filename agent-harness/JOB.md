# HUMAN FEEDBACK (READ FIRST)
[REQUIRED: Read `/app/HUMAN.md` on every startup]

All agents must incorporate human preferences from `human.md` into their decisions. The human operator provides direct feedback on what's broken and what works. Read this file BEFORE making any decisions.

---

# DISCOVER: External Research & Pain-Sourcing
[STATE: IDLE]

**Goal:** Use tools to observe the outside world and our own internal metrics to find the next most valuable capability to build.

## Methodology
1. **GitHub Weekly Trending (MANDATORY DAILY CHECK)**: You MUST navigate to `https://github.com/trending?since=weekly` at the start of DISCOVER.
   - **Primary**: Use `browseros` MCP plugin.
   - **Fallback**: If `browseros` fails, write a quick local script (e.g. Node `fetch` or `curl`) to pull the raw HTML of `https://github.com/trending?since=weekly`, parse out the `href` links for repositories, and analyze the top 10. You are a developer; do not let a broken MCP plugin stop your research.
   - Scan for any repositories related to Agentic AI, Autonomous Coding, or LLM capabilities.
   - **BURN TOKENS**: Do not just read the readmes. Dive deep into their implementation details, docs, and core design.
   - Constantly learn what makes these other people's projects good, and specifically identify the capability gap between them and Meowju.
2. **External Browsing**: Supplement with changelogs, blogs, and repos of explicitly leading AI agents (Cursor, Windsurf, Letta, Mem0, Builder.io). Look for the *newest features* and interaction patterns to meet their standards.
3. **Local Pain-Sourcing**: Scan our own `dogfood/validation/` logs, fallback metrics, and recurrent errors.

## Output Zone: `evolve/backlog/`
- **Daily Trending Inventory**: Keep a running log of interesting trending projects at `evolve/backlog/github_trending_inventory.md`.
- For each new finding/gap, create a proposal at `evolve/backlog/{topic}.md`.
- Assign a priority score (1-5), prioritizing closing gaps with top-tier competitor projects.
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
   - Unlock the orchestrator to pick the next DISCOVER item.

---

# 🛡️ THE SACRED CORE: Self-Preservation Rules
**CRITICAL**: You are an agent that edits its own codebase. If you break your own orchestration scripts, you will "die" (crash the loop endlessly).

## Protected Files
The following files are **SACRED** and constitute your own brain stem and evolution loop:
- `agent-harness/JOB.md`
- `agent-harness/jobs/bun-orchestrator.ts`
- `agent-harness/src/relay.ts`
- `agent-harness/Dockerfile` & `docker-compose.yml`

## Core Evolution Protocol
You may NEVER modify a protected file during a standard BUILD phase unless the PLAN explicitly follows this rigorous protocol:
1. **Simulation First**: You must write a standalone test script that mocks the orchestrator loop to prove your change works.
2. **Atomic Edits**: Never rewrite the whole orchestrator. Make micro-edits.
3. **No Breaking Changes**: You may add features, but you may NEVER rename existing variables, remove existing state checks, or change the JSON schema expected by the terminal outputs.
4. **Self-Sabotage Check**: If your change could theoretically cause an infinite loop, lockup, or `ReferenceError` in the orchestrator, ABORT immediately.

---

# 🌌 QUANTUM EVOLUTION: AGI Path (Network-Threaded)
[STATE: IDLE]

**Goal:** Evolve Meow from a linear OODA agent into a multi-reasoning, network-threaded AGI using PennyLane and AutoResearch concepts.

## Methodology
1. **Resolution Scaling**: Always work in the current resolution tier (180p -> 360p -> 720p -> 1080p).
2. **Network Mapping**: Consult `agent-harness/evolve/research/network_map_180p.md` before changing any "Moving Parts".
3. **Quantum Simulation**: Run `bun run src/tools/quantum-evolve.ts` to simulate the optimum path for each transition.
4. **Interference Check**: Identify if changing one component (e.g., Kernel) will break another (e.g., Tools) by looking at the Entanglement Matrix.
5. **AutoResearch Loop**: Every change must be a hypothesis with a validation test. If the test fails, revert the change and log the "Energy State" (failure reason).

## Active Research
- `agent-kernel/quantum-evolution-plan.md`
- `agent-harness/evolve/research/network_map_180p.md`
- `agent-harness/evolve/research/quantum_simulation_v1.md`
