# Meowju Coworker (OpenWork Equivalent)

High-fidelity dashboard for the Meowju swarm.

## Features
- **Mission Control**: Live visualization of the OODA loop (Observe, Orient, Decide, Act).
- **Swarm Vitals**: Real-time status of parallel wings, CPU/Memory, and LLM throughput.
- **Memory Palace**: Visual explorer for the Sovereign Palace episodic and semantic memory.
- **Curiosity Backlog**: Drag-and-drop mission prioritization from the curiosity loop pulses.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + Shadcn UI
- **Real-time**: Server-Sent Events (SSE) or Poll-based syncing with `agent-harness/data/`.

## Architectural Alignment
Inspired by `different-ai/openwork`, this dashboard bridges the gap between "Black Box" agent execution and human-collaborative "Coworking".
