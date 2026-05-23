# Communications Log

**Purpose:** Central inbox for `claude -p` and `meow -p` agents to report status, blockers, and completion.

Each agent appends a timestamped entry when:
- Task starts (what are you working on?)
- Hit a blocker (what's blocking you?)
- Task completes (what was done, did it work?)

---

### 2026-05-23 16:27 — [claude] — BUG-03 fix: Remove dead browseros/qa routes from DelegationProtocol

**Status:** completed

**Details:**
- `browseros` and `qa` delegate types had routing rules in `DelegationProtocol.ts` but no registered worker implementations exist
- Searched codebase: `BrowserOSManager` is a connection manager, not a worker; no `qa` worker class found
- Removed `browseros` routing for `.css/.scss/.html` files and `qa` routing for `.md/.json/.yml` files
- `getDelegate()` and `determineSpecialistForTask()` now only return registered worker types: `claude`, `aider`, `opencode`
- Updated `tests/orchestrator/DelegationProtocol.test.ts` to reflect new routing behavior (all files fall back to `claude`)
- All 185 tests pass (34 test files, 2 skipped)

**Git changes:**
- `src/orchestrator/DelegationProtocol.ts` — removed browseros/qa routing, simplified to claude-only with future extension points
- `tests/orchestrator/DelegationProtocol.test.ts` — updated test expectations
- `docs/STATUS.md` — moved BUG-03 to Completed section
- `docs/ROADMAP.md` — checked BUG-03 checkbox

---

### 2026-05-23 16:04 — [claude] — fixMeow() MiniMax credential passthrough

**Status:** completed

**Details:**
- `fixMeow()` in `src/agent/agent.ts` spawned `claude -p` with only `CI='true'` in env, missing MiniMax API credentials
- Added `ANTHROPIC_API_KEY` (from `LLM_API_KEY`) and `ANTHROPIC_BASE_URL` (from `LLM_BASE_URL`) to the spawned process env
- All 186 tests pass (34 test files, 2 skipped)

**Git changes:**
- `src/agent/agent.ts` — updated `fixMeow()` spawn env to include `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`

---

### 2026-05-23 16:03 — [claude] — BUG-01 fix: vec_memory integer primary key crash

**Status:** completed

**Details:**
- `src/agent/memory.ts` line 104: `INSERT INTO vec_memory (rowid, embedding) VALUES (?, ?)` passed `rowId` (from `lastInsertRowid`) but sqlite-vec's vec0 virtual table internally assigns its own integer rowid — passing a value causes a type mismatch
- Fixed by using `SELECT vec0_insert('vec_memory', ?)` scalar function which is the correct sqlite-vec API for inserting embeddings without manually specifying rowid
- Same fix applied in `src/kernel/database.ts` `batch()` method's `STORE_VECTOR` handler
- All 186 tests pass (34 test files, 2 skipped)

**Git changes:**
- `src/agent/memory.ts` — replaced `INSERT INTO vec_memory (rowid, embedding)` with `SELECT vec0_insert('vec_memory', ?)`
- `src/kernel/database.ts` — same fix in `batch()` STORE_VECTOR case

---

### 2026-05-23 13:45 — [meow-p] — dotenv runtime fix

**Status:** completed

**Details:**
- `dotenv` was already listed in package.json dependencies (`^16.5.0`)
- Ran `npm install` to ensure all dependencies were installed (1 package added)
- Rebuilt with `npm run build` — success (143ms)
- Tested with `meow -p 'hello world'` — runs successfully
- SQLite/vec loaded, HNSW index ready, kernel started and shut down cleanly

**Git changes:**
- No files modified — already correct in package.json

---

(Entries appear here most recent first)

---

## Format

```
### YYYY-MM-DD HH:MM — [claude-p|meow-p] — <task summary>

**Status:** in-progress | blocked | completed | failed

**Details:**
- What was worked on
- Results or blockers
- Next steps (if applicable)

**Git changes:**
- List of files modified/created
```

---
