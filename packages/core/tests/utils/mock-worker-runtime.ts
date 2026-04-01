import { Task, TaskResult } from "../../core/types";
import { MockGCPKMS } from "./mock-kms";

export interface MockWorkerConfig {
    failBoot?: boolean;
    failExecution?: boolean;
    delayMs?: number;
    mockSkillResult?: any;
    mockSkillName?: string;
}

export class MockWorkerRuntime {
    private kms: MockGCPKMS;
    private config: MockWorkerConfig;

    constructor(kms: MockGCPKMS, config: MockWorkerConfig = {}) {
        this.kms = kms;
        this.config = config;
    }

    async boot(): Promise<void> {
        if (this.config.failBoot) {
            throw new Error("Worker failed to boot: out of memory");
        }
        if (this.config.delayMs) {
            await new Promise(resolve => setTimeout(resolve, this.config.delayMs));
        }
    }

    async fetchCredentials(encryptedCreds: string[]): Promise<string[]> {
        const decrypted = [];
        for (const cred of encryptedCreds) {
            decrypted.push(await this.kms.decrypt(cred));
        }
        return decrypted;
    }

    async loadJITSkill(skillName: string): Promise<string> {
        if (skillName === "non-existent") {
            throw new Error(`Skill ${skillName} not found`);
        }
        // Simulated loaded skill content
        return `loaded-${skillName}-v1.0`;
    }

    async execute(task: Task, decryptedCredentials: string[], skillContent: string): Promise<TaskResult> {
        if (this.config.failExecution) {
            throw new Error("Execution failed: network timeout");
        }

        if (this.config.delayMs) {
            await new Promise(resolve => setTimeout(resolve, this.config.delayMs));
        }

        return {
            status: "success",
            message: `Mock execution of ${task.id} successful`,
            skills_used: [task.skills[0]],
            delegated_to: "mock-engine",
            output: this.config.mockSkillResult || { data: "mock-result" },
            skill_content_preview: skillContent,
            credentials_used: decryptedCredentials.length
        };
    }

    async simulateWorkerLifecycle(task: Task, encryptedCreds: string[]): Promise<TaskResult> {
        try {
            await this.boot();

            const skillName = task.skills.length > 0 ? task.skills[0] : "default-skill";
            const [decryptedCreds, skillContent] = await Promise.all([
                this.fetchCredentials(encryptedCreds),
                this.loadJITSkill(skillName)
            ]);

            return await this.execute(task, decryptedCreds, skillContent);
        } catch (error: any) {
            return {
                status: "error",
                message: error.message,
                skills_used: task.skills,
                delegated_to: "mock-engine",
                error: error.message
            };
        }
    }
}
