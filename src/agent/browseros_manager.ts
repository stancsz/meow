/**
 * BrowserOS Manager
 *
 * Handles auto-start, health checking, and connection management for BrowserOS.
 * If BrowserOS is closed/gateway not responding, attempts to launch it.
 */

import { spawn, execSync } from "child_process";
import { config } from "../config/env";

const BROWSEROS_DEFAULT_PORT = 9200;
const BROWSEROS_LAUNCH_WAIT = 30; // seconds
const HEALTH_CHECK_INTERVAL = 2000; // ms
const MAX_HEALTH_CHECKS = 15;

export interface BrowserOSStatus {
  connected: boolean;
  serverUrl: string;
  browserOpen: boolean;
  cdpConnected: boolean;
  version?: string;
}

export class BrowserOSManager {
  private serverUrl: string;
  private autoStartEnabled: boolean = true;
  private apiKey?: string;

  constructor(serverUrl: string = `http://127.0.0.1:${BROWSEROS_DEFAULT_PORT}`) {
    this.serverUrl = serverUrl;
    this.apiKey = config.apiKey;
  }

  /**
   * Check if BrowserOS is running and healthy
   */
  async checkStatus(): Promise<BrowserOSStatus> {
    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return this.createDisconnectedStatus();
      }

      const data = await response.json() as { status?: string; cdpConnected?: boolean; version?: string };

      return {
        connected: data.status === "ok",
        serverUrl: this.serverUrl,
        browserOpen: data.cdpConnected ?? false,
        cdpConnected: data.cdpConnected ?? false,
        version: data.version
      };
    } catch (e) {
      return this.createDisconnectedStatus();
    }
  }

  private createDisconnectedStatus(): BrowserOSStatus {
    return {
      connected: false,
      serverUrl: this.serverUrl,
      browserOpen: false,
      cdpConnected: false
    };
  }

  /**
   * Check if BrowserOS process is installed
   */
  isInstalled(): boolean {
    try {
      execSync("browseros-cli --version", { stdio: "ignore", shell: true } as any);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Ensure BrowserOS is running. Auto-start if closed.
   */
  async ensureRunning(): Promise<BrowserOSStatus> {
    // First check current status
    let status = await this.checkStatus();

    if (status.connected && status.cdpConnected) {
      console.log(`✓ BrowserOS already running at ${this.serverUrl}`);
      return status;
    }

    if (!this.autoStartEnabled) {
      console.log("⚠️ BrowserOS auto-start disabled. Run 'browseros-cli launch' manually.");
      return status;
    }

    // Try to launch BrowserOS
    console.log("🔄 BrowserOS not responding. Attempting to launch...");

    try {
      this.launch();

      // Wait for it to come up
      const readyStatus = await this.waitForReady(MAX_HEALTH_CHECKS);
      console.log(`✅ BrowserOS started successfully at ${this.serverUrl}`);
      return readyStatus;
    } catch (e) {
      console.error(`❌ Failed to auto-start BrowserOS: ${e instanceof Error ? e.message : String(e)}`);
      console.log("\n📋 Manual steps:");
      console.log("  1. Install: browseros-cli install");
      console.log("  2. Launch: browseros-cli launch");
      console.log("  3. Init:   browseros-cli init --auto");
      return this.createDisconnectedStatus();
    }
  }

  /**
   * Launch BrowserOS process
   */
  launch(): void {
    try {
      // Check if already running first
      const existingCheck = execSync("browseros-cli status", {
        encoding: "utf-8",
        stdio: "pipe",
        shell: true,
      } as any);

      if (existingCheck.includes("BrowserOS is already running")) {
        console.log("✓ BrowserOS is already running");
        return;
      }
    } catch (e) {
      // Not running, proceed with launch
    }

    // Launch BrowserOS
    const child = spawn("browseros-cli", ["launch", "--wait", String(BROWSEROS_LAUNCH_WAIT)], {
      detached: false,
      stdio: "pipe",
      shell: true
    });

    child.unref();
    console.log("🚀 Launching BrowserOS (background)...");
  }

  /**
   * Wait for BrowserOS to become ready
   */
  private async waitForReady(maxChecks: number): Promise<BrowserOSStatus> {
    for (let i = 0; i < maxChecks; i++) {
      const status = await this.checkStatus();

      if (status.connected && status.cdpConnected) {
        return status;
      }

      await this.sleep(HEALTH_CHECK_INTERVAL);
      process.stdout.write(".");
    }

    console.log("");
    throw new Error(`BrowserOS did not become ready after ${maxChecks * HEALTH_CHECK_INTERVAL / 1000}s`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Enable/disable auto-start
   */
  setAutoStart(enabled: boolean): void {
    this.autoStartEnabled = enabled;
  }

  /**
   * Get API key (for BrowserOS LLM features)
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }
}

// Singleton instance
let browserOSManager: BrowserOSManager | null = null;

export function getBrowserOSManager(): BrowserOSManager {
  if (!browserOSManager) {
    browserOSManager = new BrowserOSManager();
  }
  return browserOSManager;
}

export function resetBrowserOSManager(): void {
  browserOSManager = null;
}