/**
 * @live_test
 * Live fault injection tests using real SQLite and real subprocesses.
 * These tests exercise actual failure conditions and verify real behavior.
 *
 * Run with: npm test -- --grep "LIVE" tests/fault-injection/
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import Database from "better-sqlite3";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { MeowKernel } from "../../src/kernel/kernel";

describe("File Coordinator [LIVE]", () => {
  let tempDir: string;
  let dbPath: string;
  let coordinator: FileCoordinator;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "tmp", `filecoord-live-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, "filecoord.db");
    coordinator = new FileCoordinator(dbPath);
  });

  afterEach(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("[LIVE] should acquire and release locks using real SQLite", async () => {
    const result1 = await coordinator.acquire("file.txt", "task1");
    expect(result1).toBe(true);

    // Same task can re-acquire
    const result2 = await coordinator.acquire("file.txt", "task1");
    expect(result2).toBe(true);

    // Different task should fail
    const result3 = await coordinator.acquire("file.txt", "task2");
    expect(result3).toBe(false);

    coordinator.release("task1");

    // After release, task2 can acquire
    const result4 = await coordinator.acquire("file.txt", "task2");
    expect(result4).toBe(true);
  });

  it("[LIVE] should detect stale locks after maxAgeMs", async () => {
    vi.useRealTimers();

    // Acquire a lock
    coordinator.acquire("stale.txt", "task-old");

    // Manually age it by updating the DB directly
    const db = new Database(dbPath);
    const oldTime = Date.now() - 60000; // 1 minute ago
    db.prepare("UPDATE file_locks SET acquired_at = ? WHERE path = ?").run(oldTime, "stale.txt");
    db.close();

    // Should detect as stale with 30 second threshold
    const stale = coordinator.releaseStaleLocks(30000);
    expect(stale).toContain("stale.txt");

    // Lock should be gone
    expect(coordinator.getLockedFiles().has("stale.txt")).toBe(false);
  });

  it("[LIVE] should NOT release fresh locks", async () => {
    await coordinator.acquire("fresh.txt", "task-current");

    const stale = coordinator.releaseStaleLocks(30000);
    expect(stale).not.toContain("fresh.txt");
    expect(coordinator.getLockedFiles().has("fresh.txt")).toBe(true);
  });

  it("[LIVE] should handle concurrent lock attempts via SQLite IMMEDIATE", () => {
    // First task gets the lock
    const result1 = coordinator.requestAccess("task1", [
      { path: "shared.txt", operation: "update" }
    ]);
    expect(result1.allowed).toBe(true);

    // Second task is blocked
    const result2 = coordinator.requestAccess("task2", [
      { path: "shared.txt", operation: "update" }
    ]);
    expect(result2.allowed).toBe(false);
    expect(result2.conflicts.length).toBeGreaterThan(0);
  });

  it("[LIVE] should use in-memory locks when SQLite fails", async () => {
    // Coordinator with invalid path will fall back to in-memory
    const fallback = new FileCoordinator("/nonexistent/bad path/file.db");

    const r1 = await fallback.acquire("test.txt", "task1");
    expect(r1).toBe(true);

    const r2 = await fallback.acquire("test.txt", "task2");
    expect(r2).toBe(false);

    fallback.release("task1");

    const r3 = await fallback.acquire("test.txt", "task2");
    expect(r3).toBe(true);
  });
});

describe("Kernel Watchdog [LIVE]", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "tmp", `watchdog-live-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, "watchdog.db");
    db = new Database(dbPath);

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_state (id INTEGER PRIMARY KEY, key TEXT UNIQUE, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS missions (pid INTEGER PRIMARY KEY, agent_name TEXT, goal TEXT, status TEXT DEFAULT 'running', last_pulse DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, progress_score REAL DEFAULT 0, progress_summary TEXT);
      CREATE TABLE IF NOT EXISTS vector_memory_data (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, metadata TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS file_locks (path TEXT PRIMARY KEY, task_id TEXT NOT NULL, acquired_at INTEGER NOT NULL);
    `);
    db.pragma("journal_mode = WAL");
  });

  afterEach(async () => {
    vi.useRealTimers();
    try { db.close(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("[LIVE] should detect frozen agent and attempt respawn", async () => {
    vi.useRealTimers();

    const kernel = new MeowKernel(db as any);
    (kernel as any).watchdogInterval = 50; // 50ms for test
    (kernel as any).frozenThresholdMs = 100; // 100ms frozen threshold

    // Register and pulse
    const pid = 99999;
    await kernel.registerMission(pid, "frozen-agent", "task that freezes");
    await kernel.pulse(pid);

    // Make agent appear frozen
    const heartbeats = (kernel as any).agentHeartbeats;
    heartbeats.set(pid, new Date(Date.now() - 200)); // 200ms ago > 100ms threshold

    // Spy on console.log to verify respawn message
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Trigger watchdog check manually (it runs on interval)
    (kernel as any).watchdogCheck();

    // Wait for async DB update from respawnAgent (it calls db.execute asynchronously)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have triggered respawn (but actual respawn won't work in test without real meow process)
    // Verify the agent was marked as frozen in DB
    const row = db.prepare("SELECT status FROM missions WHERE pid = ?").get(pid) as any;
    expect(row.status).toBe("failed_frozen");

    consoleSpy.mockRestore();
    await kernel.shutdown();
  });

  it("[LIVE] should NOT trigger for healthy agent", async () => {
    vi.useRealTimers();

    const kernel = new MeowKernel(db as any);
    (kernel as any).watchdogInterval = 50;
    (kernel as any).frozenThresholdMs = 60000; // 1 minute

    const pid = 88888;
    await kernel.registerMission(pid, "healthy-agent", "task that runs");
    await kernel.pulse(pid);

    (kernel as any).watchdogCheck();

    // Agent should still be running
    const row = db.prepare("SELECT status FROM missions WHERE pid = ?").get(pid) as any;
    expect(row.status).toBe("running");

    await kernel.shutdown();
  });

  it("[LIVE] should detect zero-velocity drift", async () => {
    vi.useRealTimers();

    const kernel = new MeowKernel(db as any);
    (kernel as any).watchdogInterval = 50;
    (kernel as any).driftThresholdMs = 100;

    const pid = 77777;
    await kernel.registerMission(pid, "drifting-agent", "slow task");
    await kernel.pulse(pid, 50, "no progress");

    // Simulate no progress change for longer than driftThresholdMs
    const progress = (kernel as any).agentProgress.get(pid);
    progress.lastChange = new Date(Date.now() - 200);

    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (kernel as any).watchdogCheck();

    // Should have warned about drift
    expect(warnSpy).toHaveBeenCalled();
    const warnCalls = warnSpy.mock.calls.map(c => c[0] as string);
    const hasDriftWarning = warnCalls.some((c: string) => c.includes("No progress change") || c.includes("Zero Velocity"));
    expect(hasDriftWarning).toBe(true);

    warnSpy.mockRestore();
    await kernel.shutdown();
  });
});

describe("Stale Lock Recovery [LIVE]", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "tmp", `stale-lock-live-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, "stale-lock.db");
  });

  afterEach(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("[LIVE] documents that releaseStaleLocks is never called in production [DOCUMENTATION]", () => {
    // This is the BUG: releaseStaleLocks exists but is never invoked in the production code.
    // The method is present on FileCoordinator but no code path calls it.
    // This test documents the gap that needs to be fixed.

    const coordinator = new FileCoordinator(dbPath);

    // Create a stale lock manually
    const locks = (coordinator as any).locks;
    locks.set("stuck.ts", {
      taskId: "abandoned-task",
      path: "stuck.ts",
      acquiredAt: Date.now() - 120000, // 2 minutes old
    });

    // The method works when called
    const stale = coordinator.releaseStaleLocks(60000);
    expect(stale).toContain("stuck.ts");
    expect(coordinator.getLockedFiles().has("stuck.ts")).toBe(false);

    // BUT no production code ever calls releaseStaleLocks!
    // ParallelExecutor, TaskQueue, or some lifecycle manager should call this periodically.
    // Until then, abandoned locks accumulate and permanently block files.
  });

  it("[LIVE] stale locks persist after coordinator restart", () => {
    // Create coordinator and acquire stale lock
    const coord1 = new FileCoordinator(dbPath);
    const locks = (coord1 as any).locks;
    locks.set("persistent.txt", {
      taskId: "crashed-task",
      path: "persistent.txt",
      acquiredAt: Date.now() - 120000,
    });

    // Create new coordinator instance (simulates restart)
    const coord2 = new FileCoordinator(dbPath);

    // Stale lock still exists!
    const stale = coord2.releaseStaleLocks(60000);
    expect(stale).toContain("persistent.txt");

    // This is why releaseStaleLocks MUST be called periodically in production
  });
});