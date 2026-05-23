# MEOW Test Suite — Live Test Policy

## TL;DR: Write Live Tests

> **APPROVED**: Live tests are authorized. The user explicitly approves tests that exercise real components, file I/O, subprocess spawning, and actual database operations. Do NOT default to mocks when a live test is feasible.

---

## The Problem with Mock-Heavy Tests

Mock-heavy tests pass but miss real failures:

```
Mocked DB → Tests pass → Production crash
```

Meow is fragile in ways mocks cannot simulate:
- SQLITE_BUSY from concurrent writes
- Stale lock accumulation in FileCoordinator
- Subprocess orphaning on Windows
- Watchdog timer races
- WebSocket federation handshake failures

---

## What Is a "Live Test"

A **live test** exercises real behavior:

| Mock-Heavy (AVOID) | Live Test (PREFERRED) |
|---|---|
| `createMockDatabase()` | Real `Database` instance with temp DB file |
| `vi.spyOn(Agent.prototype, "chat").mockImplementation(...)` | Call `Agent.chat()` with real LLM or controlled test key |
| In-memory fake filesystem | `fs` operations in `tmp/` sandbox |
| Spawn mocked | Real `child_process.spawn` with timeout |
| Fake timers (`vi.useFakeTimers`) | Real timers with `setTimeout`/`setInterval` |

---

## When to Write Live Tests

**DEFAULT to live tests when testing:**
- Kernel drain/batch logic → use real SQLite
- FileCoordinator locking → real `fs` locks in `tmp/`
- SwarmManager task claiming → real SQLite concurrent writes
- Watchdog/respawn → real subprocess + heartbeat tracking
- Federation (FedServer/FedClient) → real WebSocket server/client
- Validation contracts → real `child_process.spawn` of validation scripts

**Acceptable to use mocks when:**
- Testing pure algorithmic logic (consensus threshold calculations, PII regex patterns)
- Testing error message formatting
- Quick smoke tests during development

---

## How to Write a Live Test

### 1. Use a Temp Directory Sandbox

```typescript
import * as fs from "fs";
import * as path from "path";
import { Database } from "../../src/extensions/database/Database";

const tempDir = path.join(process.cwd(), "tmp", `test-${Date.now()}`);
beforeEach(() => fs.mkdirSync(tempDir, { recursive: true }));
afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));
```

### 2. Use a Real (or Realistic) Database

```typescript
import { Database } from "../../src/extensions/database/Database";

let db: Database;
beforeEach(() => {
  const dbPath = path.join(tempDir, `test-${Date.now()}.db`);
  db = new Database(dbPath);
  db.initialize(); // or db.exec(SCHEMA)
});
afterEach(() => db.close());
```

### 3. Spawn Real Subprocesses (Not Mocked)

```typescript
import { spawn } from "child_process";

const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
  const child = spawn("node", ["-e", "console.log('live'); process.exit(0)"], { cwd: tempDir });
  let stdout = "", stderr = "";
  child.stdout?.on("data", d => stdout += d);
  child.stderr?.on("data", d => stderr += d);
  child.on("close", code => resolve({ stdout, stderr, exitCode: code ?? 0 }));
});

// Assert on real output
expect(stdout).toContain("live");
```

### 4. Mark Live Tests Clearly

Add a comment at the top of live test files:

```typescript
/**
 * @live_test
 * This test exercises real file I/O, subprocess spawning, and actual database operations.
 * It is NOT mocked. Run with: npm test -- --grep "live"
 */
describe("Kernel Drain with Real SQLite", () => {
```

Or prefix live test names:

```typescript
it("[LIVE] should retry batch on SQLITE_BUSY and succeed", async () => { ... });
```

### 5. Isolate Live Tests

Live tests can pollute state. Isolate them:

- Use `tmp/` directories per test (not shared)
- Clean up in `afterEach`
- Don't run live tests in parallel with `--pool=parallel` unless they create unique ports/paths
- Set `testTimeout(30000)` for slower live operations

---

## Test Naming Conventions

| Prefix | Meaning |
|---|---|
| `[LIVE]` | Real I/O, real subprocess, real DB. Not mocked. |
| `[MOCK]` | Primarily mocked/unit test (still ok) |
| `[FAULT_INJECTION]` | Chaos engineering — injects failures to test resilience |
| `[E2E]` | Spans multiple components, may use subprocess |

---

## Anti-Patterns to Eliminate

```typescript
// BAD: Mock everything
const mockDb = createMockDatabase({ batchErrors: ["SQLITE_BUSY", "SQLITE_BUSY"] });
const kernel = new MeowKernel(mockDb); // mock passed as "real"

// GOOD: Real DB, simulate SQLITE_BUSY via fault injector or concurrency
const realDb = new Database(tempDbPath);
const injector = createFaultInjector({ type: "db-busy", count: 2, probability: 1.0 });
```

```typescript
// BAD: Fake timers hide timer bugs
vi.useFakeTimers();
// ... test watchdog logic

// GOOD: Real timers, use short intervals
watchdogInterval = 100; // 100ms for test
await new Promise(r => setTimeout(r, 250)); // wait for real watchdog cycle
```

```typescript
// BAD: Stubbed method never called in production
coordinator.releaseStaleLocks(30000); // manually called
// BUT releaseStaleLocks is NEVER wired into any lifecycle!

// GOOD: Test the actual production call path
// If releaseStaleLocks isn't called anywhere, that's a BUG the test should catch
```

---

## Running Live Tests

```bash
# Run only live tests
npm test -- --grep "@live_test"

# Run only fault injection tests
npm test -- tests/fault-injection/

# Run e2e tests (always live)
npm test -- tests/e2e/

# Run with verbose output
npm test -- --reporter=verbose
```

---

## CI Considerations

Live tests are **slower** and **less reproducible** (timing-sensitive, port-sensitive). Acknowledge this:

- Set appropriate `testTimeout(30000)`
- Use port 0 (`0`) to let the OS pick an available port for WebSocket servers
- Live tests that fail on CI but pass locally indicate real environmental issues — **don't dismiss them**

---

## Summary for Agents

When assigned a task like "write tests for kernel batch drain" or "add tests for file locking":

1. **Default to live** — use real `Database`, real `fs`, real `spawn`
2. **Sandbox rigorously** — `tmp/` per test, cleanup in `afterEach`
3. **Mark clearly** — `[LIVE]` prefix or `@live_test` comment
4. **Test the actual call path** — not a method in isolation, but the production invocation chain
5. **Accept flakiness** — live tests sometimes fail due to timing. Set timeouts generously.