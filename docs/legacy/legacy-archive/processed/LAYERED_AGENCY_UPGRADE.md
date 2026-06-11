# 🚀 Mission: Layered Agency Upgrade (2028 Stack)

To resolve latency issues and align with the **Quantum-Agentic Convergence**, MEOW is transitioning from a monolithic agent architecture to a 4-layer Vertical Intelligence Stack.

## 🏗️ Architecture Overview

1.  **L1: The Liaison (Interaction)** - Surface agent for immediate user feedback.
2.  **L2: The Architect (Orchestration)** - Planning and quantum-enhanced optimization.
3.  **L3: The Swarm (Execution)** - Specialized worker pool.
4.  **L4: The Auditor (Governance)** - Verification, safety, and security.

---

## 📝 TODO List

### Phase 1: Interaction & Responsiveness (L1)
- [ ] Implement `Liaison` class in `src/liaison/`.
- [ ] Refactor `REPL` and `TUI` to use non-blocking `Liaison.chat()`.
- [ ] Add streaming support for initial model thoughts (L1 should use Gemini 3 Flash).
- [ ] Define `MissionBrief` schema for L1 -> L2 communication.

### Phase 2: Planning & Scheduling (L2)
- [ ] Implement `Architect` class in `src/architect/`.
- [ ] Integrate `TaskDecomposer` with `Architect`.
- [ ] **Research**: Implement QUBO-based scheduling for parallel task conflict resolution.
- [ ] Add resource-locking mechanism to prevent "Task Entanglement" during file writes.

### Phase 3: Distributed Execution (L3)
- [ ] Implement `SwarmManager` in `src/swarm/`.
- [ ] Move `Summoner` logic into L3 worker pool management.
- [ ] Add "Session Heartbeats" to monitor L3 workers in real-time.

### Phase 4: Verification & Governance (L4)
- [ ] Implement `Auditor` in `src/auditor/`.
- [ ] Migrate `MissionReviewer` "Liar Checks" to L4.
- [ ] Implement **SOP Enforcement** (pre-execution policy checks).

---

## ✅ Definition of Done (DOD)

- [ ] **Latency**: L1 must respond to any user request within **< 500ms** with a confirmation or initial plan.
- [ ] **Independence**: Any layer can be swapped out (e.g., swapping L1 from Gemini to local Llama) without breaking the stack.
- [ ] **Verification**: 100% of code mutations from L3 must be audited by L4 before being merged/committed.
- [ ] **State Preservation**: The "Quantum Memory" must be accessible across all layers via the `MeowKernel`.

---

## 🧪 Testing & Ensures

### 1. Integration Tests
- **Ensures**: L1 correctly distills intent into a `MissionBrief`.
- **Test**: `tests/liaison_integration.test.ts` - Mock a complex user request and verify the JSON schema output.

### 2. Concurrency Tests
- **Ensures**: L2 (Architect) detects file conflicts between parallel L3 workers.
- **Test**: `tests/architect_concurrency.test.ts` - Simulate two tasks trying to edit `kernel.ts` simultaneously.

### 3. Adversarial Tests
- **Ensures**: L4 (Auditor) catches a "Lying Specialist" (e.g., a worker that claims it wrote tests but didn't).
- **Test**: `tests/auditor_adversarial.test.ts` - Provide a mock specialist result with a `TODO` comment and verify L4 rejects it.

### 4. Responsiveness Benchmark
- **Ensures**: The system remains responsive during heavy decomposition.
- **Test**: Measure time-to-first-token in the TUI during a "Golden Mission" run.

---

## ⚛️ Quantum Alignment
The **Architect** (L2) must utilize the `QuantumReasoning` library for planning to fulfill the "Quantum-Agentic Convergence" requirement of hardware-integrated optimization.
