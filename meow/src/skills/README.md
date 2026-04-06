# Meow Companion

**Embers** — a Maine Coon kitten companion that remembers you, grows over time, and has personality.

## Quick Start

```bash
npm install && npm run dev
```

## Features

- **Memory** — Remembers you across sessions
- **Mood** — Content, playful, sleepy, curious, or sassy
- **Growth** — Evolves from kitten to mature companion
- **Personality** — Warm, playful, occasionally sassy

## Project Structure

```
src/skills/
├── memory.ts    # User memory & conversation summaries
├── companion.ts # Behaviors, mood, greetings
├── growth.ts    # XP & level progression
└── notes.ts     # Little messages to user
```

## Levels

| Level | Stage | Traits |
|-------|-------|--------|
| 1 | Newborn | Default cute |
| 5 | Kitten | Playful, remembers |
| 10 | Young cat | Loyal, attitude |
| 20 | Mature | Unique personality |
