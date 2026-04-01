import { DBClient } from "../src/db/client";
import { parseIntentToManifest } from "../src/core/llm";
import { executeSwarmManifest } from "../src/core/dispatcher";

async function runIntegrationTest() {
  console.log("Starting End-to-End Integration Test for Swarm Orchestrator...");

  // 1. Initialize local DB (in-memory)
  console.log("1. Initializing in-memory SQLite Motherboard database...");
  const dbClient = new DBClient("sqlite://:memory:");
  const testUserId = "test-user-" + Date.now();

  // Apply motherboard schema
  const schema = await Bun.file("src/db/migrations/001_motherboard.sql").text();
  dbClient.applyMigration(schema);

  // Set local KMS to bypass external calls
  process.env.KMS_PROVIDER = "local";

  // Provide mock Supabase credentials for the test user to bypass the worker credential check
  const { platformDbMock } = await import("../src/workers/template");
  const { getKMSProvider } = await import("../src/security/kms");

  const kmsProvider = getKMSProvider();
  const encryptedMockKey = await kmsProvider.encrypt("mock-service-role-key-for-testing");
  platformDbMock.set(testUserId, {
    supabaseUrl: "http://localhost:8000",
    encryptedKey: encryptedMockKey
  });

  // 2. Call orchestrator with test intent
  const intent = "Fetch a mock greeting";
  console.log(`\n2. User provided intent: "${intent}"`);
  console.log("Parsing intent into SwarmManifest using LLM (this may take a moment)...");

  const availableSkills = ["mock-greeting", "mock-fetch", "echo"];
  let manifest;
  try {
    manifest = await parseIntentToManifest(intent, availableSkills);
    console.log("Generated Manifest:");
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error("Failed to parse intent:", error);
    process.exit(1);
  }

  // Create session
  const context = { prompt: intent, availableSkills };
  const sessionId = dbClient.createSession(testUserId, context, manifest);
  console.log(`Created Orchestrator Session ID: ${sessionId}`);

  // 3. Call executeSwarmManifest
  console.log("\n3. Dispatching executeSwarmManifest...");
  dbClient.updateSessionStatus(sessionId, 'approved');

  // Note: executeSwarmManifest returns a Promise<Record<string, WorkerResult>>
  const results = await executeSwarmManifest(manifest, sessionId, dbClient);
  console.log("Execution Loop Finished.");

  // 4. Poll / Query task_results table
  console.log("\n4. Verifying results in Sovereign Motherboard (task_results table)...");

  // Small delay to ensure DB writes are fully flushed if any async behavior
  await new Promise(resolve => setTimeout(resolve, 500));

  const query = dbClient.db.query("SELECT * FROM task_results WHERE session_id = ?");
  const savedResults = query.all(sessionId) as any[];

  if (savedResults.length === 0) {
    console.error("FAILED: No task results found in the database for this session.");
    process.exit(1);
  }

  console.log(`Found ${savedResults.length} task result(s).`);
  let allSuccess = true;
  for (const row of savedResults) {
    console.log(`\nTask Result (Worker ID: ${row.worker_id}):`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Skill Ref: ${row.skill_ref}`);
    console.log(`  Output: ${row.output}`);

    if (row.status !== "success") {
      allSuccess = false;
    }
  }

  // 5. Cleanup / Conclusion
  if (allSuccess) {
    console.log("\nSUCCESS: End-to-end integration test passed!");
    process.exit(0);
  } else {
    console.error("\nFAILED: One or more tasks did not complete successfully.");
    process.exit(1);
  }
}

runIntegrationTest().catch((error) => {
  console.error("Unhandled error during integration test:", error);
  process.exit(1);
});
