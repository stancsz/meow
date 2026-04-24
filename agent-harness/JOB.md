# EVOLVE: Research & Learn from Other Agents
[IMPROVED 🔄]

Research the latest agentic AI systems, tools, and patterns. Find what works and what doesn't. Distill learnings into actionable improvements for Meow.

## Output Zone: `evolve/research/`

**STRICT RULE:** All research outputs MUST go to `/app/agent-harness/evolve/research/{filename}.md`

## Research Targets
- **Cursor** (cursor.com) - How does it handle agent-HTTP rendering, codebase indexing, auto-complete?
- **Claude Code** (claude.ai/code) - What makes its tool use, streaming, and permissions elegant?
- **Builder.io / Zemith** - How do they handle component generation, handoff, iteration?
- **Windsurf** - What makes its cascade architecture work?
- **GitHub Copilot Workspace** - How does it approach autonomous coding?
- **Vox** - What UI patterns work for human-agent collaboration?

## Research Method
1. Use browseros MCP to visit docs, changelogs, and technical blog posts
2. Search for "agentic AI architecture", "autonomous coding agent", "human-in-the-loop agent design"
3. Find concrete implementation details, not marketing fluff
4. Document what patterns Meow should adopt or avoid

## Output Format
Write findings to `/app/agent-harness/evolve/research/{topic}-{date}.md`

Each research doc should follow this structure:
```
=== Research: {Topic} ===

== What It Does ==
{Concrete description}

== How It Works ==
{Technical details}

== What Meow Should Steal ==
{Specific ideas to adopt}

== What Meow Should Avoid ==
{Anti-patterns and pitfalls}

== Next Steps ==
{How to evolve based on this research}
```

## Loop Back
After each research run, the Commander Agent reviews findings and decides:
- Should we dive deeper into this topic?
- Should we dogfood a specific pattern?
- Should we pivot to a different research target?
- Has enough been learned? Time to DOGFOOD and test?

---

# DOGFOOD: Test & Improve Meow's Own Capabilities
[IMPROVED 🔄]

Run the test suite, fix failing capabilities, and make Meow more robust. This is the "eat your own dog food" loop.

## Output Zone: `dogfood/results/`

**STRICT RULE:** All test results MUST go to `/app/agent-harness/dogfood/results/{timestamp}.json`

## Test Targets (from agent-kernel/tests/)
- `gaps.test.ts` - Are the identified gaps still there?
- `capability-matrix.test.ts` - What capabilities work/don't work?
- Run actual commands: read, write, shell, git - do they work in Docker?

## Improvement Method
1. Run tests and capture output
2. For each failure: diagnose why, fix the root cause
3. For each success: document the pattern that works
4. Add new test cases for previously untested capabilities

## Output Format
Write test results to `/app/agent-harness/dogfood/results/{timestamp}.json`:
```json
{
  "timestamp": "ISO date",
  "tests_run": ["test names"],
  "passed": ["test names"],
  "failed": ["test names with reasons"],
  "fixes_applied": ["what was fixed"]
}
```

Update `/app/agent-harness/dogfood/CAPABILITY_STATUS.md` with current status.

## Loop Back
After each dogfood run, the Commander Agent reviews:
- What capabilities are still broken?
- What new capabilities should we test?
- Should we prioritize fixing or researching?
- What's the highest-leverage thing to improve next?

---

# DESIGN: Human-Agent Interface Innovation
[IMPROVED 🔄]

Design the next generation of how humans collaborate with AI agents. This loop researches, prototypes, and implements better interaction patterns.

## Output Zone: `design/proposals/`

**STRICT RULE:** All design proposals MUST go to `/app/agent-harness/design/proposals/{feature}-{date}.md`

## Design Targets

### 1. Agent Presence & Transparency
- How should an agent signal it's working?
- What should a "thinking" indicator look like?
- How to show agent progress without spam?

### 2. Human-in-the-Loop Patterns
- When should an agent ask for permission vs. act autonomously?
- What's the right balance of automation vs. control?
- How to make human oversight easy, not burdensome?

### 3. Memory & Continuity
- How should an agent remember context across sessions?
- What's the right granularity of "remember this" vs "forget this"?
- How to make memory feel natural, not creepy?

### 4. Error Recovery & Graceful Degradation
- When things go wrong, how should the agent communicate?
- What's the right retry/backoff strategy?
- How to make failures learning opportunities?

## Research Method
1. Study the UI/UX of: Cursor, Claude Code, Copilot, Builder.io
2. Read research papers on human-robot collaboration
3. Prototype small experiments in `/app/agent-harness/design/`

## Output Format
Write designs to `/app/agent-harness/design/proposals/{feature}-{date}.md`:

Each proposal should follow this structure:
```
=== Design Proposal: {Feature Name} ===

== Problem Statement ==
{What human-agent interaction problem are we solving?}

== Research ==
{What did we learn from studying others?}

== Proposed Solution ==
{Detailed description of the interaction pattern}

== Implementation Plan ==
{How would we build this in Meow?}

== Evaluation Criteria ==
{How would we know if this works?}
```

## Loop Back
After each design run, the Commander Agent reviews:
- What proposals are ready to implement?
- Should we prioritize DOGFOOD (testing) or EVOLVE (research)?
- What's the highest-impact design to prototype next?
- Should this loop focus on a specific sub-problem?

---

<!-- OUTPUT ZONES (Strict Enforcement) -->

| Zone | Path | Purpose | Strict Rule |
|------|------|---------|-------------|
| **evolve** | `evolve/research/` | Research findings | `{topic}-{date}.md` |
| **dogfood** | `dogfood/results/` | Test results | `{timestamp}.json` |
| **design** | `design/proposals/` | UI/UX proposals | `{feature}-{date}.md` |
| **scratch** | `scratch/` | Temporary files | Clean up when done |

**NEVER write to:**
- Root directory (except `JOB.md`, `docker-compose.yml`, `Dockerfile`)
- `src/` directories
- `computer/` directory (legacy - move contents to appropriate zone)
- Any directory not in the table above
