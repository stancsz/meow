# competitors.md — known competitors + feature deltas

> Last recon: 2026-06-11 (bootstrap iteration)

## Competitors

### 1. uditgoenka/autoresearch (Claude Autoresearch Skill)
**URL:** https://github.com/uditgoenka/autoresearch
**Stars:** 4,948
**Description:** Autonomous goal-directed iteration for Claude Code. Inspired by Karpathy's autoresearch. Modify → Verify → Keep/Discard → Repeat forever.
**Topics:** claude-code, autonomous-agent, iteration

**What they do well:**
- Clean Claude Code skill format
- Simple iteration loop (modify/verify/discard/repeat)
- Works with existing Claude Code CLI

**What meow does differently:**
- Explicit role separation (strategist/builder/verifier)
- Mechanical ship_gate.py enforcement
- Budget management
- Second-brain integration
- Thinning focus (removing legacy mass)

### 2. ARIS (Auto-Research-In-Sleep)
**URL:** https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep
**Stars:** 11,926
**Description:** Lightweight Markdown-only skills for autonomous ML research: cross-model review loops, idea discovery, experiment automation. Works with Claude Code, Codex, OpenClaw, or any LLM agent.
**Topics:** claude-code, autonomous-agent, ml-research, mcp

**What they do well:**
- Cross-model review loops (multiple LLM providers)
- MCP server integration
- Markdown-only skills (no framework lock-in)
- Proven on ML research tasks

**What meow does differently:**
- Budget enforcement
- Mechanical gates
- Thinning ratchet (removes code over time)
- Nine Lives session boundary ownership

### 3. karpathy/autoresearch
**URL:** https://github.com/karpathy/autoresearch
**Stars:** 86,106
**Description:** AI agents running research on single-GPU nanochat training automatically
**Topics:** (ML research focused)

**Note:** This is the original inspiration but ML/research focused, not general coding.

## Competitive Gaps

Based on this recon:

| Gap | Competitor | Impact |
|-----|-----------|--------|
| Cross-model review | ARIS | High |
| MCP integration | ARIS | Medium |
| ML research proof | karpathy | Low (different target) |
| Community/stars | All | Medium (meow is new) |

## Delta: What meow has that competitors don't

1. **Mechanical ship_gate.py** — verifiers are scripts, not prose criteria
2. **Thinning ratchet** — codebase gets smaller, not bigger
3. **Budget enforcement** — `.meow/budget.md` with human gates
4. **Second-brain** — SQLite brain with FTS for persistent memory
5. **Nine Lives role separation** — strategist/builder/verifier never conflated

## Next Recon

Schedule next competitive recon in 8 iterations (2026-06-27).