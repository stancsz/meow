// File write conflict prevention with SQLite blocking locks

import Database, { Database as DatabaseType } from "better-sqlite3";
import { FileArtifact } from "./Task";

interface FileLock {
  path: string;
  taskId: string;
  acquiredAt: number;
}

interface FileCoordinationResult {
  allowed: boolean;
  conflicts: string[];
  grantedLocks: FileLock[];
}

export class FileCoordinator {
  private db: DatabaseType | null = null;
  private inMemoryLocks: Map<string, FileLock> = new Map();
  private useSqlite = true;

  public get locks(): {
    set(key: string, value: FileLock): void;
    has(key: string): boolean;
    get(key: string): FileLock | undefined;
  } {
    const self = this;
    return {
      set(key: string, value: FileLock) {
        if (!self.useSqlite || !self.db) {
          self.inMemoryLocks.set(key, value);
          return;
        }
        try {
          self.db.prepare(
            "INSERT OR REPLACE INTO file_locks (path, task_id, acquired_at) VALUES (?, ?, ?)"
          ).run(key, value.taskId, value.acquiredAt);
        } catch {
          self.inMemoryLocks.set(key, value);
        }
      },
      has(key: string): boolean {
        return self.getLocks().has(key);
      },
      get(key: string): FileLock | undefined {
        const lock = self.getLocks().get(key);
        if (!lock) return undefined;
        return new Proxy(lock, {
          set(target, prop, val) {
            (target as any)[prop] = val;
            if (self.useSqlite && self.db) {
              try {
                self.db.prepare(
                  "INSERT OR REPLACE INTO file_locks (path, task_id, acquired_at) VALUES (?, ?, ?)"
                ).run(target.path, target.taskId, target.acquiredAt);
              } catch {}
            } else {
              self.inMemoryLocks.set(target.path, target);
            }
            return true;
          }
        });
      }
    };
  }

  constructor(dbPath?: string) {
    try {
      this.db = new Database(dbPath || ":memory:");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS file_locks (
          path TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL
        )
      `);
      console.log("[FileCoordinator] SQLite lock manager initialized");
    } catch (err) {
      console.warn("[FileCoordinator] SQLite unavailable, falling back to in-memory locks:", err);
      this.useSqlite = false;
    }
  }

  private getLocks(): Map<string, FileLock> {
    if (!this.useSqlite || !this.db) return this.inMemoryLocks;

    const locks = new Map<string, FileLock>();
    try {
      const rows = this.db.prepare("SELECT path, task_id, acquired_at FROM file_locks").all() as {
        path: string;
        task_id: string;
        acquired_at: number;
      }[];
      for (const row of rows) {
        locks.set(row.path, {
          path: row.path,
          taskId: row.task_id,
          acquiredAt: row.acquired_at,
        });
      }
    } catch {
      return this.inMemoryLocks;
    }
    return locks;
  }

  public async acquire(path: string, taskId: string): Promise<boolean> {
    if (!this.useSqlite || !this.db) {
      const existing = this.inMemoryLocks.get(path);
      if (existing && existing.taskId !== taskId) return false;
      this.inMemoryLocks.set(path, { path, taskId, acquiredAt: Date.now() });
      return true;
    }

    try {
      const stmt = this.db.prepare("BEGIN IMMEDIATE");
      stmt.run();

      const row = this.db.prepare("SELECT task_id FROM file_locks WHERE path = ?").get(path) as
        | { task_id: string }
        | undefined;

      if (row && row.task_id !== taskId) {
        this.db.prepare("COMMIT").run();
        return false;
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO file_locks (path, task_id, acquired_at) VALUES (?, ?, ?)"
        )
        .run(path, taskId, Date.now());
      this.db.prepare("COMMIT").run();
      return true;
    } catch {
      try {
        this.db?.prepare("ROLLBACK").run();
      } catch {}
      return false;
    }
  }

  public release(taskId: string): void {
    if (!this.useSqlite || !this.db) {
      for (const [path, lock] of this.inMemoryLocks) {
        if (lock.taskId === taskId) {
          this.inMemoryLocks.delete(path);
        }
      }
      return;
    }

    try {
      this.db.prepare("DELETE FROM file_locks WHERE task_id = ?").run(taskId);
    } catch {
      for (const [path, lock] of this.getLocks()) {
        if (lock.taskId === taskId) {
          this.inMemoryLocks.delete(path);
        }
      }
    }
  }

  public requestAccess(taskId: string, artifacts: FileArtifact[]): FileCoordinationResult {
    const conflicts: string[] = [];
    const grantedLocks: FileLock[] = [];

    for (const artifact of artifacts) {
      const existingLock = this.getLocks().get(artifact.path);

      if (existingLock && existingLock.taskId !== taskId) {
        conflicts.push(
          `Task ${taskId} wants to access ${artifact.path}, but ${existingLock.taskId} is already writing it`
        );
        continue;
      }

      const lock: FileLock = {
        taskId,
        path: artifact.path,
        acquiredAt: Date.now(),
      };
      grantedLocks.push(lock);
    }

    // Atomic: If there are ANY conflicts, do NOT persist any locks
    if (conflicts.length > 0) {
      return {
        allowed: false,
        conflicts,
        grantedLocks: [],
      };
    }

    for (const lock of grantedLocks) {
      if (this.useSqlite && this.db) {
        try {
          this.db
            .prepare(
              "INSERT OR REPLACE INTO file_locks (path, task_id, acquired_at) VALUES (?, ?, ?)"
            )
            .run(lock.path, lock.taskId, lock.acquiredAt);
        } catch {
          this.inMemoryLocks.set(lock.path, lock);
        }
      } else {
        this.inMemoryLocks.set(lock.path, lock);
      }
    }

    return {
      allowed: true,
      conflicts,
      grantedLocks,
    };
  }

  public wouldConflict(taskId: string, artifacts: FileArtifact[]): string[] {
    const conflicts: string[] = [];

    for (const artifact of artifacts) {
      const existingLock = this.getLocks().get(artifact.path);

      if (existingLock && existingLock.taskId !== taskId) {
        conflicts.push(`${artifact.path} is held by ${existingLock.taskId}`);
      }
    }

    return conflicts;
  }

  public getLockedFiles(): Map<string, FileLock> {
    return new Map(this.getLocks());
  }

  public releaseStaleLocks(maxAgeMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];

    if (!this.useSqlite || !this.db) {
      for (const [path, lock] of this.inMemoryLocks) {
        if (now - lock.acquiredAt > maxAgeMs) {
          this.inMemoryLocks.delete(path);
          stale.push(path);
        }
      }
      return stale;
    }

    try {
      const rows = this.db
        .prepare("SELECT path FROM file_locks WHERE ? - acquired_at > ?")
        .all(now, maxAgeMs) as { path: string }[];
      for (const row of rows) {
        stale.push(row.path);
      }
      this.db.prepare("DELETE FROM file_locks WHERE ? - acquired_at > ?").run(now, maxAgeMs);
    } catch {
      const locks = this.getLocks();
      for (const [path, lock] of locks) {
        if (now - lock.acquiredAt > maxAgeMs) {
          this.inMemoryLocks.delete(path);
          stale.push(path);
        }
      }
    }

    return stale;
  }
}