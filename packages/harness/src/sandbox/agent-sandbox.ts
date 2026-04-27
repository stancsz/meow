/**
 * AgentSandbox - Wrapper for sandbox-aware sub-kitten spawning
 * 
 * XL-22: Integrates SandboxManager with existing sub-kitten spawning
 * 
 * @see sandbox-manager.ts
 */

import { SandboxManager, DEFAULT_SANDBOX_CONFIG, type SandboxConfig } from "./sandbox-manager";

export interface AgentSpawnConfig {
  name: string;            // Agent name (for audit)
  command: string[];       // Command to run
  sandbox?: Partial<SandboxConfig>;  // Override default sandbox config
  onOutput?: (line: string) => void;
  onError?: (line: string) => void;
}

export interface AgentSpawnResult {
  success: boolean;
  sandboxId: string;
  exitCode: number | null;
  output: string;
  errorOutput: string;
  duration: number;
}

// ============================================================================
// AgentSandbox Class
// ============================================================================

export class AgentSandbox {
  private manager: SandboxManager;
  
  constructor() {
    this.manager = new SandboxManager();
  }
  
  /**
   * Spawn an agent in a sandboxed environment
   */
  async spawnAgent(config: AgentSpawnConfig): Promise<AgentSpawnResult> {
    const sandboxConfig: SandboxConfig = {
      ...DEFAULT_SANDBOX_CONFIG,
      ...config.sandbox,
    };
    
    console.log(`[agent-sandbox:${config.name}] Spawning in sandbox...`);
    
    // Add output handlers
    const outputLines: string[] = [];
    const errorLines: string[] = [];
    
    // Run the sandbox
    const result = await this.manager.runSandbox(
      config.command,
      sandboxConfig,
      config.name
    );
    
    // Collect output (we can't stream in real-time with Docker spawn,
    // but we capture it for the result)
    outputLines.push(result.stdout);
    errorLines.push(result.stderr);
    
    if (config.onOutput) {
      result.stdout.split("\n").forEach(line => {
        if (line.trim()) config.onOutput!(line);
      });
    }
    
    if (config.onError) {
      result.stderr.split("\n").forEach(line => {
        if (line.trim()) config.onError!(line);
      });
    }
    
    return {
      success: result.exitCode === 0,
      sandboxId: result.sandboxId,
      exitCode: result.exitCode,
      output: result.stdout,
      errorOutput: result.stderr,
      duration: result.duration,
    };
  }
  
  /**
   * Check if Docker sandbox is available
   */
  async isAvailable(): Promise<boolean> {
    return this.manager.isDockerAvailable();
  }
  
  /**
   * Get recent sandbox audit logs
   */
  getAuditLogs(limit = 50) {
    return this.manager.getAuditLogs(limit);
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let singleton: AgentSandbox | null = null;

export function getAgentSandbox(): AgentSandbox {
  if (!singleton) {
    singleton = new AgentSandbox();
  }
  return singleton;
}

// ============================================================================
// CLI for testing
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const sandbox = getAgentSandbox();
  
  console.log("🔍 AgentSandbox CLI\n");
  
  sandbox.isAvailable().then((available) => {
    if (!available) {
      console.log("❌ Docker not available - sandbox mode disabled");
      console.log("💡 Agents will run without isolation");
      process.exit(0);
    }
    
    console.log("✅ Sandbox mode enabled");
    
    // Run a test agent
    const testConfig: AgentSpawnConfig = {
      name: "test-agent",
      command: ["bun", "--version"],
    };
    
    sandbox.spawnAgent(testConfig).then((result) => {
      console.log("\n📊 Result:");
      console.log(`  Success: ${result.success}`);
      console.log(`  Sandbox ID: ${result.sandboxId}`);
      console.log(`  Exit Code: ${result.exitCode}`);
      console.log(`  Duration: ${result.duration}ms`);
      console.log(`  Output: ${result.output.trim()}`);
      
      console.log("\n📋 Recent Audits:");
      sandbox.getAuditLogs(5).forEach((log: any) => {
        console.log(`  ${log.sandbox_id} | ${log.agent_name} | ${log.exit_code} | ${log.duration_ms}ms`);
      });
      
      process.exit(result.success ? 0 : 1);
    });
  });
}

// ============================================================================
// Usage Examples (for documentation)
// ============================================================================

/**
 * // Basic usage:
 * const sandbox = getAgentSandbox();
 * 
 * const result = await sandbox.spawnAgent({
 *   name: "researcher",
 *   command: ["bun", "run", "src/agents/researcher.ts"],
 * });
 * 
 * // With sandbox overrides:
 * const result = await sandbox.spawnAgent({
 *   name: "heavy-lifter",
 *   command: ["bun", "run", "src/agents/heavy.ts"],
 *   sandbox: {
 *     cpuLimit: 2,
 *     memoryLimit: "1g",
 *     timeout: 120000,
 *   },
 * });
 * 
 * // With output streaming:
 * const result = await sandbox.spawnAgent({
 *   name: "builder",
 *   command: ["bun", "run", "src/agents/builder.ts"],
 *   onOutput: (line) => console.log("[builder]", line),
 *   onError: (line) => console.error("[builder:err]", line),
 * });
 */