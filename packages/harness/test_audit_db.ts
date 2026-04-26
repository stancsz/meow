// Test script to verify reasoning_audit.db functionality
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "reasoning_audit.db");

// Ensure data dir
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// Open DB
const db = new Database(DB_PATH);

// Check schema
console.log("=== reasoning_audit.db Schema Check ===");
const schema = db.prepare("PRAGMA table_info(reasoning_audit)").all();
console.log("Columns:");
for (const col of schema) {
  console.log(`  ${col.name}: ${col.type}`);
}

// Insert test trace
console.log("\n=== Inserting Test Trace ===");
const id = `test_${Date.now()}`;
const sessionId = "test-session-001";
const taskId = "test-task-001";
const taskDescription = "Dogfood test - verify reasoning audit works";
const timestamp = Date.now();

db.prepare(`
  INSERT INTO reasoning_audit 
    (id, session_id, task_id, task_description, phase, reasoning, tool_calls, outcome, duration_ms, timestamp, lessons_learned, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  id,
  sessionId,
  taskId,
  taskDescription,
  "act",
  "Testing the ReasoningAudit class by inserting a trace",
  JSON.stringify([{ id: "tc-1", name: "shell", arguments: { cmd: "echo test" } }]),
  "success",
  150,
  timestamp,
  null,
  JSON.stringify(["dogfood", "test"])
);

// Query back
console.log("\n=== Querying Traces ===");
const traces = db.prepare("SELECT * FROM reasoning_audit ORDER BY timestamp DESC LIMIT 5").all();
console.log(`Found ${traces.length} traces`);

for (const trace of traces) {
  console.log("\n--- Trace ---");
  console.log("ID:", trace.id);
  console.log("Task:", trace.task_description);
  console.log("Outcome:", trace.outcome);
  console.log("Duration:", trace.duration_ms, "ms");
  console.log("Tags:", trace.tags);
}

// Stats
console.log("\n=== Statistics ===");
const total = db.prepare("SELECT COUNT(*) as cnt FROM reasoning_audit").get();
console.log("Total traces:", total.cnt);

const stats = db.prepare(`
  SELECT outcome, COUNT(*) as count 
  FROM reasoning_audit 
  GROUP BY outcome
`).all();
console.log("By outcome:", stats);

// Cleanup test trace
db.prepare("DELETE FROM reasoning_audit WHERE id = ?").run(id);
console.log("\n=== Cleanup ===");
console.log("Test trace deleted");

db.close();
console.log("\n✅ SUCCESS: reasoning_audit.db is functional!");