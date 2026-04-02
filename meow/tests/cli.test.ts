/**
 * meow CLI Live Tests
 *
 * Real integration tests using actual API keys from .env
 * Run with: bun test
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Load .env
function loadEnv() {
  const envPath = join(process.cwd(), "../../.env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join("=").trim();
        }
      }
    }
  }
}

loadEnv();

// Import after env is loaded
import { runLeanAgent } from "../src/core/lean-agent.ts";
import { listTasks, addTask, completeTask, deleteTask } from "../src/core/task-store.ts";
import { createSession, appendToSession, loadSession, listSessions } from "../src/core/session-store.ts";
import { glob, grep } from "../src/tools/search.ts";
import { skills, findSkill } from "../src/skills/index.ts";

// ============================================================================
// Test Config
// ============================================================================

const TEST_DIR = join(process.cwd(), "test-output");
const TEST_FILE = join(TEST_DIR, "test.txt");
const TEST_TS_FILE = join(TEST_DIR, "test.ts");

const REQUIRED_ENV_VARS = ["LLM_API_KEY"];

function skipIfNoApiKey() {
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === "sk-your-key-here") {
    test.skip("LLM_API_KEY not configured", () => {});
  }
}

beforeAll(() => {
  // Ensure test directory exists
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  // Write test files
  writeFileSync(TEST_FILE, "Hello World\nTest Content\n", "utf-8");
  writeFileSync(TEST_TS_FILE, `interface Test {\n  name: string;\n}\nconst test: Test = { name: "hello" };\n`, "utf-8");
});

afterAll(() => {
  // Cleanup test files
  try {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
    if (existsSync(TEST_TS_FILE)) unlinkSync(TEST_TS_FILE);
    if (existsSync(TEST_DIR)) {
      const files = ["test.txt", "test.ts"];
      // already cleaned
    }
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================================
// Tool Tests: read
// ============================================================================

describe("Tool: read", () => {
  test("should read a file", async () => {
    const result = await runLeanAgent(`Read the file at ${TEST_FILE} and tell me its contents`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("Hello World");
  });

  test("should handle non-existent file gracefully", async () => {
    const result = await runLeanAgent(`Read the file /nonexistent/file.txt`, {
      dangerous: false,
      maxIterations: 2,
    });
    // Should complete but with error in content
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Tool Tests: write
// ============================================================================

describe("Tool: write", () => {
  test("should write content to a file", async () => {
    const testPath = join(TEST_DIR, "write-test.txt");
    const result = await runLeanAgent(`Write "Test content" to ${testPath}`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    if (existsSync(testPath)) {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("Test content");
      unlinkSync(testPath);
    }
  });
});

// ============================================================================
// Tool Tests: git
// ============================================================================

describe("Tool: git", () => {
  test("should get git status", async () => {
    const result = await runLeanAgent("Run git status and tell me what files have changed", {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    // Git status output should be present
    expect(result.content).toBeTruthy();
  });

  test("should get git log", async () => {
    const result = await runLeanAgent("Run git log --oneline -3 and show me recent commits", {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toBeTruthy();
  });

  test("should get git diff", async () => {
    const result = await runLeanAgent("Run git diff --stat to show changed files", {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Tool Tests: glob
// ============================================================================

describe("Tool: glob", () => {
  test("should find .ts files", async () => {
    const result = await glob({ pattern: "*.ts", cwd: TEST_DIR });
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("test.ts");
  });

  test("should find all files", async () => {
    const result = await glob({ pattern: "*", cwd: TEST_DIR });
    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Tool Tests: grep
// ============================================================================

describe("Tool: grep", () => {
  test("should grep for content", async () => {
    const result = await grep({ pattern: "Hello", path: TEST_FILE });
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Hello World");
  });

  test("should grep recursively", async () => {
    const result = await grep({ pattern: "interface", path: TEST_DIR, recursive: true });
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Test");
  });
});

// ============================================================================
// Tool: shell (dangerous mode)
// ============================================================================

describe("Tool: shell (dangerous)", () => {
  test("should execute shell command when dangerous=true", async () => {
    const result = await runLeanAgent("Run echo 'Hello from shell' and show the output", {
      dangerous: true,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("Hello from shell");
  });

  test("should block shell when dangerous=false", async () => {
    const result = await runLeanAgent("Run echo 'This should be blocked'", {
      dangerous: false,
      maxIterations: 2,
    });
    // Should complete but with blocked message
    expect(result.content).toContain("BLOCKED");
  });
});

// ============================================================================
// Task Store Tests
// ============================================================================

describe("Task Store", () => {
  test("should add a task", () => {
    const task = addTask("Test task");
    expect(task.id).toMatch(/^t\d+$/);
    expect(task.content).toBe("Test task");
    expect(task.status).toBe("pending");
    // Cleanup
    deleteTask(task.id);
  });

  test("should list tasks", () => {
    const task = addTask("List test task");
    const tasks = listTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((t) => t.id === task.id)).toBe(true);
    // Cleanup
    deleteTask(task.id);
  });

  test("should complete a task", () => {
    const task = addTask("Complete test task");
    const completed = completeTask(task.id);
    expect(completed).toBeTruthy();
    expect(completed?.status).toBe("completed");
    // Cleanup
    deleteTask(task.id);
  });

  test("should return null for non-existent task", () => {
    const result = completeTask("nonexistent-id");
    expect(result).toBeNull();
  });
});

// ============================================================================
// Session Store Tests
// ============================================================================

describe("Session Store", () => {
  const testSessionId = `test_session_${Date.now()}`;

  test("should create a session", () => {
    const id = createSession();
    expect(id).toMatch(/^session_\d+$/);
  });

  test("should append and load session messages", () => {
    const messages = [
      { role: "user" as const, content: "Test message", timestamp: new Date().toISOString() },
    ];
    appendToSession(testSessionId, messages);
    const loaded = loadSession(testSessionId);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded[0].content).toBe("Test message");
  });

  test("should list sessions", () => {
    const sessions = listSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toHaveProperty("id");
    expect(sessions[0]).toHaveProperty("preview");
    expect(sessions[0]).toHaveProperty("timestamp");
  });
});

// ============================================================================
// Skills Tests
// ============================================================================

describe("Skills", () => {
  test("should have simplify skill", () => {
    const skill = findSkill("simplify");
    expect(skill).toBeTruthy();
    expect(skill?.name).toBe("simplify");
  });

  test("should have review skill", () => {
    const skill = findSkill("review");
    expect(skill).toBeTruthy();
    expect(skill?.name).toBe("review");
  });

  test("should have commit skill", () => {
    const skill = findSkill("commit");
    expect(skill).toBeTruthy();
    expect(skill?.name).toBe("commit");
  });

  test("should find skill by alias", () => {
    const skill = findSkill("cr"); // alias for review
    expect(skill).toBeTruthy();
  });
});

// ============================================================================
// Simplify Skill Integration Test
// ============================================================================

describe("Skill: simplify (integration)", () => {
  skipIfNoApiKey();

  test("should simplify TypeScript code", async () => {
    const skill = findSkill("simplify");
    expect(skill).toBeTruthy();

    const result = await skill!.execute(TEST_TS_FILE, { cwd: process.cwd(), dangerous: false });
    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Review Skill Integration Test
// ============================================================================

describe("Skill: review (integration)", () => {
  skipIfNoApiKey();

  test("should review TypeScript code", async () => {
    const skill = findSkill("review");
    expect(skill).toBeTruthy();

    const result = await skill!.execute(TEST_TS_FILE, { cwd: process.cwd(), dangerous: false });
    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Commit Skill Integration Test
// ============================================================================

describe("Skill: commit (integration)", () => {
  skipIfNoApiKey();

  test("should show git status for commit", async () => {
    const skill = findSkill("commit");
    expect(skill).toBeTruthy();

    const result = await skill!.execute("", { cwd: process.cwd(), dangerous: true });
    expect(result.error).toBeUndefined();
    // Should show conventional commit types or git status
    expect(result.content).toBeTruthy();
  });
});

// ============================================================================
// Full Agent Integration Tests
// ============================================================================

describe("Lean Agent (full integration)", () => {
  skipIfNoApiKey();

  test("should respond to simple greeting", async () => {
    const result = await runLeanAgent("Say hello in 5 words or less", {
      dangerous: false,
      maxIterations: 2,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toBeTruthy();
  });

  test("should use read tool", async () => {
    const result = await runLeanAgent(`Read the file ${TEST_FILE} and summarize it`, {
      dangerous: false,
      maxIterations: 4,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("Hello World");
  });

  test("should use glob tool", async () => {
    const result = await runLeanAgent(`Find all .txt files in ${TEST_DIR} using glob`, {
      dangerous: false,
      maxIterations: 4,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("test.txt");
  });

  test("should use grep tool", async () => {
    const result = await runLeanAgent(`Search for "Hello" in ${TEST_FILE} using grep`, {
      dangerous: false,
      maxIterations: 4,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("Hello");
  });

  test("should use git tool", async () => {
    const result = await runLeanAgent("Use git to show the current branch name", {
      dangerous: false,
      maxIterations: 4,
    });
    expect(result.completed).toBe(true);
    // Should contain branch info
    expect(result.content).toBeTruthy();
  });

  test("should respect max iterations", async () => {
    // This is a prompt that would need many iterations
    const result = await runLeanAgent("Count from 1 to 100", {
      dangerous: false,
      maxIterations: 1,
    });
    // Should hit max iterations
    expect(result.iterations).toBeLessThanOrEqual(1);
  });

  test("should handle abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runLeanAgent("Say hello", {
      dangerous: false,
      maxIterations: 3,
      abortSignal: controller.signal,
    });
    expect(result.content).toBe("Interrupted");
  });
});

// ============================================================================
// CLI Command Parity Tests
// ============================================================================

describe("Claude Code CLI parity", () => {
  skipIfNoApiKey();

  // Claude Code has: read, write, shell, git, glob, grep
  // Meow should have the same core tools

  test("Meow has read tool - matches Claude Code", async () => {
    const result = await runLeanAgent(`Read the file ${TEST_FILE}`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("Hello");
  });

  test("Meow has write tool - matches Claude Code", async () => {
    const testPath = join(TEST_DIR, "parity-write-test.txt");
    const result = await runLeanAgent(`Write "parity test" to ${testPath}`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    if (existsSync(testPath)) {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("parity test");
      unlinkSync(testPath);
    }
  });

  test("Meow has git tool - matches Claude Code", async () => {
    const result = await runLeanAgent("Run git status", {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toBeTruthy();
  });

  test("Meow has glob tool - matches Claude Code", async () => {
    const result = await runLeanAgent(`Use glob to find *.txt files in ${TEST_DIR}`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("test.txt");
  });

  test("Meow has grep tool - matches Claude Code", async () => {
    const result = await runLeanAgent(`Use grep to find "World" in ${TEST_FILE}`, {
      dangerous: false,
      maxIterations: 3,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("World");
  });

  test("Meow has shell (dangerous) - matches Claude Code", async () => {
    const result = await runLeanAgent("Run echo 'shell works'", {
      dangerous: true,
      maxIterations: 2,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toContain("shell works");
  });
});

// ============================================================================
// Slash Commands Parity Tests (via agent)
// ============================================================================

describe("Slash Commands (via agent simulation)", () => {
  skipIfNoApiKey();

  test("Meow /help equivalent - list available commands", async () => {
    // The agent should know about its own commands
    const result = await runLeanAgent("What commands are available to you?", {
      dangerous: false,
      maxIterations: 2,
    });
    expect(result.completed).toBe(true);
    expect(result.content).toBeTruthy();
  });

  test("Meow /skills equivalent - list available skills", async () => {
    // Skills should be advertised
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.map((s) => s.name)).toContain("simplify");
    expect(skills.map((s) => s.name)).toContain("review");
    expect(skills.map((s) => s.name)).toContain("commit");
  });

  test("Meow /tasks equivalent - task management", async () => {
    const task = addTask("CLI parity test task");
    const tasks = listTasks();
    expect(tasks.some((t) => t.content === "CLI parity test task")).toBe(true);
    completeTask(task.id);
    const completed = completeTask(task.id);
    expect(completed?.status).toBe("completed");
    deleteTask(task.id);
  });

  test("Meow /sessions equivalent - session management", async () => {
    const sessions = listSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toHaveProperty("id");
    expect(sessions[0].id).toMatch(/^session_\d+$/);
  });
});
