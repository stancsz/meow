import * as fs from 'fs';
import * as yaml from 'yaml';
import { Skill } from './types';

export function parseSkillMarkdown(markdown: string): Skill {
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = markdown.match(yamlRegex);

    if (!match) {
        return {
            name: 'unknown',
            content: markdown.trim()
        };
    }

    const frontmatter = match[1];
    const content = match[2].trim();

    try {
        const metadata = yaml.parse(frontmatter);
        return {
            name: metadata.skill_name || metadata.name || 'unknown',
            version: metadata.version,
            required_credentials: metadata.required_credentials,
            allowed_domains: metadata.allowed_domains,
            author: metadata.author,
            content: content
        };
    } catch (e) {
        return {
            name: 'unknown',
            content: content
        };
    }
}

export function validateSkill(skill: Skill): boolean {
    if (!skill.name || skill.name === 'unknown') {
        return false;
    }
    if (!skill.content || skill.content.trim() === '') {
        return false;
    }
    return true;
}

export async function loadSkillFromRef(ref: string): Promise<Skill> {
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
        const response = await fetch(ref);
        if (!response.ok) {
            throw new Error(`Failed to fetch skill from ${ref}: ${response.statusText}`);
        }
        const markdown = await response.text();
        return parseSkillMarkdown(markdown);
    }

    // Try local files
    const possiblePaths = [
        ref,
        `.agents/skills/${ref}`,
        `.agents/skills/${ref}.md`,
        `src/skills/${ref}`,
        `src/skills/${ref}.md`
    ];

    for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
            const markdown = fs.readFileSync(path, 'utf-8');
            const skill = parseSkillMarkdown(markdown);
            if (!validateSkill(skill)) {
                throw new Error(`Invalid skill format in file: ${path}`);
            }
            return skill;
        }
    }

    throw new Error(`Failed to load skill from ref: ${ref}`);
}
