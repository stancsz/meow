# use browseros to talk to [gemini.com](https://gemini.google.com/)
"Using browseros, visit gemini.google.com and search for 'Agentic AI advancements' in the last 24 hours.

Instructions for Continuity:

Current Benchmark: Identify the top 3 features of Claude Code (CLI focus) and Eigent (Desktop focus) as of April 2026.

Gap Analysis: Compare these to the current ./meow-agent-kernel.

Action: If a discrepancy exists, write a specific implementation plan to ./kernel/roadmaps/gap_closure.md.

Self-Correction: If you find you have reached a dead end, search for the latest 'Agentic AI Postmortem' or 'Architecture Analysis' to find a new path.

Persistence: Do not stop until you have proposed a PR-ready architecture update. If the work is complete, perform a 'Quality Scan' of your own proposal and look for one further optimization in performance or latency."

# Dogfood agent-kernel
"Initialize a 'Dogfooding Loop' for the agent-kernel.

The Workflow:

Capabilities Audit: Run all tests in ./tests/capabilities. Match them against the Claude Code feature list (Terminal control, file diffing, context window management).

Iterative Fix: If a test fails or a capability is missing, you are authorized to modify the kernel code to fix it.

Validation: After every code change, re-run the tests.

Improvement Phase: If all tests pass, analyze the agent-kernel for 'Token Efficiency'—can you reduce the system prompt length or improve the reasoning-to-action ratio?

Loop Rule: If tests fail, you must stay in the loop. If tests pass, you move to the 'Improvement Phase'. Only terminate if no further performance gains > 5% are identified."


# Desktop Agent Development
"In ./agent-harness/computer, build a functional Desktop Agent.

Build-Test-Improve Loop:

Tool Integration: Map the tools in tool-registry.ts (Click, Type, Screenshot, OCR) to a central computer_controller.ts.

Benchmarking: Compare your current logic to the architecture of Goose (Rust-based performance) and Eigent (Multi-agent coordination).

Continuous Execution: >    - Step A: Implement a 'Screen Recognition' module.

Step B: Run the ./scripts/test-desktop-nav.sh simulation.

Step C: If it fails, use the error logs to refactor computer_controller.ts.

Polish: Once navigation works, implement 'Human-in-the-Loop' triggers (like Eigent) for uncertain actions.

Continuity: If any logic is incomplete, describe the current state in BUILD_STATUS.md and immediately start the next step. Do not exit until the agent can successfully perform a multi-app task (e.g., 'Open Browser, copy text, paste into Notepad')."