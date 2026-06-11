import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { FaultConfig, FaultInjector } from "../utils/fault-injection";

export interface E2EHarnessOptions {
  /** Working directory for the test environment */
  workingDir?: string;
  /** Environment variables for subprocess */
  env?: Record<string, string>;
  /** Delay before spawning (ms) */
  spawnDelay?: number;
  /** Fault injector for chaos testing */
  faultInjector?: FaultInjector;
  /** Custom entry point */
  entryPoint?: string;
}

export interface ProcessResult {
  pid: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * E2E Harness for spawning and managing test subprocesses.
 * Provides fault injection capabilities for chaos testing.
 */
export class E2EHarness extends EventEmitter {
  private processes: Map<number, ChildProcess> = new Map();
  private outputs: Map<number, { stdout: string; stderr: string }> = new Map();
  private options: E2EHarnessOptions;

  constructor(options: E2EHarnessOptions = {}) {
    super();
    this.options = {
      workingDir: process.cwd(),
      env: {},
      spawnDelay: 0,
      ...options,
    };
  }

  /**
   * Spawn a specialist subprocess.
   */
  async spawnSpecialist(
    type: "claude" | "aider" | "meow",
    goal: string,
    options?: { timeout?: number; faultConfig?: FaultConfig }
  ): Promise<ProcessResult> {
    const { workingDir, env, spawnDelay } = this.options;

    if (spawnDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, spawnDelay));
    }

    let cmd: string;
    let args: string[];
    let entryPoint = this.options.entryPoint || "bin/meow.ts";

    if (type === "meow") {
      const isWindows = process.platform === "win32";
      // Use node directly with tsx module - tsx has a .mjs entry point
      const tsxPath = path.join(workingDir, "node_modules", "tsx", "dist", "cli.mjs");
      cmd = "node";
      args = [tsxPath, entryPoint];
    } else {
      // For claude/aider, we use the system PATH
      cmd = type;
      args = [];
    }

    const envVars = { ...process.env, ...env };
    const timeout = options?.timeout || 120000;

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: workingDir,
        env: envVars,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const pid = child.pid!;
      this.processes.set(pid, child);
      this.outputs.set(pid, { stdout: "", stderr: "" });

      const startTime = Date.now();
      let timedOut = false;

      child.stdout?.on("data", (data) => {
        const text = data.toString();
        this.outputs.get(pid)!.stdout += text;
        this.emit("stdout", pid, text);
      });

      child.stderr?.on("data", (data) => {
        const text = data.toString();
        this.outputs.get(pid)!.stderr += text;
        this.emit("stderr", pid, text);
      });

      child.on("error", (err) => {
        this.emit("error", pid, err);
      });

      child.on("exit", (code) => {
        const elapsed = Date.now() - startTime;
        resolve({
          pid,
          stdout: this.outputs.get(pid)?.stdout || "",
          stderr: this.outputs.get(pid)?.stderr || "",
          exitCode: code,
          timedOut: elapsed > timeout,
        });
        this.processes.delete(pid);
      });

      // Timeout handler
      setTimeout(() => {
        if (this.processes.has(pid)) {
          timedOut = true;
          child.kill("SIGTERM");
          resolve({
            pid,
            stdout: this.outputs.get(pid)?.stdout || "",
            stderr: this.outputs.get(pid)?.stderr || "",
            exitCode: null,
            timedOut: true,
          });
        }
      }, timeout);
    });
  }

  /**
   * Spawn a meow process for E2E testing with a specific goal.
   */
  async spawnMeowForGoal(
    goal: string,
    options?: { timeout?: number; faultConfig?: FaultConfig }
  ): Promise<ProcessResult> {
    // Inject goal as environment variable for test harness
    const env = {
      ...this.options.env,
      MEOW_TEST_GOAL: goal,
    };

    return this.spawnSpecialist("meow", goal, options);
  }

  /**
   * Terminate all managed processes.
   */
  async terminateAll(): Promise<void> {
    const terminatePromises: Promise<void>[] = [];
    for (const [pid, child] of this.processes) {
      terminatePromises.push(
        new Promise((resolve) => {
          child.kill("SIGTERM");
          child.on("exit", () => resolve());
          setTimeout(resolve, 5000); // Give up after 5s
        })
      );
    }
    await Promise.all(terminatePromises);
    this.processes.clear();
  }

  /**
   * Get a process by PID.
   */
  getProcess(pid: number): ChildProcess | undefined {
    return this.processes.get(pid);
  }

  /**
   * Get output for a process.
   */
  getOutput(pid: number): { stdout: string; stderr: string } | undefined {
    return this.outputs.get(pid);
  }

  /**
   * Check if a process is still running.
   */
  isRunning(pid: number): boolean {
    return this.processes.has(pid);
  }

  /**
   * Get count of active processes.
   */
  getActiveCount(): number {
    return this.processes.size;
  }
}

/**
 * Create a sandboxed E2E test environment.
 */
export function createSandbox(path: string): string {
  const sandboxPath = path;

  // Ensure scratch directory exists
  if (!fs.existsSync(sandboxPath)) {
    fs.mkdirSync(sandboxPath, { recursive: true });
  }

  return sandboxPath;
}

/**
 * Clean up a sandboxed environment.
 */
export function cleanSandbox(sandboxPath: string): void {
  if (fs.existsSync(sandboxPath)) {
    fs.rmSync(sandboxPath, { recursive: true, force: true });
  }
}

/**
 * Setup a clean E2E environment for testing.
 */
export function setupE2EEnvironment(sandboxPath: string): void {
  createSandbox(sandboxPath);

  // Ensure required directories exist
  const dirs = [".meow", ".meow/logs"];
  for (const dir of dirs) {
    const dirPath = path.join(sandboxPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

/**
 * Default E2E harness options for meow.
 */
export const defaultE2HarnessOptions: E2EHarnessOptions = {
  workingDir: process.cwd(),
  spawnDelay: 1000, // Give time for initialization
};
