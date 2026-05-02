import { Extension } from './Extension';
import { Tool } from '../types/tool';
import { globby } from 'globby';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

export interface ExtensionManifest {
  name: string;
  description: string;
  path: string;
}

export class ExtensionManager {
  private manifests: Map<string, ExtensionManifest> = new Map();
  private activeExtensions: Map<string, Extension> = new Map();
  private isInitialized: boolean = false;

  /**
   * Discovers extension manifests without loading the full code.
   */
  async discover() {
    if (this.isInitialized) return;
    
    const patterns = [
      "src/extensions/*/index.ts",
      "src/extensions/*/extension.ts",
      "extensions/*/index.ts",
      "extensions/*/extension.ts"
    ];

    const files = await globby(patterns, {
      cwd: process.cwd(),
      absolute: true,
    });

    for (const file of files) {
      try {
        // We do a "shallow" import just to get the name/description if possible,
        // or we infer it from the directory structure for now to avoid full execution.
        // For simplicity in this demo, we'll do a full import but store it as a manifest.
        const fileUrl = pathToFileURL(file).href;
        const module = await import(fileUrl);
        const extension: Extension = module.default || module.extension;
        
        if (extension && extension.name) {
          this.manifests.set(extension.name, {
            name: extension.name,
            description: extension.description,
            path: file
          });
        }
      } catch (e) {
        console.error(`Failed to discover extension at ${file}:`, e);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Lazily loads an extension by name.
   */
  async activate(name: string): Promise<Extension | undefined> {
    const manifest = this.manifests.get(name);
    if (!manifest) return undefined;

    if (this.activeExtensions.has(name)) {
      return this.activeExtensions.get(name);
    }

    try {
      const manifestUrl = pathToFileURL(manifest.path).href;
      const module = await import(manifestUrl);
      const extension: Extension = module.default || module.extension;
      this.activeExtensions.set(name, extension);
      console.log(`🔌 Activated extension: ${extension.name}`);
      return extension;
    } catch (e) {
      console.error(`Failed to activate extension ${name}:`, e);
      return undefined;
    }
  }

  getActiveTools(): Tool[] {
    const tools: Tool[] = [];
    this.activeExtensions.forEach(ext => {
      tools.push(...ext.tools);
    });
    return tools;
  }

  getAvailableExtensions(): ExtensionManifest[] {
    return Array.from(this.manifests.values());
  }

  getExtensionsPrompt(): string {
    const available = this.getAvailableExtensions();
    if (available.length === 0) return "";

    let prompt = "\n# EXTENSIONS (Available but not active):\n";
    available.forEach(ext => {
      const status = this.activeExtensions.has(ext.name) ? "[ACTIVE]" : "[INACTIVE]";
      prompt += `- ${ext.name}: ${ext.description} ${status}\n`;
      
      if (this.activeExtensions.has(ext.name)) {
        const fullExt = this.activeExtensions.get(ext.name)!;
        fullExt.tools.forEach(t => {
          prompt += `  * ${t.name}: ${t.description}\n`;
        });
      }
    });

    if (available.some(ext => !this.activeExtensions.has(ext.name))) {
      prompt += "\nTo use an inactive extension, call: TOOL: activate_extension | <name>\n";
    }

    return prompt;
  }
}
