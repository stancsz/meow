# MEOW Production Readiness & Robust Testing Plan

This document outlines the roadmap to transition MEOW from a sophisticated prototype to a production-ready **Sovereign AI Coding Agent** with a reliability target of >95% for complex autonomous missions.

## 1. What is MEOW? (Foundational Context)
MEOW is a **Meta-Orchestrator** that coordinates specialist agents (Claude Code, Aider, etc.) to perform complex engineering tasks. Unlike standard agents, MEOW uses:
- **Quantum-Inspired Physics**: Simulated quantum gates (Grover's algorithm) for high-precision memory recall.
- **Entangled Swarms**: Multi-agent synchronization via shared interference patterns.
- **Autonomous Mission Verification**: A tiered "MissionReviewer" that validates specialist output before finalization.

---

## 2. Testing Framework Architecture
To reach production readiness, we must move beyond simple scripts to a formal **multi-layered testing pyramid**.

### Tier 1: Unit Testing (The Physics Layer)
- **Kernel Batching**: Validate that the `MeowKernel` handles high-concurrency database actions without `SQLITE_BUSY` deadlocks.
- **Quantum Logic Verification**:
    - **Oracle Accuracy**: Test `groverSearch` against known semantic targets to ensure amplitude amplification correctly favors the winner.
    - **Constraint Solving**: Test `solve()` to ensure QAOA variational steps converge on valid decisions.
- **Tool Integrity**: Unit test every extension (read, write, grep, search) against edge cases (symlinks, massive files, binary data).

### Tier 2: Integration Testing (The Synthesis Layer)
- **Database Consistency**: Verify WAL-mode integrity during simulated agent crashes and "Spooky Action" state propagations.
- **MCP Reliability**: Test integration with external Model Context Protocol (MCP) servers with mocked network failures.
- **Specialist Summoning**: Test the `Summoner` subprocess management, ensuring orphans are cleaned up on kernel exit.

### Tier 3: End-to-End (E2E) Verification
- **Full Mission Lifecycle**: From task decomposition → specialist execution → verification → commit.
- **The "Liar Check" Suite**: A set of adversarial tasks where a specialist is instructed to "fake" success (e.g., using placeholders). MEOW's `MissionReviewer` must detect and reject these 100% of the time.
- **Drift & Hallucination Detection**: Verify that the orchestrator can detect when an agent is pulsing (showing "life") but not producing meaningful file changes or has diverged from the goal.
- **Self-Healing Loop**: Verify that the `Watchdog` correctly identifies frozen agents and respawns them with full context restoration.

---

## 4. Context Synthesis & Delegation Quality
A "Ready" orchestrator must generate high-fidelity context for its specialists. Low-quality context leads to specialist hallucinations and mission failure.

### Context Requirements:
1. **Surgical File Selection**: Only provide files relevant to the subtask to prevent token bloat and "distraction."
2. **Failure Trace Injection**: If a previous attempt failed, the context MUST include the specific error log or build failure.
3. **Blueprint Consistency**: The `Monolith Blueprint` (the "Rules of the House") must be injected into every specialist command.
4. **Skill Discovery Prompts**: Every specialist must be prompted to run `npx skills find` before writing code.

### Verification Test:
- **Context Audit**: Periodically run a "Shadow Audit" on the generated specialist commands to verify they contain all required components (Goal, Files, Errors, Skills, Blueprint).

---

## 3. Semantic Pulse Monitoring (Advanced Readiness)
Production readiness requires moving from "Is the process alive?" to "Is the work progressing?"

### Progress Metrics:
1. **Delta Velocity**: Track the rate of meaningful file changes (excluding boilerplate/comments).
2. **Goal Alignment Score**: Periodic semantic check (via `MissionReviewer` or a Shadow Audit) to ensure the agent hasn't drifted into unrelated tasks.
3. **Entropy Guard**: Identify "infinite loops" where an agent reads the same file or calls the same tool repeatedly without changing state.

### Orchestrator Interventions:
- **Soft Reset**: Clear the agent's recent message history (L1 cache) and re-inject the goal to "snap" it back to focus.
- **Strategy Pivot**: Instruct the agent to stop its current approach and try a different tool or specialist.
- **Hard Termination**: Kill the agent if it produces zero progress after X semantic pulses.

---

## 4. Production Readiness Deliverables

| Deliverable | Description | Readiness Target |
| :--- | :--- | :--- |
| **Verification Hardening** | Shift `MissionReviewer` from keyword density to `git status` diff-validation and AST parsing. | Q3 2026 |
| **Quantum LSH Oracles** | Replace string-overlap oracles with Locality Sensitive Hashing (LSH) vector similarity. | Q3 2026 |
| **Paginated Context** | Implement sliding-window L1 context management to prevent OOM on massive repos. | Q4 2026 |
| **SOP Governance** | Fully automated injection of `.context/SOP.md` with zero-bypass enforcement. | COMPLETED |
| **Health Telemetry** | Real-time monitoring of agent "Pulse" and "Entanglement Quality" via CLI dashboard. | Q4 2026 |

---

## 4. End-to-End Setup & Onboarding Test
To ensure a "super high" standard of user experience, the first-time setup must be flawless.

### The "Golden Path" Install Test:
1. `git clone` into a clean environment.
2. `npm install -g .` (Verify all native C++ addons for `better-sqlite3` compile correctly).
3. `meow "health check"` (Automated diagnostic of DB, Vector Store, and LLM connectivity).
4. `meow "create a hello world test"` (Verify the entire loop: orchestrate → summon → verify → commit).

---

## 5. User Experience (UX) & Documentation Standards
Production readiness requires that the agent is not just powerful, but **usable and transparent**.

- **Standard Operating Procedures (SOPs)**: Every repository managed by MEOW must contain a `.context/` directory with governance docs.
- **Action Transparency**: The CLI must clearly distinguish between "Thinking" (Quantum Reasoner) and "Doing" (Specialist Summoning).
- **Auditability**: Every mission generates a persistent log in `.meow/logs/` and a summary in `REPORTS/`.
- **"No Trust" Policy**: The orchestrator must never assume a specialist succeeded without independent proof (screenshots, test results, linting).

## 6. Production Readiness Checklist

Before declaring MEOW "Production Ready," the following criteria must be met:

### Core Stability
- [x] **Kernel Batching**: Confirmed working via unit tests.
- [ ] **Quantum Reliability**: `QuantumReasoning.solve` converges on correct choices >90% of the time.
- [ ] **State Persistence**: 100% recovery of mission state after a hard process crash.

### Verification Integrity
- [ ] **The Liar Check**: MissionReviewer rejects "placeholder" commits 100% of the time.
- [ ] **Context Fidelity**: Generated specialist commands contain >90% relevant information (Files, Goals, SOPs).
- [ ] **Semantic Pulse**: `MeowKernel` tracks `progressScore` and kills agents with 0 velocity.
- [ ] **Drift Detection**: Shadow Audit correctly identifies and pivots "random stuff" behavior.
- [ ] **Automatic Retries**: Failed missions automatically re-spawn with context from the failure.
- [ ] **Type Check Enforcement**: Every mission requires a clean `tsc --noEmit` before verification.

### Operations & UX
- [ ] **One-Command Setup**: `npm install -g .` works on Linux, macOS, and Windows.
- [ ] **Doctor Tool**: `meow doctor` command implemented to check environment health.
- [ ] **Context Compaction**: Automated L1 context cleanup to prevent "context vomit."

## 8. Industry Agent Testing Frameworks

To move MEOW to an enterprise-grade standard, we should evaluate and potentially integrate with specialized agent evaluation platforms:

| Framework | Strength | Use Case for MEOW |
| :--- | :--- | :--- |
| **Galileo** | Observability & Guardrails | Measuring tool selection quality and enforcing plan efficiency. |
| **Maxim AI** | Simulation & Scenarios | Simulating hundreds of "stuck" scenarios to refine recovery logic. |
| **DeepEval** | Programmatic Unit Evals | Programmatic, unit-test-style evaluations of agent trajectory DAGs. |
| **Braintrust** | CI/CD Integration | Preventing regressions in mission logic during development. |
| **LangSmith** | Deep Tracing | Tracing multi-turn agent sessions and scoring stateful workflows. |

### Trajectory Evaluation Dimensions
For MEOW's swarm, we must specifically evaluate:
1. **Orchestration Logic**: effective task division and handoff quality.
2. **Context Retention**: ensuring no critical info is lost between entangled agents.
3. **Failure Recovery**: verifying the "Autonomous Respawn" logic under real stress.

