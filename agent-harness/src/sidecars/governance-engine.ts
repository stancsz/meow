/**
 * governance-engine.ts
 * 
 * Manages tool permissions and human-in-the-loop approvals.
 * Inspired by OpenWork/OpenCode permission architecture.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Permission {
  tool: string;
  action: "allow" | "deny" | "ask";
  always?: boolean;
}

export interface GovernanceConfig {
  permissions: Permission[];
  autoApprovalTimeout?: number;
}

export class GovernanceEngine {
  private configPath: string;
  private config: GovernanceConfig;
  private pendingApprovals: Map<string, (approved: boolean) => void> = new Map();

  constructor(workspaceRoot: string) {
    this.configPath = join(workspaceRoot, "meow.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): GovernanceConfig {
    if (existsSync(this.configPath)) {
      try {
        return JSON.parse(readFileSync(this.configPath, "utf-8"));
      } catch {
        return { permissions: [] };
      }
    }
    return { permissions: [] };
  }

  public saveConfig(): void {
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Checks if a tool usage requires approval.
   * Returns true if allowed, false if denied, or throws/awaits for "ask".
   */
  public async checkPermission(tool: string): Promise<boolean> {
    const perm = this.config.permissions.find(p => p.tool === tool || p.tool === "*");
    
    if (perm?.action === "allow") return true;
    if (perm?.action === "deny") return false;

    // Default to "ask" for sensitive tools
    const sensitiveTools = ["run_command", "replace_file_content", "write_to_file", "delete_file"];
    if (sensitiveTools.includes(tool)) {
      return await this.requestApproval(tool);
    }

    return true; // Safe tools
  }

  private async requestApproval(tool: string): Promise<boolean> {
    const approvalId = Math.random().toString(36).substring(7);
    console.log(`[GOVERNANCE] Approval required for ${tool} (ID: ${approvalId})`);
    
    // In a real system, this would emit an SSE event to the dashboard
    // and wait for a callback/POST request to the server.
    
    return new Promise((resolve) => {
      this.pendingApprovals.set(approvalId, resolve);
      
      // Auto-approve after timeout for "headless" operation if configured
      if (this.config.autoApprovalTimeout) {
        setTimeout(() => {
          if (this.pendingApprovals.has(approvalId)) {
            console.log(`[GOVERNANCE] Auto-approving ${tool} after timeout`);
            this.resolveApproval(approvalId, true);
          }
        }, this.config.autoApprovalTimeout);
      }
    });
  }

  public resolveApproval(id: string, approved: boolean): void {
    const resolver = this.pendingApprovals.get(id);
    if (resolver) {
      resolver(approved);
      this.pendingApprovals.delete(id);
    }
  }

  public getPendingApprovals() {
    return Array.from(this.pendingApprovals.keys());
  }
}
