import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { ManifestLoader } from "../../src/extensions/plugins/ManifestLoader";
import { summon, DYNAMIC_SPECIALISTS, SPECIALISTS, ensureManifestsLoaded } from "../../src/agent/summoner";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";

describe("Pluggable Specialists and Dynamic Manifest Loader", () => {
  const tempPluginsDir = path.join(process.cwd(), "temp_plugins");

  beforeEach(() => {
    vi.useRealTimers();
    if (fs.existsSync(tempPluginsDir)) {
      fs.rmSync(tempPluginsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempPluginsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempPluginsDir)) {
      fs.rmSync(tempPluginsDir, { recursive: true, force: true });
    }
    // Clean up dynamic registry
    for (const key of Object.keys(DYNAMIC_SPECIALISTS)) {
      delete DYNAMIC_SPECIALISTS[key];
    }
  });

  it("should dynamically scan the plugins directory and register agent capabilities", async () => {
    const pluginId = "ts-test-expert";
    const pluginDir = path.join(tempPluginsDir, pluginId);
    fs.mkdirSync(pluginDir, { recursive: true });

    const manifestContent = {
      id: pluginId,
      name: "TS Test Expert",
      description: "A specialist for TypeScript assertions",
      commandTemplate: "node -e \"console.log('TS Specialist: {goal}')\"",
    };

    fs.writeFileSync(
      path.join(pluginDir, "manifest.json"),
      JSON.stringify(manifestContent, null, 2),
      "utf8"
    );

    const loader = new ManifestLoader(tempPluginsDir);
    const dynamicAgents = await loader.loadManifests();

    expect(dynamicAgents.has(pluginId)).toBe(true);
    const agent = dynamicAgents.get(pluginId)!;
    expect(agent.name).toBe("TS Test Expert");
    expect(agent.description).toBe("A specialist for TypeScript assertions");
    
    const context = { goal: "Verify imports", files: ["src/index.ts"] };
    const command = agent.getCommand(context);
    expect(command).toBe("node -e \"console.log('TS Specialist: Verify imports')\"");
  });

  it("should fall back gracefully if manifest is invalid or missing required fields", async () => {
    const pluginDir = path.join(tempPluginsDir, "invalid-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });

    // Missing commandTemplate
    const manifestContent = {
      id: "invalid-plugin",
      name: "Invalid",
      description: "Oops",
    };

    fs.writeFileSync(
      path.join(pluginDir, "manifest.json"),
      JSON.stringify(manifestContent, null, 2),
      "utf8"
    );

    const loader = new ManifestLoader(tempPluginsDir);
    const dynamicAgents = await loader.loadManifests();
    expect(dynamicAgents.size).toBe(0);
  });
});

describe("Pre-Hoc Validation Contracts & Quality Gates", () => {
  it("should execute task and mark success if validation contract passes", async () => {
    const queue = new TaskQueue({ maxQueued: 10, maxConcurrent: 1 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 1,
      taskTimeoutMs: 5000,
      enableParallelTools: false,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);
    const mockDb = createMockDatabase();
    const worker: WorkerConfig = {
      workerId: "w1",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    executor.registerWorker(worker);

    // Create a task that has a validation script which passes (exit code 0)
    const task = makeTask({
      id: "val-success",
      description: "Task with passing validation",
      toolName: "diff", // Avoid LLM Agent chat calls
      validationContract: {
        validationScript: "node -e \"console.log('All criteria met!'); process.exit(0);\"",
        expectedOutputs: ["criteria met"],
      },
    });

    // Mock tool execution
    const { DEFAULT_TOOLS } = await import("../../src/types/tool");
    const testTool = DEFAULT_TOOLS.find(t => t.name === "diff");
    const testToolSpy = vi.spyOn(testTool!, "execute").mockResolvedValue("Tool Output");

    queue.enqueue(task);
    const results = await executor.run();

    const result = results.get("val-success")!;
    expect(result.success).toBe(true);
    expect(result.passes).toBe(true);
    expect(result.output).toContain("Validation contract passed");
    expect(result.output).toContain("All criteria met!");

    testToolSpy.mockRestore();
  });

  it("should fail task execution if validation contract script fails", async () => {
    const queue = new TaskQueue({ maxQueued: 10, maxConcurrent: 1 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 1,
      taskTimeoutMs: 5000,
      enableParallelTools: false,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);
    const mockDb = createMockDatabase();
    const worker: WorkerConfig = {
      workerId: "w1",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    executor.registerWorker(worker);

    // Create a task that has a validation script which fails (exit code 1)
    const task = makeTask({
      id: "val-fail",
      description: "Task with failing validation",
      toolName: "diff",
      validationContract: {
        validationScript: "node -e \"console.error('Syntax Error in test!'); process.exit(1);\"",
      },
    });

    // Mock tool execution
    const { DEFAULT_TOOLS } = await import("../../src/types/tool");
    const testTool = DEFAULT_TOOLS.find(t => t.name === "diff");
    const testToolSpy = vi.spyOn(testTool!, "execute").mockResolvedValue("Tool Output");

    queue.enqueue(task);
    const results = await executor.run();

    const result = results.get("val-fail")!;
    expect(result.success).toBe(false);
    expect(result.passes).toBe(false);
    expect(result.error).toContain("Validation contract failed");
    expect(result.error).toContain("Syntax Error in test!");

    testToolSpy.mockRestore();
  });

  it("should fail task execution if expected assertions are missing in output", async () => {
    const queue = new TaskQueue({ maxQueued: 10, maxConcurrent: 1 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 1,
      taskTimeoutMs: 5000,
      enableParallelTools: false,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);
    const mockDb = createMockDatabase();
    const worker: WorkerConfig = {
      workerId: "w1",
      agentConfig: { model: "m", baseUrl: "b", apiKey: "k" },
      kernel: {} as any,
      db: mockDb,
    };
    executor.registerWorker(worker);

    // Expected output "SUCCESSFUL_MATCH" is missing
    const task = makeTask({
      id: "val-assertion-fail",
      description: "Task with missing assertion",
      toolName: "diff",
      validationContract: {
        validationScript: "node -e \"console.log('Completed without match.');\"",
        expectedOutputs: ["SUCCESSFUL_MATCH"],
      },
    });

    const { DEFAULT_TOOLS } = await import("../../src/types/tool");
    const testTool = DEFAULT_TOOLS.find(t => t.name === "diff");
    const testToolSpy = vi.spyOn(testTool!, "execute").mockResolvedValue("Tool Output");

    queue.enqueue(task);
    const results = await executor.run();

    const result = results.get("val-assertion-fail")!;
    expect(result.success).toBe(false);
    expect(result.passes).toBe(false);
    expect(result.error).toContain("Assertion Fail");

    testToolSpy.mockRestore();
  });
});
