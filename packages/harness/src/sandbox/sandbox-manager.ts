/**
 * Sandbox Manager - XL-22
 * Process-level security for swarm agents using Docker containers
 */

import { spawn, type ChildProcess } from "child_process";
import { isDockerAvailable, getDockerArgs, type ContainerConfig, type SandboxType, SECURITY_PROFILES } from "./container-config.js";

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

export interface SandboxOptions {
  type?: SandboxType;
  config?: Partial<ContainerConfig>;
  command: string;
  workdir?: string;
  timeout?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * SandboxManager - Orchestrates containerized agent execution
 */
export class SandboxManager {
  private activeContainers: Map<string, ChildProcess> = new Map();
  private containerId = 0;

  /**
   * Execute a command inside a Docker sandbox
   */
  async execute(options: SandboxOptions): Promise<SandboxResult> {
    const {
      type = "sandbox",
      config,
      command,
      workdir = "/app",
      timeout = 300,
      onStdout,
      onStderr
    } = options;

    // Check Docker availability
    const dockerReady = await isDockerAvailable();
    if (!dockerReady) {
      console.warn("[sandbox] Docker not available - falling back to host execution");
      return this.executeHost(command, timeout, onStdout, onStderr);
    }

    // Merge configs
    const profile = SECURITY_PROFILES[type];
    const mergedConfig: ContainerConfig = { ...profile, ...config };
    const containerName = `meow-sandbox-${Date.now()}-${++this.containerId}`;

    // Build docker args
    const args = [
      ...getDockerArgs(mergedConfig, command, workdir).slice(1), // Remove 'run'
      "--name", containerName
    ];

    console.log(`[sandbox] Spawning container: ${containerName}`);
    console.log(`[sandbox] Command: ${command.slice(0, 100)}...`);

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"]
      });

      this.activeContainers.set(containerName, proc);

      proc.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onStdout?.(chunk);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        onStderr?.(chunk);
      });

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.warn(`[sandbox] Container timed out: ${containerName}`);
        this.kill(containerName);
      }, timeout * 1000);

      proc.on("close", (code) => {
        clearTimeout(timeoutHandle);
        this.activeContainers.delete(containerName);
        
        const duration = Date.now() - startTime;
        console.log(`[sandbox] Container exited: ${containerName} (${code}) in ${duration}ms`);

        resolve({
          exitCode: code,
          stdout,
          stderr,
          duration,
          timedOut
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutHandle);
        this.activeContainers.delete(containerName);
        console.error(`[sandbox] Container error: ${containerName}`, err);
        resolve({
          exitCode: -1,
          stdout,
          stderr: stderr + "\n" + err.message,
          duration: Date.now() - startTime,
          timedOut: false
        });
      });
    });
  }

  /**
   * Fallback: Execute directly on host
   */
  private executeHost(
    command: string,
    timeout: number,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void
  ): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const proc = spawn("sh", ["-c", command], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      proc.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onStdout?.(chunk);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        onStderr?.(chunk);
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout * 1000);

      proc.on("close", (code) => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode: code,
          stdout,
          stderr,
          duration: Date.now() - startTime,
          timedOut
        });
      });
    });
  }

  /**
   * Kill a running container
   */
  kill(name: string): boolean {
    const proc = this.activeContainers.get(name);
    if (proc) {
      proc.kill();
      this.activeContainers.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Kill all active containers
   */
  killAll(): void {
    for (const [name, proc] of this.activeContainers) {
      console.log(`[sandbox] Killing container: ${name}`);
      proc.kill();
    }
    this.activeContainers.clear();
  }

  /**
   * Get count of active containers
   */
  getActiveCount(): number {
    return this.activeContainers.size;
  }
}

// Singleton instance
export const sandboxManager = new SandboxManager();
