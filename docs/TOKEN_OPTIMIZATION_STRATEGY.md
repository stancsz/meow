# TOKEN OPTIMIZATION STRATEGY: High-Fidelity Efficiency Architecture

This document outlines the strategy for implementing Aider-inspired efficiency features in MEOW to maximize token utility and reduce orchestration costs.

## Core Objectives
1. **Repository Mapping**: Provide high-fidelity structural context without bloating the prompt.
2. **Auto-Recovery**: Implement an automated Lint-Fix loop for immediate error correction.
3. **Atomic Execution**: Leverage high-fidelity diffs and signatures to minimize output tokens.

---

## 1. High-Fidelity Repository Map
MEOW now supports a "Signatures-Only" repository map that extracts class, function, and interface definitions across the project.

### Implementation Details
- **Engine**: `src/agent/repo_map.ts`
- **Capability**: Language-aware regex extraction for TS, JS, and Python.
- **Optimization**: Automatically respects `.gitignore` and prunes common keywords.
- **Visuals**: Uses a hierarchical tree structure for immediate architectural clarity.

### Definition of Done (DoD)
- [x] Create standalone mapping script (`src/agent/repo_map.ts`).
- [x] Support for `.gitignore` exclusion.
- [x] Capture full method/function signatures including arguments.
- [x] Tree-like formatting for output.
- [x] Codify usage in `.meow/skills/repo-map/SKILL.md`.

---

## 2. Automated Lint-Fix Loop
Implement a mechanism where MEOW automatically detects failures from the `run` or `test` tools and feeds them back into the loop without user intervention.

### Implemented Workflow
1. Agent applies an edit.
2. Agent calls `run | npm test` (or any `run`/`test` tool invocation).
3. If output contains error/failure patterns, `detectRunFailure()` returns true.
4. The error is extracted via `extractError()` and appended to message history with a "Surgical Fix" directive via `buildSurgicalFixPrompt()`.
5. The model gets a free recovery turn to apply a minimal fix.
6. **Loop cap**: Max 3 recovery attempts (`LINT_FIX_LOOP_MAX`) to prevent token burning.

### Definition of Done (DoD)
- [x] Implement error detection regex in `Agent.ts` (`detectRunFailure()`).
- [x] Create a "Recovery Mode" that prioritizes fixing the specific reported lines.
- [x] Ensure the loop terminates after 3 failed recovery attempts to prevent token burning.

---

## 3. High-Fidelity Diffs
Move beyond simple SEARCH/REPLACE blocks to more compact unified diffs for models that support them.

### Implementation Details
- **Primary format**: SEARCH/REPLACE blocks (existing, high fidelity).
- **Fallback format**: Unified diff (`udiff`) via `parseUdiffs()` — supports `--- filename\n@@ -start,+count @@ +added/-removed` style patches.
- **Fuzzy matching**: `diff-match-patch` already deeply integrated via `applyDmpLinesPatch()` for flexible application of changes.
- **udiff fallback**: When SEARCH/REPLACE parsing finds no edits, `parseUdiffs()` is called as a secondary pass.

### Definition of Done (DoD)
- [x] Integrate `diff-match-patch` more deeply for fuzzy application of changes.
- [x] Implement a `udiff` edit format as secondary fallback parser.

---

## Test Criteria for Successful Implementation
To verify that these optimizations are working, we use the following metrics:

| Metric | Target | Verification Method |
| :--- | :--- | :--- |
| **Initial Context Size** | < 2,000 tokens | Check `/tokens` output for a fresh session with repo map. |
| **Mapping Accuracy** | 95%+ of exported symbols | Compare `repo_map.md` against `grep -r "export"`. |
| **Recovery Success** | First-turn fix | Introduce a deliberate syntax error and verify auto-correction. |
| **Ignored Files** | 0% leakage | Ensure `node_modules` or `.git` never appear in the map. |

---

## Current Repo Map Snapshot
Generated on: 2026-05-08

```text
│ src/agent/agent.ts:
│   export class Agent
│   async chat( userInput: string, runTests: boolean = false, ... ): Promise<string>
│   public async callLLM(systemPrompt: string, messages: Message[]): Promise<string>
│   public async buildSystemPrompt(): Promise<string>
│
│ src/kernel/kernel.ts:
│   export class MeowKernel
│   pulse(pid: number)
│   registerMission(pid: number, agent: string, goal: string)
│   async watchdogCheck()
│
│ src/agent/repo_map.ts:
│   export async function generateRepoMap(cwd: string, maxFiles: number = 100): Promise<string>
```
