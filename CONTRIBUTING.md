# Contributing to MEOW

Welcome! MEOW is an open-source autonomous coding harness and contributions are welcome.

## Getting Started

```bash
git clone https://github.com/stancsz/meow.git
cd meow
npm install
npx tsx src/index.ts "your task here"
```

## Dev Workflow

```bash
npm run dev        # REPL mode
npm run tui        # TUI mode
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run test       # Vitest
```

## Submitting Changes

1. Fork the repo
2. Create a branch: `git checkout -b fix/my-fix`
3. Make your changes + add tests
4. Run `npm run check` to verify typecheck + lint pass
5. Open a PR

## MEOW-3-RULE for contributors

If you fix MEOW (not a task), after your fix:
1. Re-run the original task with `meow -p`
2. If it succeeds → open a PR to stancsz/meow

## Code Structure

```
src/
  agent/           # LLM chat, summoner, mission_reviewer, quantum_memory
  orchestrator/    # Orchestrator, TaskQueue, convergence checks
  kernel/          # MeowKernel, database
  cli/             # REPL, TUI
  extensions/      # Tool definitions
  types/           # Tool schema
```

## Style

- TypeScript strict mode
- ESM modules
- No `TODO`/`FIXME` in committed code (quality gate: NO_MOCKS)
- Think-Plan-Verify in commit messages
