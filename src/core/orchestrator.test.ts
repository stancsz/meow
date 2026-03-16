import { expect, test, describe, mock, beforeAll, afterAll } from "bun:test";
import * as ff from '@google-cloud/functions-framework';
import { validateManifest } from './orchestrator';
import { SwarmManifest } from "./types";

// Import to register the function
import './orchestrator';
import { parseIntentToManifest } from "./llm";

// Mock the parseIntentToManifest function to avoid network calls during tests
mock.module('./llm', () => {
    return {
        parseIntentToManifest: async (intent: string, availableSkills: string[]): Promise<SwarmManifest> => {
            if (intent.includes("error")) {
                throw new Error("Simulated LLM Error");
            }
            if (intent.includes("shopify")) {
                return {
                    version: "1.0",
                    intent_parsed: "every night Get shopify orders and post to slack",
                    schedule: "0 2 * * *",
                    skills_required: ['shopify-order-sync', 'slack-digest-poster'],
                    credentials_required: ['shopify_api_key', 'slack_bot_token'],
                    steps: [
                        { id: 'step_1', description: 'Fetch Shopify orders', worker: 'worker_a', skills: ['shopify-order-sync'], credentials: ['shopify_api_key'], depends_on: [], action_type: 'READ' },
                        { id: 'step_2', description: 'Cross-reference Google Sheets', worker: 'worker_b', skills: ['google-sheets-inventory'], credentials: ['google_oauth_token'], depends_on: [], action_type: 'READ' },
                        { id: 'step_3', description: 'Post Slack digest', worker: 'worker_c', skills: ['slack-digest-poster'], credentials: ['slack_bot_token'], depends_on: ['step_1', 'step_2'], action_type: 'WRITE' }
                    ]
                };
            }
            if (intent.includes("email")) {
                return {
                    version: "1.0",
                    intent_parsed: "Summarize status and send an email",
                    skills_required: ['gmail-drafter', 'data-gatherer', 'data-analyzer'],
                    credentials_required: ['google_oauth_token'],
                    steps: [
                        { id: 'step_1', description: 'Gather context data', worker: 'worker_a', skills: ['data-gatherer'], credentials: [], depends_on: [], action_type: 'READ' },
                        { id: 'step_2', description: 'Analyze data', worker: 'worker_b', skills: ['data-analyzer'], credentials: [], depends_on: ['step_1'], action_type: 'READ' },
                        { id: 'step_3', description: 'Draft email summary', worker: 'worker_c', skills: ['gmail-drafter'], credentials: ['google_oauth_token'], depends_on: ['step_2'], action_type: 'WRITE' }
                    ]
                };
            }
            // default generic
            return {
                version: "1.0",
                intent_parsed: "Do something else",
                skills_required: ['generic-web-search', 'data-analyzer', 'generic-writer'],
                credentials_required: [],
                steps: [
                    { id: 'step_1', description: 'Search for information', worker: 'worker_a', skills: ['generic-web-search'], credentials: [], depends_on: [], action_type: 'READ' },
                    { id: 'step_2', description: 'Process results', worker: 'worker_b', skills: ['data-analyzer'], credentials: [], depends_on: ['step_1'], action_type: 'READ' },
                    { id: 'step_3', description: 'Write final report', worker: 'worker_c', skills: ['generic-writer'], credentials: [], depends_on: ['step_2'], action_type: 'WRITE' }
                ]
            };
        }
    };
});


describe("Orchestrator Cloud Function", () => {
    test("handles valid POST request with shopify and slack intent", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "every night Get shopify orders and post to slack",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        // Get the handler directly for testing
        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody).toBeDefined();
        expect(responseBody.status).toBe('success');
        expect(responseBody.pda).toBeDefined();
        expect(responseBody.pda.status).toBe('waiting_approval');
        expect(responseBody.pda.read_operations).toBe(2);
        expect(responseBody.pda.write_operations).toBe(1);
        expect(responseBody.pda.plan.intent_parsed).toBe("every night Get shopify orders and post to slack");
        expect(responseBody.pda.plan.schedule).toBe("0 2 * * *");
        expect(responseBody.pda.plan.skills_required).toContain('shopify-order-sync');
        expect(responseBody.pda.plan.skills_required).toContain('slack-digest-poster');
        expect(responseBody.pda.plan.credentials_required).toContain('shopify_api_key');
        expect(responseBody.pda.plan.credentials_required).toContain('slack_bot_token');
        expect(responseBody.pda.plan.steps).toBeDefined();
        expect(responseBody.pda.plan.steps.length).toBe(3);
        expect(responseBody.pda.plan.steps[2].depends_on).toContain('step_1');
        expect(responseBody.pda.plan.steps[2].depends_on).toContain('step_2');
        expect(responseBody.yaml).toBeDefined();
        expect(responseBody.yaml).toContain('intent_parsed: every night Get shopify orders and post to slack');
        expect(responseBody.yaml).toContain('action_type: READ');
        expect(responseBody.yaml).toContain('action_type: WRITE');
    });

    test("handles valid POST request with email intent", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "Summarize status and send an email",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody.pda.plan.skills_required).toContain('gmail-drafter');
        expect(responseBody.pda.plan.credentials_required).toContain('google_oauth_token');
        expect(responseBody.pda.plan.steps.length).toBe(3);
        expect(responseBody.pda.read_operations).toBe(2);
        expect(responseBody.pda.write_operations).toBe(1);
    });

    test("handles valid POST request with generic intent", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "Do something else",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(200);
        expect(responseBody.pda.plan.skills_required).toContain('generic-web-search');
        expect(responseBody.pda.plan.credentials_required).toHaveLength(0);
        expect(responseBody.pda.plan.steps.length).toBe(3);
        expect(responseBody.pda.plan.steps[0].action_type).toBe('READ');
        expect(responseBody.pda.plan.steps[2].action_type).toBe('WRITE');
        expect(responseBody.pda.read_operations).toBe(2);
        expect(responseBody.pda.write_operations).toBe(1);
    });

    test("rejects non-POST methods", async () => {
        const req = {
            method: 'GET',
            body: {}
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(405);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing prompt", async () => {
        const req = {
            method: 'POST',
            body: {
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("rejects missing user_id", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "Do something else"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(400);
        expect(responseBody.error).toBeDefined();
    });

    test("handles OPTIONS method for CORS", async () => {
        const req = {
            method: 'OPTIONS',
        } as any;

        let statusCode = 200;
        let responseBody: any = null;
        const headers: Record<string, string> = {};

        const res = {
            set: (k: string, v: string) => {
                headers[k] = v;
            },
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);
        expect(statusCode).toBe(204);
        expect(headers['Access-Control-Allow-Methods']).toBe('POST');
    });

    test("handles LLM errors gracefully", async () => {
        const req = {
            method: 'POST',
            body: {
                prompt: "trigger an error",
                user_id: "test-user-123"
            }
        } as any;

        let statusCode = 200;
        let responseBody: any = null;

        const res = {
            set: (k: string, v: string) => {},
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
            },
            send: (body: string) => {
                responseBody = body;
            }
        } as any;

        const { orchestratorHandler } = require('./orchestrator');

        await orchestratorHandler(req, res);

        expect(statusCode).toBe(500);
        expect(responseBody.error).toBe("Simulated LLM Error");
    });
});

describe("Manifest Validation", () => {
    test("accepts valid manifest", () => {
        const validManifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a', 'skill-b'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: [], action_type: 'READ' },
                { id: 'step_2', description: 'B', worker: 'w_b', skills: ['skill-b'], credentials: [], depends_on: ['step_1'], action_type: 'WRITE' }
            ]
        };
        const availableSkills = ['skill-a', 'skill-b'];

        expect(validateManifest(validManifest, availableSkills)).toBe(true);
    });

    test("rejects manifest with unknown skill", () => {
        const manifest: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['unknown-skill'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['unknown-skill'], credentials: [], depends_on: [], action_type: 'READ' },
            ]
        };
        const availableSkills = ['skill-a', 'skill-b'];

        expect(validateManifest(manifest, availableSkills)).toBe(false);
    });

    test("rejects manifest with cycle in DAG", () => {
        const manifestWithCycle: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: ['step_2'], action_type: 'READ' },
                { id: 'step_2', description: 'B', worker: 'w_b', skills: ['skill-a'], credentials: [], depends_on: ['step_1'], action_type: 'WRITE' }
            ]
        };
        const availableSkills = ['skill-a'];

        expect(validateManifest(manifestWithCycle, availableSkills)).toBe(false);
    });

    test("rejects manifest with missing dependency", () => {
        const manifestMissingDep: SwarmManifest = {
            version: "1.0",
            intent_parsed: "Do it",
            skills_required: ['skill-a'],
            credentials_required: [],
            steps: [
                { id: 'step_1', description: 'A', worker: 'w_a', skills: ['skill-a'], credentials: [], depends_on: ['step_does_not_exist'], action_type: 'READ' },
            ]
        };
        const availableSkills = ['skill-a'];

        expect(validateManifest(manifestMissingDep, availableSkills)).toBe(false);
    });
});
