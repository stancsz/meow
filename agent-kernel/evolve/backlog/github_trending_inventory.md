# GitHub Trending Inventory
**Generated:** 2025-01-25T23:15:00Z  
**Source:** https://github.com/trending?since=weekly

## Weekly Trending Repos (Agentic AI / Coding Agents Focus)

### 1. zilliztech/claude-context
- **Focus:** Code search MCP for Claude Code
- **Description:** Make entire codebase the context for any coding agent
- **Relevance:** 10/10 - Direct competitor to context-awareness in Meowju
- **Key Pattern:** Uses MCP (Model Context Protocol) for context enrichment
- **Gap:** Meowju lacks structured MCP client integration

### 2. apps/copilot-swe-agent  
- **Focus:** GitHub Copilot SWE agent
- **Relevance:** 9/10 - Official Microsoft agentic coding tool
- **Gap:** Represents baseline enterprise agent capabilities

### 3. deepseek-ai/DeepEP
- **Focus:** Expert-parallel communication library
- **Relevance:** 7/10 - Infrastructure for distributed AI
- **Not directly competitive** - More infrastructure than agentic coding

### 4. microsoft/typescript-go
- **Focus:** TypeScript to Go transpiler
- **Relevance:** 6/10 - Tooling/utility

### 5. Alishahryar1/free-claude-code
- **Focus:** Free Claude Code alternative
- **Relevance:** 8/10 - Unofficial Claude Code clone
- **Gap:** Reveals demand for open Claude Code alternatives

---

## Top Competitor Features Analysis

### Cursor (Official Site: cursor.sh)
- **MCP Support:** Native Model Context Protocol integration
- **Context Management:** Project-wide codebase awareness
- **Multi-file editing:** Batch file operations with diff preview

### Windsurf (Official Site: windsurf.ai)
- **Agentic Loop:** Cascade AI architecture for autonomous coding
- **Context Continuity:** Long-running session memory
- **Tool Use:** Deep shell/terminal integration

### Letta (GitHub: letta-ai/letta)
- **Memory Architecture:** Explicit persistent memory layer for agents
- **State Management:**checkpoint/suspend/resume capabilities
- **Blockers:** https://github.com/letta-ai/letta

### Mem0 (GitHub: mem0ai/mem0)
- **Memory API:** Purpose-built memory layer for LLM applications
- **Semantic Search:** Vector-based memory retrieval
- **Multi-agent Memory:** Shared memory across agents

---

## Gap Analysis: Meowju vs Competition

| Capability | Cursor | Windsurf | Letta/Mem0 | Meowju | Gap Score |
|------------|--------|----------|------------|--------|-----------|
| MCP Client | ✅ | ✅ | ❌ | ❌ | CRITICAL |
| Persistent Memory | ✅ | ✅ | ✅ | Session store only | HIGH |
| Permission Learning | ❌ | ❌ | ❌ | ✅ | MEWAWAY |
| Rich State Indicators | ❌ | ❌ | ❌ | ✅ | MEWAWAY |
| Context Compaction | ✅ | ✅ | ✅ | Session-level only | MEDIUM |
| Multi-turn Streaming | ✅ | ✅ | ✅ | ✅ | N/A |

---

## Priority Recommendations

1. **MCP Client Integration** (Priority 1)
   - `src/sidecars/mcp-client.ts` exists but may not be wired to tool-registry
   - Enables Cursor/Windsurf-class context awareness

2. **Permission System Fixes** (Priority 2) 
   - See pain-point research below - shell tool bypasses permission layer

3. **Enhanced Streaming Events** (Priority 3)
   - EPOCH 16 termination events present but may need validation