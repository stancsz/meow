import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ParallelExecutor, ExecutorConfig, WorkerConfig } from "../../src/orchestrator/ParallelExecutor";
import { TaskQueue } from "../../src/orchestrator/TaskQueue";
import { FileCoordinator } from "../../src/orchestrator/FileCoordinator";
import { SwarmManager } from "../../src/swarm/SwarmManager";
import { RaftConsensus } from "../../src/swarm/consensus/RaftConsensus";
import { FedServer, FedClient } from "../../src/swarm/federation/FedHub";
import { PiiFilter } from "../../src/agent/security/PiiFilter";
import { createMockDatabase } from "../fixtures/databases";
import { makeTask } from "../fixtures/tasks";
import { Agent } from "../../src/agent/agent";
import { MeowKernel } from "../../src/kernel/kernel";

describe("Swarm Live Task Orchestrator & Federated TDD Quality Gate", () => {
  let db: any;
  let kernel: MeowKernel;
  let swarmManager: SwarmManager;
  let tempDir: string;
  let fedServer: FedServer | null = null;
  let fedClient: FedClient | null = null;
  const FED_PORT = 10123;

  beforeEach(() => {
    vi.useRealTimers();
    db = createMockDatabase();
    kernel = new MeowKernel(db);
    swarmManager = new SwarmManager(kernel, db, {
      maxConcurrentWorkers: 3,
      sessionTimeoutMs: 10000,
      heartbeatIntervalMs: 5000,
    });

    // Create a safe, isolated temporary directory within the workspace
    tempDir = path.join(process.cwd(), "tmp", `live-tasks-robustness-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(async () => {
    // Stop federation server & client if running
    if (fedClient) {
      fedClient.disconnect();
    }
    if (fedServer) {
      await fedServer.stop();
    }

    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should balance parallel workloads, handle locking backoffs, delegate federated tasks, sign consensus proposals, run real process validations, and enforce PII filters", async () => {
    // 1. Initialize our Task Queue, File Coordinator, and Parallel Executor
    const queue = new TaskQueue({ maxQueued: 50, maxConcurrent: 3 });
    const coordinator = new FileCoordinator();
    const config: ExecutorConfig = {
      maxWorkers: 3,
      taskTimeoutMs: 15000,
      enableParallelTools: true,
    };

    const executor = new ParallelExecutor(queue, coordinator, config);

    // 2. Register local workers
    const workerAlpha: WorkerConfig = {
      workerId: "worker-alpha",
      agentConfig: { model: "claude-3-5-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-mock-key" },
      kernel,
      db,
    };
    const workerBeta: WorkerConfig = {
      workerId: "worker-beta",
      agentConfig: { model: "claude-3-5-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-mock-key" },
      kernel,
      db,
    };
    executor.registerWorker(workerAlpha);
    executor.registerWorker(workerBeta);

    // 3. Set up Zero-Trust Federated Worker Peer via ed25519 WebSockets
    const clientKeys = crypto.generateKeyPairSync("ed25519");
    const serverKeys = crypto.generateKeyPairSync("ed25519");

    const clientKeyPem = clientKeys.publicKey.export({ type: "spki", format: "pem" }) as string;
    const serverKeyPem = serverKeys.publicKey.export({ type: "spki", format: "pem" }) as string;

    fedServer = new FedServer(FED_PORT, {
      publicKey: serverKeyPem,
      privateKey: serverKeys.privateKey,
    });

    // Federated server task execution handler that acts as a remote worker
    fedServer.setTaskHandler(async (task) => {
      // Simulate remote workspace processing
      const outFilePath = path.join(tempDir, "federated-report.json");
      fs.writeFileSync(outFilePath, JSON.stringify({
        status: "verified",
        author: "federated-agent@meow-swarm.org",
        token: "sk-ant-sid01-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890123456789abcdefghijklmnopqrstuvw"
      }));

      return {
        taskId: task.id,
        success: true,
        output: `Federated remote execution succeeded. Generated output with secret token sk-ant-sid01-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890123456789abcdefghijklmnopqrstuvw and contact federated-agent@meow-swarm.org.`,
        artifacts: [{ path: "federated-report.json", operation: "create" }]
      };
    });

    await fedServer.start();

    fedClient = new FedClient(`ws://localhost:${FED_PORT}`, {
      publicKey: clientKeyPem,
      privateKey: clientKeys.privateKey,
    });

    const isFederationConnected = await fedClient.connect();
    expect(isFederationConnected).toBe(true);

    // 4. Initialize ed25519 Raft Consensus Engine
    const consensus = new RaftConsensus(0.66);
    const nodeA = RaftConsensus.generateIdentity("worker-alpha");
    const nodeB = RaftConsensus.generateIdentity("worker-beta");
    const nodeC = RaftConsensus.generateIdentity("federated-worker");

    consensus.registerNode(nodeA.nodeId, nodeA.publicKey);
    consensus.registerNode(nodeB.nodeId, nodeB.publicKey);
    consensus.registerNode(nodeC.nodeId, nodeC.publicKey);

    // ── Swarm Live Tasks Setup ───────────────────────────────────────────────────

    // Task 1: Generate raw source JS file locally
    const srcFilePath = path.join(tempDir, "app.js");
    const task1 = makeTask({
      id: "task-src-gen",
      description: `Generate a math add function in ${srcFilePath}`,
      producedFiles: [{ path: srcFilePath, operation: "create" }],
    });

    // Task 2: Analyze & lint. Collides on srcFilePath, must wait/backoff until Task 1 finishes!
    const lintFilePath = path.join(tempDir, "lint-log.json");
    const task2 = makeTask({
      id: "task-lint-analysis",
      description: `Lint and verify mathematical function in ${srcFilePath}`,
      requiredFiles: [srcFilePath],
      producedFiles: [{ path: lintFilePath, operation: "create" }],
    });

    // Task 3: Independent static docs generation. Runs concurrently right away!
    const docsFilePath = path.join(tempDir, "docs.md");
    const task3 = makeTask({
      id: "task-docs-gen",
      description: `Generate markup documentation in ${docsFilePath}`,
      producedFiles: [{ path: docsFilePath, operation: "create" }],
    });

    // Task 4: Federated delegation task that runs on remote WebSocket node
    const task4 = makeTask({
      id: "task-federated-compliance",
      description: "Federated task to audit security compliance on generated assets",
    });

    // Task 5: Live Quality-Gate Validation Contract running a REAL Node subprocess to check files!
    const srcFilePathNormalized = srcFilePath.replace(/\\/g, "/");
    const task5 = makeTask({
      id: "task-tdd-gate",
      description: "Verify that all artifacts exist and compiled correctly",
      validationContract: {
        validationScript: `node -e "if (!require('fs').existsSync('${srcFilePathNormalized}')) process.exit(1); console.log('TDD Verification Succeeded: app.js exists!'); process.exit(0);"`,
        expectedOutputs: ["TDD Verification Succeeded"],
      },
    });

    // Track execution sequences
    const executionLogs: { taskId: string; event: "start" | "end" }[] = [];
    const fileConflictLogs: string[] = [];

    // Setup events callback on executor
    (executor as any).taskEvents = {
      onFileConflict: (taskId: string, conflicts: string[]) => {
        fileConflictLogs.push(taskId);
      },
    };

    // Spy on Agent.chat to capture local tasks and execute local file modifications literally
    const chatSpy = vi.spyOn(Agent.prototype, "chat").mockImplementation(async function (
      this: Agent,
      goal: string
    ) {
      let currentTaskId = "";
      if (goal.includes("Generate a math")) currentTaskId = "task-src-gen";
      else if (goal.includes("Lint and verify")) currentTaskId = "task-lint-analysis";
      else if (goal.includes("Generate markup")) currentTaskId = "task-docs-gen";
      else if (goal.includes("Verify that all")) currentTaskId = "task-tdd-gate";

      executionLogs.push({ taskId: currentTaskId, event: "start" });

      // Claim dynamically on SQLite-level Swarm Manager
      const claimed = await swarmManager.claimTaskAtomically(currentTaskId, this.runId);
      expect(claimed).toBe(true);

      // Perform actual filesystem changes
      if (currentTaskId === "task-src-gen") {
        fs.writeFileSync(srcFilePath, "function add(a, b) { return a + b; }\nmodule.exports = { add };");
        // Simulate minor processing delay to ensure overlap block triggers
        await new Promise((resolve) => setTimeout(resolve, 150));
      } else if (currentTaskId === "task-lint-analysis") {
        const fileContent = fs.readFileSync(srcFilePath, "utf8");
        const lintPass = fileContent.includes("function add");
        fs.writeFileSync(lintFilePath, JSON.stringify({ pass: lintPass, warnings: 0 }));
      } else if (currentTaskId === "task-docs-gen") {
        fs.writeFileSync(docsFilePath, "# API Documentation\nBeautiful swarm operations.");
      }

      executionLogs.push({ taskId: currentTaskId, event: "end" });
      return `Completed task ${currentTaskId} successfully.`;
    });

    // Enqueue local and TDD tasks
    queue.enqueue(task1);
    queue.enqueue(task2);
    queue.enqueue(task3);
    queue.enqueue(task5);

    // Run local pipeline
    const localResults = await executor.run();

    // Now run Federated task manually via FedClient to verify zero-trust task proxying
    const federatedResult = await fedClient.delegateTask(task4);
    
    // ── Assertions ────────────────────────────────────────────────────────────

    // 1. Assert all local and validation contract tasks completed successfully
    expect(localResults.get("task-src-gen")?.success).toBe(true);
    expect(localResults.get("task-lint-analysis")?.success).toBe(true);
    expect(localResults.get("task-docs-gen")?.success).toBe(true);
    expect(localResults.get("task-tdd-gate")?.success).toBe(true);

    // 2. Verify that TDD validation contract passed process checks and expectedOutputs
    const tddResult = localResults.get("task-tdd-gate")!;
    expect(tddResult.passes).toBe(true);
    expect(tddResult.output).toContain("TDD Verification Succeeded");

    // 3. Verify files actually exist in the tempDir directory
    expect(fs.existsSync(srcFilePath)).toBe(true);
    expect(fs.existsSync(lintFilePath)).toBe(true);
    expect(fs.existsSync(docsFilePath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "federated-report.json"))).toBe(true);

    // 4. Assert that Task 2 (task-lint-analysis) was blocked and re-queued by Task 1 (task-src-gen)
    expect(fileConflictLogs).toContain("task-lint-analysis");

    const t1Start = executionLogs.findIndex(x => x.taskId === "task-src-gen" && x.event === "start");
    const t1End = executionLogs.findIndex(x => x.taskId === "task-src-gen" && x.event === "end");
    const t2Start = executionLogs.findIndex(x => x.taskId === "task-lint-analysis" && x.event === "start");

    expect(t1Start).toBeLessThan(t1End);
    expect(t1End).toBeLessThan(t2Start); // File locking enforced sequential execution!

    // 5. Verify the Federated task execution returned successfully over ed25519 WebSockets
    expect(federatedResult.success).toBe(true);
    expect(federatedResult.output).toContain("Federated remote execution succeeded");

    // 6. Verify PiiFilter scrubbing of federated outputs to prevent leaking secrets/credentials
    const piiFilter = new PiiFilter("REDACT");
    const sanitizedOutput = piiFilter.filter(federatedResult.output || "");

    expect(sanitizedOutput).toContain("[REDACTED_EMAIL]");
    expect(sanitizedOutput).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(sanitizedOutput).not.toContain("federated-agent@meow-swarm.org");
    expect(sanitizedOutput).not.toContain("sk-ant-sid01");

    // 7. Verify ed25519 Raft Consensus proposal validation voting
    const proposal = consensus.createProposal(srcFilePath, fs.readFileSync(srcFilePath, "utf8"), "worker-alpha");
    
    // cast votes using the generated private keys
    consensus.castVote(proposal.id, "worker-alpha", true, nodeA.privateKey!);
    consensus.castVote(proposal.id, "worker-beta", true, nodeB.privateKey!);
    consensus.castVote(proposal.id, "federated-worker", true, nodeC.privateKey!);

    const checkConsensus = consensus.checkConsensus(proposal.id);
    expect(checkConsensus.reached).toBe(true);
    expect(checkConsensus.approvals).toBe(3);
    expect(checkConsensus.verifiedVotesCount).toBe(3);

    // Clean up spy
    chatSpy.mockRestore();
  });
});
