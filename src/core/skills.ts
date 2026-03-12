import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadSkillsContext(): Promise<string> {
  const skillsDir = join(__dirname, "../../.agents/skills");
  let fullContext = "\n\n### AGENT SKILLS\n";

  try {
    const files = await readdir(skillsDir);
    for (const file of files) {
      if (file.endsWith(".md") && file !== "README.md") {
        const content = await readFile(join(skillsDir, file), "utf-8");
        fullContext += `\n--- SKILL: ${file} ---\n${content}\n`;
      }
    }
  } catch (error) {
    console.warn("No skills directory found or error reading skills.");
  }

  return fullContext;
}
