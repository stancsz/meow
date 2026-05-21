import * as fs from 'fs';
import * as path from 'path';
import { ExternalAgent, SummonContext } from '../../agent/summoner';

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  commandTemplate: string;
  mcpTools?: Array<{
    name: string;
    description: string;
    command: string;
  }>;
}

export class ManifestLoader {
  private pluginsDir: string;
  private loadedPlugins: Map<string, PluginManifest> = new Map();

  constructor(pluginsDir: string = path.join(process.cwd(), 'plugins')) {
    this.pluginsDir = pluginsDir;
  }

  /**
   * Scans the plugins directory and loads all manifests.
   */
  async loadManifests(): Promise<Map<string, ExternalAgent>> {
    const dynamicAgents = new Map<string, ExternalAgent>();

    if (!fs.existsSync(this.pluginsDir)) {
      try {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
      } catch (err) {
        console.error(`[ManifestLoader] Failed to create plugins directory:`, err);
        return dynamicAgents;
      }
    }

    try {
      const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const content = fs.readFileSync(manifestPath, 'utf8');
              const manifest: PluginManifest = JSON.parse(content);
              
              if (this.validateManifest(manifest)) {
                this.loadedPlugins.set(manifest.id, manifest);
                
                // Construct ExternalAgent implementation from commandTemplate
                const externalAgent: ExternalAgent = {
                  name: manifest.name,
                  description: manifest.description,
                  getCommand: (ctx: SummonContext) => {
                    let cmd = manifest.commandTemplate;
                    
                    // Replace placeholders
                    cmd = cmd.replace(/{goal}/g, ctx.goal.replace(/"/g, '\\"'));
                    cmd = cmd.replace(/{files}/g, ctx.files.join(', '));
                    cmd = cmd.replace(/{lastError}/g, (ctx.lastError || '').replace(/"/g, '\\"'));
                    cmd = cmd.replace(/{attempt}/g, String(ctx.attempt || 1));
                    
                    return cmd;
                  }
                };
                
                dynamicAgents.set(manifest.id, externalAgent);
                console.log(`🔌 [ManifestLoader] Dynamically registered pluggable specialist: ${manifest.name} (${manifest.id})`);
              } else {
                console.warn(`[ManifestLoader] Invalid manifest found at ${manifestPath}`);
              }
            } catch (err) {
              console.error(`[ManifestLoader] Failed to read or parse manifest at ${manifestPath}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[ManifestLoader] Error reading plugins directory:`, err);
    }

    return dynamicAgents;
  }

  /**
   * Helper to validate that a manifest has all required fields.
   */
  private validateManifest(manifest: any): manifest is PluginManifest {
    return (
      manifest &&
      typeof manifest.id === 'string' &&
      typeof manifest.name === 'string' &&
      typeof manifest.description === 'string' &&
      typeof manifest.commandTemplate === 'string'
    );
  }

  /**
   * Get list of loaded plugin manifests.
   */
  getLoadedPlugins(): PluginManifest[] {
    return Array.from(this.loadedPlugins.values());
  }
}
