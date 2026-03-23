---
name: mock-fetch
description: A mock data fetching skill designed to test the worker dispatch and execution flow.
version: 1.0
---

# Mock Fetch Skill

This skill allows the agent to fetch a payload of mock data from a public API endpoint.

## Usage

When this skill is loaded, it simulates reading from an external API (like JSONPlaceholder)
to validate that network calls, credential passing (if any), and result logging work
end-to-end within the Swarm orchestrator.

## Return Value

A structured JSON output containing the fetched data.
