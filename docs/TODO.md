# TODO

## meow CLI — become as beautiful and capable as Claude Code

- [x] TUI: Rich terminal UI with colors, borders, status indicators (2026-04-08)
- [x] Help system: `meow help` with categorized commands, keyboard shortcuts (2026-04-08)
- [x] Interactive REPL: multi-line input, history, tab completion (2026-04-08)
- [x] Progress indicators: spinners, progress bars for long operations (2026-04-08)
- [x] Error formatting: beautiful error messages with suggestions (2026-04-08)
- [x] Status bar: show current mode, branch, session info (2026-04-08)
- [x] Onboarding: first-run experience, tutorial walkthrough (2026-04-09)
- [x] Session management: named sessions, session preview, easy resume
- [x] Tool output formatting: pretty-printed JSON, tables, trees (2026-04-09)
- [x] Self-improvement loop: learn from hermes-agent (nousresearch/hermes-agent) and mempalace (milla-jovovich/mempalace)
  - **DONE**: FTS5 cross-session memory recall, Trajectory compression, LLM summarization, Periodic nudges, autonomous skill creation from experience

## meow CLI — Learn from MemPalace (milla-jovovich/mempalace)

MemPalace achieved 96.6% on LongMemEval benchmark with raw verbatim storage + FTS5. Key insights:
- **Store everything verbatim** — no summarization on ingest (burns tokens at query time, not storage time)
- **Palace metaphor** — wings (projects/people), rooms (topics), closets (specific ideas)
- **mine command** — extract structured memories from session logs (decisions, preferences, problems, milestones)
- **wake-up command** — dump compact context (~170 tokens) for new sessions
- **MCP tools** — expose memory as tools AI can call autonomously

- [ ] **Palace memory structure**: Implement wings/rooms/closets hierarchy in memory-fts.ts (extend FTS5 schema with wing/room/closet metadata)
- [ ] **mine sessions**: Extract structured memories from session logs — decisions, preferences, problems, milestones, emotional context. Run automatically after each session ends.
- [ ] **wake-up context**: Generate compact ~170-token summary of current project state for new sessions. Store in ~/.agent-kernel/wake-up.txt, load on session start.
- [ ] **MCP memory tools**: Expose memory_search, memory_store, memory_recall as MCP tools. Auto-register on startup.
- [ ] **Verbatim session storage**: Store full session JSONL in memory-fts, not just auto-learned facts. FTS5 handles the retrieval.

## meowpaw — become as beautiful and capable as tmp/opencowork

- [x] Desktop UI: Electron + Next.js dashboard (2026-04-08)
- [x] Window management: minimize, maximize, tray icon (2026-04-08)
- [x] Rich editor view: command palette, sidebar, tabs (2026-04-08)
- [x] Visualization: session timeline, task boards, memory graphs
- [x] Settings UI: preferences panel, theme switcher (2026-04-08)
- [x] Notifications: system notifications for long-running tasks (2026-04-08)
- [ ] Internationalization: i18n support for future localization

