import { readFile, access } from "fs/promises";
import { resolve, dirname } from "path";
import { globby } from "globby";
import yaml from "js-yaml";

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private isInitialized: boolean = false;

  constructor() {}

  /**
   * Discover skills in the project.
   * Looks for SKILL files in .meow/skills and .claude/skills
   */
  async discover() {
    if (this.isInitialized) return;
    const patterns = [
      ".meow/skills/**/SKILL.md",
      ".claude/skills/**/SKILL.md",
      "skills/**/SKILL.md"
    ];

    const files = await globby(patterns, {
      cwd: process.cwd(),
      absolute: true,
    });

    for (const file of files) {
      try {
        const content = await readFile(file, "utf-8");
        const sections = content.split("---");
        
        if (sections.length < 3) continue; // Missing frontmatter

        const frontmatter = yaml.load(sections[1]) as { name: string; description: string };
        const body = sections.slice(2).join("---").trim();

        if (frontmatter.name) {
          this.registerSkill({
            name: frontmatter.name,
            description: frontmatter.description || "",
            content: body,
            path: file,
          });
        }
      } catch (e) {
        console.error(`Failed to load skill at ${file}:`, e);
      }
    }
    this.isInitialized = true;
  }

  registerSkill(skill: Skill) {
    this.skills.set(skill.name, skill);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  getSkillsPrompt(): string {
    if (this.skills.size === 0) return "";

    let prompt = "\n# AVAILABLE SKILLS (Expert Knowledge):\n";
    this.skills.forEach(skill => {
      prompt += `- ${skill.name}: ${skill.description}\n`;
    });
    prompt += "\nYou can use 'use_skill | <name>' to activate one of these experts.\n";
    return prompt;
  }
}
