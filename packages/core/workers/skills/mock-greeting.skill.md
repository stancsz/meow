---
skill_name: mock-greeting
required_credentials: []
---

# Mock Greeting Skill

This is a mock greeting skill designed to test the worker dispatch and execution flow for SimpleClaw Phase 0.

## Execution Logic

When this skill is loaded, the worker should execute the following behavior:

1. Return a hardcoded JSON object containing a mock greeting message.
2. The output should be logged to the local SQLite Motherboard via `DBClient.logTaskResult`.
