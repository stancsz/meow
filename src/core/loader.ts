import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { extensionRegistry } from "./extensions.ts";

export async function loadPlugins() {
  const pluginsDir = join(import.meta.dir, "../plugins");

  try {
    const files = await readdir(pluginsDir);

    for (const file of files) {
      if (file.endsWith(".ts") || file.endsWith(".js")) {
        console.log(`Loading plugin: ${file}`);
        const module = await import(join(pluginsDir, file));

        if (module.plugin) {
          extensionRegistry.register(module.plugin);
          console.log(
            `Registered plugin: ${module.plugin.name} (${module.plugin.type})`,
          );
        } else {
          console.warn(`File ${file} does not export a 'plugin' object.`);
        }
      }
    }
  } catch (error) {
    console.error("Error loading plugins:", error);
  }
}
