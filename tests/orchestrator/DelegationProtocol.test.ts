import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DelegationProtocol } from "../../src/orchestrator/DelegationProtocol";
import { Task } from "../../src/orchestrator/Task";

describe("DelegationProtocol", () => {
  const auditLogPath = path.join(process.cwd(), '.meow', 'logs', 'delegation-audit.jsonl');

  beforeEach(() => {
    // Clear audit log before each test
    try {
      if (fs.existsSync(auditLogPath)) {
        fs.unlinkSync(auditLogPath);
      }
    } catch {}
  });

  afterEach(() => {
    // Cleanup
    try {
      if (fs.existsSync(auditLogPath)) {
        fs.unlinkSync(auditLogPath);
      }
    } catch {}
  });

  describe("getDelegate", () => {
    it("should correctly map source files to claude", () => {
      expect(DelegationProtocol.getDelegate("app.ts")).toBe("claude");
      expect(DelegationProtocol.getDelegate("server.js")).toBe("claude");
      expect(DelegationProtocol.getDelegate("main.py")).toBe("claude");
      expect(DelegationProtocol.getDelegate("main.rs")).toBe("claude");
    });

    it("should route CSS to browseros", () => {
      expect(DelegationProtocol.getDelegate("styles.css")).toBe("browseros");
      expect(DelegationProtocol.getDelegate("styles.scss")).toBe("browseros");
    });

    it("should fall back to claude for non-source, non-css files", () => {
      expect(DelegationProtocol.getDelegate("index.html")).toBe("claude");
      expect(DelegationProtocol.getDelegate("README.md")).toBe("claude");
      expect(DelegationProtocol.getDelegate("config.json")).toBe("claude");
    });
  });

  describe("determineSpecialistForTask and logDecision", () => {
    it("should map a task with web files to browseros and log it", () => {
      const task: Task = {
        id: "test-task-1",
        description: "Fix button alignment",
        priority: "medium",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 10000,
        status: "pending",
        producedFiles: [
          { path: "styles.css", operation: "update" }
        ]
      };

      const specialist = DelegationProtocol.determineSpecialistForTask(task);
      expect(specialist).toBe("browseros");

      // Verify that audit log has been written
      expect(fs.existsSync(auditLogPath)).toBe(true);
      const logContent = fs.readFileSync(auditLogPath, "utf8");
      const lastLine = logContent.trim().split('\n').filter(Boolean).at(-1)!;
      const parsedLog = JSON.parse(lastLine);
      expect(parsedLog.taskId).toBe("test-task-1");
      expect(parsedLog.assignedSpecialist).toBe("browseros");
      expect(parsedLog.files).toContain("styles.css");
    });

    it("should map a task with required source files to claude and log it", () => {
      const task: Task = {
        id: "test-task-2",
        description: "Implement logic",
        priority: "high",
        dependencies: [],
        createdAt: Date.now(),
        maxRetries: 2,
        timeoutMs: 10000,
        status: "pending",
        requiredFiles: ["src/index.ts"]
      };

      const specialist = DelegationProtocol.determineSpecialistForTask(task);
      expect(specialist).toBe("claude");

      expect(fs.existsSync(auditLogPath)).toBe(true);
      const logContent = fs.readFileSync(auditLogPath, "utf8");
      const lastLine = logContent.trim().split('\n').filter(Boolean).at(-1)!;
      const parsedLog = JSON.parse(lastLine);
      expect(parsedLog.taskId).toBe("test-task-2");
      expect(parsedLog.assignedSpecialist).toBe("claude");
      expect(parsedLog.files).toContain("src/index.ts");
    });
  });
});
