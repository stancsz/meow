import { DBClient } from '../db/client';
import { loadSkillFromRef, validateSkill } from './skill-loader';

export async function importGitHubSkill(url: string, userId: string, db: any) {
    // Basic validation of URL
    if (!url.startsWith('https://github.com/')) {
        throw new Error('Invalid GitHub URL');
    }

    // Convert github.com to raw.githubusercontent.com
    const rawUrl = url
        .replace('https://github.com/', 'https://raw.githubusercontent.com/')
        .replace('/blob/', '/');

    try {
        const skill = await loadSkillFromRef(rawUrl);

        if (!validateSkill(skill)) {
            throw new Error('Invalid skill format');
        }

        // Static analysis for safety
        if (!skill.allowed_domains || skill.allowed_domains.length === 0) {
            throw new Error('Skill must explicitly declare allowed_domains for safety');
        }

        // Prevent overly broad domains like * or completely missing domains
        if (skill.allowed_domains.includes('*')) {
             throw new Error('Skill cannot use wildcard "*" for allowed_domains');
        }

        // Check for duplicate
        const isDuplicate = db.checkSkillExists(userId, skill.name);
        if (isDuplicate) {
            throw new Error(`Skill ${skill.name} already exists`);
        }

        // Add to db
        db.addSkillRef(userId, skill.name, 'github', url);

        return skill;
    } catch (e: any) {
        if (e.message.includes('already exists')) {
           throw e;
        }
        if (e.message.includes('Invalid skill format') || e.message.includes('allowed_domains')) {
           throw e;
        }
        throw new Error(`Failed to load skill from ref: ${e.message}`);
    }
}
