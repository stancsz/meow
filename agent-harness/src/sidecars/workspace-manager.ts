/**
 * workspace-manager.ts — Meow Workspace Organization
 *
 * Defines the standard directory structure for agents to prevent 
 * "random discovery" and file clutter.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export enum WorkspaceZone {
  RESEARCH = "evolve/research",
  DOGFOOD = "dogfood/results",
  DESIGN = "design/proposals",
  COMPUTER = "computer",
  SCRATCH = "scratch"
}

export interface WorkspaceConfig {
  baseDir: string;
}

export class WorkspaceManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.ensureStructure();
  }

  private ensureStructure() {
    const zones = Object.values(WorkspaceZone);
    for (const zone of zones) {
      const zonePath = join(this.baseDir, zone);
      if (!existsSync(zonePath)) {
        mkdirSync(zonePath, { recursive: true });
      }
    }
  }

  /**
   * Resolves a filename into the appropriate zone.
   * Ensures the resulting path is within the zone.
   */
  public getZonePath(zone: WorkspaceZone, filename?: string): string {
    const zoneDir = join(this.baseDir, zone);
    if (!filename) return zoneDir;
    
    // Simple sanitization
    const safeFilename = filename.replace(/[..\\/]/g, '_');
    return join(zoneDir, safeFilename);
  }

  /**
   * Helper to find which zone a file belongs to based on purpose.
   */
  public inferZone(purpose: string): WorkspaceZone {
    const p = purpose.toLowerCase();
    if (p.includes("research") || p.includes("evolve")) return WorkspaceZone.RESEARCH;
    if (p.includes("test") || p.includes("dogfood")) return WorkspaceZone.DOGFOOD;
    if (p.includes("design") || p.includes("proposal") || p.includes("ui")) return WorkspaceZone.DESIGN;
    if (p.includes("scratch") || p.includes("temp") || p.includes("tmp")) return WorkspaceZone.SCRATCH;
    return WorkspaceZone.COMPUTER;
  }
}
