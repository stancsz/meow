import * as functions from 'firebase-functions';
import { WorkerPayload, WorkerResponse, SkillManifest } from './types.js';

/**
 * Stub function for loading JIT skills
 */
async function loadSkill(skillRef: string): Promise<SkillManifest> {
  console.log(`[Worker] Loading skill: ${skillRef}`);
  // JIT Placeholder
  return {
    skill_name: 'shopify-read-orders',
    version: '1.0.0',
    required_credentials: ['shopify_api_key'],
    allowed_domains: ['*.myshopify.com'],
    description: 'Stub for shopify-read-orders skill',
  };
}

/**
 * Stub function for fetching decrypted KMS credentials
 */
async function fetchDecryptedCredential(credentialId: string): Promise<string> {
  console.log(`[Worker] Fetching KMS-decrypted credential for ID: ${credentialId}`);
  // KMS Placeholder
  return 'mock_api_key_123';
}

/**
 * Stub function for executing the task
 */
async function executeTask(
  manifest: SkillManifest,
  credential: string,
  params: any
): Promise<any> {
  console.log(`[Worker] Executing task with skill: ${manifest.skill_name}`);
  // For the 'shopify-read-orders' skill, simulate an HTTP GET to the Shopify API using the credential and return mock order data.
  return {
    orders: [
      { id: 'order_1', total_price: '100.00' },
      { id: 'order_2', total_price: '50.00' },
    ],
  };
}

/**
 * Stub function for writing result back to the Sovereign Motherboard (Supabase)
 */
async function writeResultToMotherboard(
  sessionId: string,
  taskId: string,
  result: any
): Promise<void> {
  console.log(
    `[Worker] Writing result to user Supabase session: ${sessionId}, task: ${taskId}`
  );
  // Supabase client call placeholder
}

export const worker = functions.https.onRequest(async (req, res) => {
  try {
    const payload = req.body as WorkerPayload;

    if (!payload.sessionId || !payload.taskId || !payload.skillRef || !payload.credentialId) {
      res.status(400).json({
        success: false,
        error: 'Missing required payload fields: sessionId, taskId, skillRef, credentialId',
      } as WorkerResponse);
      return;
    }

    // TODO: Implement idempotency check here (SWARM_SPEC.md §8.3)
    // Example: Check if transaction_log already has this execution.

    const skillManifest = await loadSkill(payload.skillRef);
    const credential = await fetchDecryptedCredential(payload.credentialId);

    const output = await executeTask(skillManifest, credential, payload.parameters);

    await writeResultToMotherboard(payload.sessionId, payload.taskId, output);

    const response: WorkerResponse = {
      success: true,
      taskId: payload.taskId,
      output,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('[Worker] Task execution failed:', error);
    const response: WorkerResponse = {
      success: false,
      taskId: req.body?.taskId || 'unknown',
      error: error.message || 'Unknown error occurred',
    };
    res.status(500).json(response);
  }
});
