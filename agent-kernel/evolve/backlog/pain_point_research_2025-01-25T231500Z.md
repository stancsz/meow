# Pain Point Research: Internal Code Issues
**Generated:** 2025-01-25T23:15:00Z  
**Age:** 277 minutes stale (refreshed)

---

## Research Summary

### ✅ ALREADY IMPLEMENTED (No Action Needed)

#### 1. `compactSession()` in session-store.ts
**Status:** ✅ IMPLEMENTED  
**Location:** `/app/agent-kernel/src/core/session-store.ts`  
**Evidence:** Lines 114-171 contain full `compactSession()` async function with:
- Token estimation
- System message preservation
- LLM-powered summarization
- JSONL file re-writing
- Returns `CompactedSession` interface

**Verdict:** No fix needed.

---

#### 2. `approvalCount` Map in permissions.ts
**Status:** ✅ IMPLEMENTED  
**Location:** `/app/agent-kernel/src/sidecars/permissions.ts` line 280  
**Evidence:** 
```typescript
export const APPROVAL_THRESHOLD = 3;
export const approvalCount = new Map<string, number>();
```

Full learning layer implementation:
- `checkPermissionWithLearning()` - lines 292-315
- `recordApproval()` - lines 318-326  
- `resetLearnedPatterns()` - lines 329-334
- `saveLearnedPatterns()` / `loadLearnedPatterns()` - persistence

**Verdict:** No fix needed.

---

#### 3. `WAITING` state in AgentState enum
**Status:** ✅ IMPLEMENTED (but see issue below)  
**Location:** `/app/agent-kernel/src/types/agent-state.ts`  
**Evidence:** `WAITING_PERMISSION = "waiting_permission"` exists

**However:** `onStateChange` callback in `tool-registry.ts` uses string literals `"EXECUTING"`, `"WAITING"`, `"THINKING"` instead of `AgentState` enum values. This is a TYPE SAFETY violation.

**Verdict:** Minor type safety issue, not critical.

---

## 🔴 BLOCKING ISSUES FOUND

### Issue #1: Shell Tool Bypasses Permission System
**Severity:** CRITICAL  
**Source:** `/app/agent-kernel/dogfood/validation/epoch-7-permission-rules.json`

**Root Cause:** `tool-registry.ts` lines 156-168 have hardcoded dangerous guard:
```typescript
if (!context.dangerous) {
  return {
    content: "",
    error: `[shell:BLOCKED] Dangerous operation requires --dangerous flag\nCommand: ${cmd}`,
  };
}
```

This fires BEFORE `executeTool()` calls `checkPermissionWithLearning()`, making the entire permission layer unreachable for shell commands.

**Impact:** 
- `git status` (safe) returns BLOCKED without permission evaluation
- Permission rules (allow: git, deny: rm) are never consulted
- The `approvalCount` learning layer cannot learn safe commands

**Required Fix:**
```typescript
// In shell tool execute() - replace hardcoded guard
const perm = checkPermissionSimple('shell', cmd);
if (perm.action === 'deny') return { content: '', error: `[shell:DENIED] ${perm.reason}` };
if (perm.action === 'ask' && !context.dangerous) return { content: '', error: `[shell:BLOCKED] ${perm.reason}` };
```

---

### Issue #2: Default Permission Action is Wrong
**Severity:** HIGH  
**Source:** `permissions.ts` line 207

**Current behavior:**
```typescript
return { action: "ask" };
```

**Required behavior (per epoch-7 promise):**
```typescript
return { action: "deny" };
```

**Impact:** Unknown commands trigger interactive prompts instead of safe denial.

---

### Issue #3: Missing `--permission-rules` CLI Argument
**Severity:** MEDIUM  
**Source:** Validation file

**Status:** CLI does not parse `--permission-rules` flag to load custom permission patterns.

---

### Issue #4: Type Safety Violation in State Callbacks
**Severity:** LOW  
**Location:** `tool-registry.ts`, `lean-agent.ts`

**Issue:** `onStateChange` uses string literals instead of `AgentState` enum:
```typescript
context.onStateChange?.("EXECUTING", ...);   // String!
context.onStateChange?.("WAITING", ...);    // String!
// Should be:
context.onStateChange?.(AgentState.EXECUTING, ...);  // Enum
```

**Impact:** TypeScript won't catch typos like `"EXECUTING"` vs `"executing"`.

---

## Dead Code / Unused Patterns

### 1. `compactMessages()` in lean-agent.ts
**Location:** `lean-agent.ts` lines 100-127  
**Status:** Used internally for context window management

### 2. `isDangerous()` in permissions.ts  
**Location:** `permissions.ts` lines 283-290  
**Status:** ✅ USED in `checkPermissionWithLearning()`

### 3. ENOENT handling
**Search result:** No explicit ENOENT patterns found in codebase  
**Verdict:** Node.js fs errors are handled generically via try/catch `e.message`

---

## Shell/Dangerous Flag Pain Points

| Tool | Guard Location | Current Behavior | Correct Behavior |
|------|---------------|------------------|------------------|
| shell | tool-registry.ts:156 | Hardcoded `dangerous` check | Permission layer evaluation |
| exec skill | skills/exec.ts:14 | Hardcoded `dangerous` check | Same - exec skill separate from tool |
| git | tool-registry.ts:191 | No guard (safe by default) | ✅ Correct |

**Note:** `exec` skill and `shell` tool have separate implementations. `exec` skill is used by `/exec` command, `shell` tool is used by LLM tool calls. Both check `dangerous` but in different places.

---

## Validation Evidence

**Source file:** `/app/agent-kernel/dogfood/validation/epoch-7-permission-rules.json`
```json
{
  "verdict": "SLOPPY implementation. The permission system (permissions.ts) is fully implemented and correctly matches patterns (git → allow, rm → deny). However, the shell tool in tool-registry.ts has a hardcoded guard that blocks ALL non-dangerous shell commands before the permission system can evaluate them."
}
```

---

## Recommended Actions

| Priority | Action | File | Est. Effort |
|----------|--------|------|-------------|
| P1 | Fix shell tool to use permission layer | tool-registry.ts | 30 min |
| P2 | Change default permission action to deny | permissions.ts | 5 min |
| P3 | Add `--permission-rules` CLI parsing | lean-agent.ts | 1 hour |
| P4 | Fix type safety in onStateChange | tool-registry.ts, lean-agent.ts | 15 min |