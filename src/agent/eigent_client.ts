/**
 * Eigent Client
 * 
 * Native integration with Eigent desktop app for GUI and multi-agent coordination.
 * Replaces the parity command with actual HTTP calls to the Eigent backend.
 * 
 * Endpoint: http://localhost:3001/api
 * Protocol: MCP-compatible REST API
 */

import pc from "picocolors";

export interface EigentTask {
  id?: string;
  goal: string;
  provider: string;
  status?: "pending" | "running" | "completed" | "failed";
  result?: any;
  metadata?: Record<string, any>;
}

export interface EigentResponse {
  success: boolean;
  taskId?: string;
  result?: any;
  error?: string;
}

export interface EigentConfig {
  endpoint: string;
  timeout?: number;
}

export class EigentClient {
  private endpoint: string;
  private timeout: number;

  constructor(config: EigentConfig) {
    this.endpoint = config.endpoint || "http://localhost:3001/api";
    this.timeout = config.timeout || 60000;
  }

  /**
   * Check if Eigent backend is available.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.endpoint}/health`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Create a new task in the Eigent workforce.
   */
  async createTask(goal: string, provider: string = "meow-bridge"): Promise<EigentResponse> {
    console.log(pc.cyan(`\n📡 [EIGENT] Creating task: ${goal.substring(0, 50)}...`));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.endpoint}/v1/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal,
          provider,
          metadata: {
            source: "meow-orchestrator",
            timestamp: new Date().toISOString(),
          }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        console.log(pc.red(`❌ [EIGENT] API error: ${response.status} - ${error}`));
        return { success: false, error };
      }

      const data = await response.json() as { taskId: string };
      console.log(pc.green(`✅ [EIGENT] Task created: ${data.taskId}`));
      
      return {
        success: true,
        taskId: data.taskId,
        result: data,
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log(pc.red(`❌ [EIGENT] Connection failed: ${errorMsg}`));
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get task status and result.
   */
  async getTask(taskId: string): Promise<EigentResponse> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.endpoint}/v1/tasks/${taskId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const data = await response.json() as { status?: string; result?: any; error?: string };
      return {
        success: true,
        taskId,
        result: data,
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Wait for task completion with polling.
   */
  async waitForTask(taskId: string, pollInterval: number = 2000): Promise<EigentResponse> {
    const maxAttempts = Math.floor(this.timeout / pollInterval);
    let attempts = 0;

    console.log(pc.cyan(`\n⏳ [EIGENT] Waiting for task ${taskId}...`));

    while (attempts < maxAttempts) {
      const result = await this.getTask(taskId);
      
      if (!result.success) {
        return result;
      }

      const status = result.result?.status;
      
      if (status === "completed") {
        console.log(pc.green(`\n✅ [EIGENT] Task completed!`));
        return result;
      }
      
      if (status === "failed") {
        console.log(pc.red(`\n❌ [EIGENT] Task failed!`));
        return { 
          success: false, 
          taskId, 
          error: result.result?.error || "Task failed" 
        };
      }

      await new Promise(r => setTimeout(r, pollInterval));
      attempts++;
    }

    return {
      success: false,
      taskId,
      error: `Timeout waiting for task completion after ${maxAttempts} attempts`,
    };
  }

  /**
   * Execute a task and wait for completion.
   */
  async execute(goal: string, provider: string = "meow-bridge"): Promise<EigentResponse> {
    const createResult = await this.createTask(goal, provider);
    
    if (!createResult.success || !createResult.taskId) {
      return createResult;
    }

    return this.waitForTask(createResult.taskId);
  }
}

/**
 * Factory function to create an EigentClient with standard config.
 */
export function createEigentClient(): EigentClient {
  return new EigentClient({
    endpoint: process.env.EIGENT_ENDPOINT || "http://localhost:3001/api",
    timeout: parseInt(process.env.EIGENT_TIMEOUT || "60000"),
  });
}
