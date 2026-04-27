/**
 * Container Configuration - XL-22
 * Security profiles for Docker sandboxing
 */

export type SandboxType = "sandbox" | "network" | "privileged" | "host";

export interface ContainerConfig {
  type: SandboxType;
  image: string;
  memoryLimit: string;
  cpuLimit: number;
  timeout: number;
  networkEnabled: boolean;
  readOnlyRootfs: boolean;
  maxProcesses: number;
  user?: string;
  env?: Record<string, string>;
}

// Default security profile - maximum isolation
const SANDBOX_PROFILE: ContainerConfig = {
  type: "sandbox",
  image: process.env.SANDBOX_IMAGE || "node:25-alpine",
  memoryLimit: "512m",
  cpuLimit: 0.5,
  timeout: 300,
  networkEnabled: false,
  readOnlyRootfs: true,
  maxProcesses: 10
};

// Network-enabled profile for testing
const NETWORK_PROFILE: ContainerConfig = {
  type: "network",
  image: process.env.SANDBOX_IMAGE || "node:25-alpine",
  memoryLimit: "1g",
  cpuLimit: 1.0,
  timeout: 600,
  networkEnabled: true,
  readOnlyRootfs: true,
  maxProcesses: 50
};

// Privileged profile - development only
const PRIVILEGED_PROFILE: ContainerConfig = {
  type: "privileged",
  image: process.env.SANDBOX_IMAGE || "node:25-alpine",
  memoryLimit: "2g",
  cpuLimit: 2.0,
  timeout: 1800,
  networkEnabled: true,
  readOnlyRootfs: false,
  maxProcesses: 100
};

// Host profile - no container, run directly
const HOST_PROFILE: ContainerConfig = {
  type: "host",
  image: "",
  memoryLimit: "0",
  cpuLimit: 0,
  timeout: 0,
  networkEnabled: true,
  readOnlyRootfs: false,
  maxProcesses: 0
};

export const SECURITY_PROFILES: Record<SandboxType, ContainerConfig> = {
  sandbox: SANDBOX_PROFILE,
  network: NETWORK_PROFILE,
  privileged: PRIVILEGED_PROFILE,
  host: HOST_PROFILE
};

/**
 * Get Docker run arguments for a given profile
 */
export function getDockerArgs(config: ContainerConfig, command: string, workdir: string = "/app"): string[] {
  const args = ["run", "--rm"];
  
  // Resource limits
  if (config.memoryLimit !== "0") {
    args.push("--memory", config.memoryLimit);
  }
  if (config.cpuLimit > 0) {
    args.push("--cpus", config.cpuLimit.toString());
  }
  
  // Security options
  if (!config.networkEnabled) {
    args.push("--network", "none");
  }
  
  if (config.readOnlyRootfs) {
    args.push("--read-only");
    args.push("--tmpfs", "/tmp:rw,noexec,size=64m");
  }
  
  // Process limits via sysctl
  if (config.maxProcesses > 0) {
    args.push("--sysctl", `kernel.pid_max=${config.maxProcesses * 10}`);
  }
  
  // User (non-root for security)
  if (!config.user) {
    args.push("--user", "1000:1000");
  }
  
  // Working directory
  args.push("-w", workdir);
  
  // Image
  args.push(config.image);
  
  // Command
  args.push("sh", "-c", command);
  
  return args;
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    execSync("docker info", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
