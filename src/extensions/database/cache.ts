/**
 * cache.ts — StateManager and Session Caching Layer
 *
 * Implements persistent state caching for sessions and feature checkpoints,
 * enabling full state recovery and session resumption across system crashes/restarts.
 * Writes to local workspace cache folder `.meow/state/`.
 */

import fs from "fs";
import path from "path";

export interface SessionState {
  runId: string;
  missionId: string;
  status: string;
  seed?: number;
  deterministic?: boolean;
  model?: string;
  updatedAt: string;
  customData?: any;
}

export interface FeatureState {
  featureId: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  passes: boolean;
  tasks: string[];
  updatedAt: string;
}

export class StateManager {
  private baseDir: string;
  private stateDir: string;
  private featureDir: string;
  private logFile: string;

  constructor(workspaceRoot = ".") {
    this.baseDir = path.join(workspaceRoot, ".meow");
    this.stateDir = path.join(this.baseDir, "state");
    this.featureDir = path.join(this.stateDir, "features");
    this.logFile = path.join(this.baseDir, "logs", "delegation-audit.jsonl");

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
    if (!fs.existsSync(this.featureDir)) {
      fs.mkdirSync(this.featureDir, { recursive: true });
    }
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Save session status to the persistent cache.
   */
  public saveSession(runId: string, state: Omit<SessionState, "updatedAt">): void {
    const file = path.join(this.stateDir, `session_${runId}.json`);
    const fullState: SessionState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(fullState, null, 2), "utf-8");
  }

  /**
   * Load session status from persistent cache.
   */
  public loadSession(runId: string): SessionState | null {
    const file = path.join(this.stateDir, `session_${runId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const data = fs.readFileSync(file, "utf-8");
      return JSON.parse(data) as SessionState;
    } catch {
      return null;
    }
  }

  /**
   * Deletes a cached session.
   */
  public clearSession(runId: string): void {
    const file = path.join(this.stateDir, `session_${runId}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  /**
   * Save feature status (such as developer validation passes) to local state store.
   */
  public saveFeature(featureId: string, state: Omit<FeatureState, "updatedAt">): void {
    const file = path.join(this.featureDir, `${featureId}.json`);
    const fullState: FeatureState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(fullState, null, 2), "utf-8");
  }

  /**
   * Load feature status.
   */
  public loadFeature(featureId: string): FeatureState | null {
    const file = path.join(this.featureDir, `${featureId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const data = fs.readFileSync(file, "utf-8");
      return JSON.parse(data) as FeatureState;
    } catch {
      return null;
    }
  }

  /**
   * Append a structured entry to the path delegation audit log.
   */
  public logDelegation(entry: {
    runId: string;
    filePath: string;
    delegateType: string;
    action: string;
    timestamp?: string;
  }): void {
    const auditEntry = {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    };
    fs.appendFileSync(this.logFile, JSON.stringify(auditEntry) + "\n", "utf-8");
  }
}
