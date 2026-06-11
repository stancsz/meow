# meow-swarm: AI-Native Self-Improving Loop — Project Plan

> **STATUS: ALL PHASES COMPLETE** (as of 2026-05-23 — see `docs/loop-decisions.md` for commit hashes)
>
> This document is a historical record of the plan that was executed. The implementation
> is in `src/`. For current open work, see `docs/STATUS.md` and `docs/ROADMAP.md` Wave 4.

---

> Mapping Tom Blomfield's YC talk "How to Build a Self-Improving Company with AI"
> directly onto meow's codebase, gap by gap, loop by loop.

---

## Diagnosis: What meow has vs. what it needs

### What already exists (the bones)

| Component | File | What it does |
|---|---|---|
| MEOW-3-RULE + `fixMeow()` | `src/agent/agent.ts` | On 3 failures → calls `claude -p` to patch meow's own code |
| `EvolveHarness` | `src/agent/evolve.ts` | Meta-loop: run → verify → retry until coherent |
| `AgenticMemory` | `src/agent/memory.ts` | SQLite + HNSW vector store for cross-session recall |
| `AuditLogger` | `src/kernel/audit.ts` | JSONL + SQLite log of every LLM call, tool exec, file write |
| `MeowDatabase` | `src/kernel/database.ts` | WAL SQLite with `mission_runs`, `audit_log`, `episodic_memory` |
| Eval Harness | `src/eval/harness.ts` | Task suites, scoring rubrics, benchmark runner |
| `Orchestrator` | `src/orchestrator/Orchestrator.ts` | Parallel task execution, quality gates, self-review |
| `SkillManager` | `src/agent/skills.ts` | Discovers and loads `SKILL.md` files |

### The critical gaps (why it isn't self-improving yet)

| Gap | Impact |
|---|---|
| `fixMeow()` is **reactive** — only fires after 3 consecutive failures | Never catches slow-degrading patterns; misses clusters of different-task failures |
| No **monitoring agent** watching aggregate outcomes | The "holy shit moment" from YC requires a background watcher, not inline repair |
| Eval harness is **never auto-triggered** after a self-repair | Fixes are applied blind — no regression check before deployment |
| `mockEmbedding()` uses LSH hash, not real semantics | Memory recall is noisy; similar failures don't cluster reliably |
| Skills are static `.md` files — **never auto-updated** from observed data | Learned patterns from 1000 tasks never improve the next task's skills |
| No **diarization pipeline** — raw audit logs are never synthesized into knowledge | `episodic_memory` fills up but never becomes distilled, actionable context |
| No **scheduled overnight loop** | The system only improves when you're actively asking it to |

---

## The Target Architecture: Three Self-Improving Loops

```
┌─────────────────────────────────────────────────────────────────┐
│  LOOP 1: Task Quality Loop (per-task, inline)                   │
│  Sensor: task outcome → Policy: quality gate → Tool: fix code   │
│  Gate: eval suite → Learn: update SKILL.md + CLAUDE.md          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ feeds failure patterns
┌──────────────────────────────▼──────────────────────────────────┐
│  LOOP 2: Monitoring Agent Loop (scheduled, background)          │
│  Sensor: audit_log failures → Policy: cluster + diagnose        │
│  Tool: patch meow src → Gate: eval regression test              │
│  Learn: deploy patch → improved meow for next N tasks           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ feeds synthesized knowledge
┌──────────────────────────────▼──────────────────────────────────┐
│  LOOP 3: Knowledge Legibility Loop (periodic synthesis)         │
│  Sensor: episodic_memory + audit_log → Policy: diarize          │
│  Tool: regenerate SKILL.md files → Gate: coherence check        │
│  Learn: richer context for all future agents                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Sensor Layer: Make Everything Legible
**Goal:** Capture rich, queryable outcome data from every task. Nothing can improve if nothing is measured.

### 1.1 Add `task_outcomes` table to `MeowDatabase`

**File:** `src/kernel/database.ts`

```sql
CREATE TABLE IF NOT EXISTS task_outcomes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL,
  task_text   TEXT NOT NULL,
  result      TEXT,          -- 'success' | 'failure' | 'partial'
  quality_score INTEGER,     -- 0-100 from SelfReviewRunner
  failure_reason TEXT,       -- extracted error summary
  tools_called TEXT,         -- JSON array of tool names used
  skills_used  TEXT,         -- JSON array of skill names used
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  duration_ms INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_result ON task_outcomes(result);
CREATE INDEX IF NOT EXISTS idx_task_outcomes_run    ON task_outcomes(run_id);
```

### 1.2 Instrument `Agent.chat()` to write to `task_outcomes`

**File:** `src/agent/agent.ts`

After the final `return response` (success path) and the `fixMeow()` path, write a row. Include: `task_text`, `result`, the quality score from `SelfReviewRunner` if available, which tools were called, which skills were activated, token counts from this run.

### 1.3 Replace `mockEmbedding()` with a real local embedding

**File:** `src/agent/agent.ts`

`mockEmbedding()` uses LSH hashing — similar failure messages don't cluster. Options (in cost order):
- **Option A (free):** `@xenova/transformers` — runs `all-MiniLM-L6-v2` locally, 384-dim, ~25MB
- **Option B (API):** Anthropic `voyage-3-lite` — tiny and cheap, works great for code/text

Real embeddings make `AgenticMemory.recall()` find genuinely similar past failures, which is what powers the monitoring agent in Phase 2.

**Deliverable:** Every task leaves a structured fingerprint in `task_outcomes`. Failure clusters become queryable.

---

## Phase 2 — The Monitoring Agent Loop (The "Holy Shit" Moment)
**Goal:** A background agent watches all task outcomes, groups failures, diagnoses root causes, writes patches, and deploys them — without human intervention.

This is the direct equivalent of YC's monitoring agent that watched every query, spotted failures overnight, wrote fixes, and merged them by morning.

### 2.1 Build `MonitoringAgent` class

**New file:** `src/agent/monitor.ts`

```typescript
export class MonitoringAgent {
  // Runs on a schedule (cron) or after every N task completions

  async run(): Promise<MonitoringReport> {
    // 1. SENSOR: Query task_outcomes for recent failures
    const failures = await this.db.query(`
      SELECT task_text, failure_reason, tools_called, skills_used, COUNT(*) as freq
      FROM task_outcomes
      WHERE result = 'failure'
        AND created_at > datetime('now', '-24 hours')
      GROUP BY failure_reason
      ORDER BY freq DESC
      LIMIT 20
    `);

    // 2. CLUSTER: Group by embedding similarity (real embeddings now available)
    const clusters = await this.clusterFailures(failures);

    // 3. DIAGNOSE: For each cluster, ask the LLM: "Why does meow fail on tasks like X?"
    for (const cluster of clusters) {
      const diagnosis = await this.diagnose(cluster);

      // 4. PATCH: Generate a SEARCH/REPLACE fix (same format as agent.ts edits)
      const patch = await this.generatePatch(diagnosis);

      // 5. QUALITY GATE: Run eval suite on patched code
      const evalPassed = await this.runEvalGate(patch);

      // 6. LEARN: If eval passes → apply patch. If not → log and flag for human review.
      if (evalPassed) {
        await this.applyPatch(patch);
        // Record in meow_self_improvements table
      } else {
        await this.flagForHumanReview(patch, diagnosis);
      }
    }
  }
}
```

### 2.2 Add `meow_self_improvements` table

Track what the monitoring agent changed, why, and whether it helped:

```sql
CREATE TABLE IF NOT EXISTS meow_self_improvements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type  TEXT,   -- 'monitoring_agent' | 'fixMeow' | 'manual'
  failure_cluster TEXT,  -- description of what it fixed
  files_patched  TEXT,   -- JSON array
  eval_before    INTEGER, -- eval score before patch (0-100)
  eval_after     INTEGER, -- eval score after patch
  deployed       BOOLEAN DEFAULT FALSE,
  human_reviewed BOOLEAN DEFAULT FALSE,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Upgrade `fixMeow()` to feed `MonitoringAgent`

**File:** `src/agent/agent.ts`

The existing `fixMeow()` is good but runs in isolation. After it patches meow's code, it should:
1. Write a row to `meow_self_improvements`
2. **Run the eval suite** (`src/eval/harness.ts`) on the patched version
3. If eval score regresses → revert the patch via `git stash`
4. If eval score improves or holds → commit the patch

This closes the loop: every self-repair is now regression-tested before it persists.

### 2.4 Wire a trigger: after N failures OR on a schedule

**File:** `src/index.ts` (headless mode) or `src/kernel/kernel.ts`

```typescript
// Trigger monitoring agent:
// - Every 50 task completions (count in swarm_state)
// - Or: `meow --monitor` CLI flag for manual run
// - Or: via cron in the daemon heartbeat loop
```

**Deliverable:** meow diagnoses its own failure patterns overnight, patches itself, runs its own evals, and deploys improvements — just like YC's query-monitoring agent.

---

## Phase 3 — Skills Auto-Update Loop (Diarization → Knowledge)
**Goal:** The raw memory in `episodic_memory` and `task_outcomes` gets synthesized into updated `SKILL.md` files. Learned patterns compound. This is the YC User Manual regeneration, applied to meow's skills.

### 3.1 Build `KnowledgeSynthesizer`

**New file:** `src/agent/synthesizer.ts`

```typescript
export class KnowledgeSynthesizer {
  async synthesize(): Promise<void> {
    // 1. For each skill in skills/, query task_outcomes where skills_used contains skill name
    // 2. Find: tasks where skill helped (success) vs. tasks where skill was used but failed
    // 3. Ask LLM: "Based on these 50 examples, how should SKILL.md be updated?"
    // 4. Write updated SKILL.md
    // 5. Regenerate CLAUDE.md sections that reference skill usage patterns
  }

  async regenerateClaudeMd(): Promise<void> {
    // Pull all episodic_memory entries from the last 30 days
    // Diarize: group by topic (task types, failure modes, patterns)
    // Synthesize into new CLAUDE.md sections: "Patterns that work", "Known failure modes"
    // This keeps the system prompt up-to-date with learned reality
  }
}
```

### 3.2 Track skill effectiveness

**File:** `src/agent/skills.ts`

Add a `skill_effectiveness` table:

```sql
CREATE TABLE IF NOT EXISTS skill_effectiveness (
  skill_name    TEXT NOT NULL,
  task_result   TEXT,   -- 'success' | 'failure'
  quality_score INTEGER,
  run_id        TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Every time a skill is used, record whether the task succeeded. This lets the `KnowledgeSynthesizer` identify which skills are genuinely helpful and which need rewrites.

### 3.3 "Software is ephemeral, context is sacred"

Apply the Blomfield principle directly: SKILL.md files are regenerated from data, not hand-maintained. Add a `meow --synthesize` CLI command that runs `KnowledgeSynthesizer`. Schedule it weekly. The regenerated SKILL.md is always grounded in what actually worked, not what someone thought would work when they wrote the first version.

**Deliverable:** Skills improve automatically from observed task data. `CLAUDE.md` stays current. The system prompt reflects real-world learning, not stale assumptions.

---

## Phase 4 — Eval-Gated Deployment (Quality Gate)

The eval harness in `src/eval/harness.ts` already exists but is never called automatically. Wire it as the quality gate for Phases 2 and 3.

### 4.1 Auto-run evals after every self-repair

**File:** `src/agent/agent.ts` (inside `fixMeow()`)

```typescript
// After claude -p produces patches:
const evalReport = await harness.runBenchmark({ suite: 'coding', model: this._model });
const scoreDelta = evalReport.totalScore - baselineScore;
if (scoreDelta < -5) {
  execSync('git stash'); // Revert if score regressed more than 5 points
  this.kernel.log(`Self-repair reverted: eval score dropped ${scoreDelta} points`);
} else {
  execSync('git add -A && git commit -m "meow: self-repair [eval: +${scoreDelta}]"');
}
```

### 4.2 Add a `meow_eval_baselines` table

Track eval score history so regressions are detectable:

```sql
CREATE TABLE IF NOT EXISTS meow_eval_baselines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  suite      TEXT,
  score      INTEGER,  -- 0-100
  model      TEXT,
  trigger    TEXT,     -- 'manual' | 'post_repair' | 'post_synthesis'
  run_id     TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Deliverable:** Every improvement is regression-tested. meow never deploys a patch that makes it worse.

---

## Phase 5 — Human at the Edge (DRI Interface)
**Goal:** Humans stop being information conduits and start being edge-case handlers and oversight reviewers.

### 5.1 Add a `--review` TUI panel

**File:** `src/cli/tui.ts`

Add a 5th panel to the blessed TUI: **Pending Reviews**. Shows:
- Self-repairs that failed the eval gate (need human diagnosis)
- Skill updates that reduced quality score (need human approval)
- Monitoring agent findings that exceeded a confidence threshold but still need a DRI sign-off

This is the policy layer: the AI decides autonomously below the confidence threshold, surfaces to the human above it.

### 5.2 `MEOW_AUTO_DEPLOY_THRESHOLD` config

**File:** `src/config/env.ts`

```typescript
autoDeployThreshold: parseFloat(process.env.MEOW_AUTO_DEPLOY_THRESHOLD ?? '0.85'),
// Patches with confidence < threshold go to Pending Reviews queue instead of auto-deploying
```

### 5.3 Token usage dashboard

Add a `meow --usage` command that shows token usage grouped by:
- Task type (coding, docs, debugging)
- User/session
- Skill used
- Success/failure rate

This is the "burn tokens, not headcount" principle made observable. You see where tokens are going and whether they're producing quality output.

---

## Implementation Order & Milestones

| Phase | Milestone | Effort | What it unlocks |
|---|---|---|---|
| **1.1** | Add `task_outcomes` table | 1 day | Foundation for all loops |
| **1.2** | Instrument `Agent.chat()` | 1 day | Every task leaves a trace |
| **1.3** | Real embeddings (Xenova MiniLM) | 1 day | Memory recall actually works |
| **2.1** | `MonitoringAgent` class | 3 days | Background failure diagnosis |
| **2.3** | `fixMeow()` → eval gate | 1 day | Regression-safe self-repair |
| **2.4** | Schedule trigger | 0.5 day | Overnight improvement |
| **3.1** | `KnowledgeSynthesizer` | 3 days | Skills improve from data |
| **3.2** | Skill effectiveness tracking | 1 day | Know what works |
| **4.1** | Eval auto-run post-repair | 1 day | Quality gate closed |
| **4.2** | Eval baseline table | 0.5 day | Track progress over time |
| **5.1** | TUI review panel | 2 days | Human oversight, not bottleneck |
| **5.2** | Auto-deploy threshold | 0.5 day | Policy layer configurable |

**Total estimated effort:** ~15 developer-days (or fewer with meow doing the implementation itself)

---

## The Recursive Beauty: Use meow to build meow's self-improvement

Once Phase 1 is done (sensors working), dispatch each remaining phase as a `meow -p` task:

```bash
meow -p "Implement MonitoringAgent in src/agent/monitor.ts per docs/AI_NATIVE_MEOW_PLAN.md Phase 2.1"
meow -p "Wire fixMeow() to run eval harness and revert on regression per Phase 2.3"
meow -p "Build KnowledgeSynthesizer in src/agent/synthesizer.ts per Phase 3.1"
```

Each task gets recorded in `task_outcomes`. Failures trigger `fixMeow()`. The monitoring agent (once built) will watch how it did and improve itself. The system begins eating its own tail in the best possible way.

---

## The One Question

> "If you were building meow today, would you start it in this shape?"

meow already has the skeleton: memory, eval harness, self-repair, audit logs. What it lacks is the **wiring that closes the loops**. The monitoring agent is the missing keystone. Build that first. Everything else follows.
