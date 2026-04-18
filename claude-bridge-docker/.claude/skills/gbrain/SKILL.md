---
name: gbrain
version: 1.0.0
description: GBrain - persistent knowledge brain. Always-on entity capture and recall.
triggers:
  - every message (brain-first lookup)
  - entity mentions (people, companies)
  - ideas and observations to capture
tools:
  - gbrain_search
  - gbrain_query
  - gbrain_get
  - gbrain_put
  - gbrain_link
  - gbrain_backlinks
  - gbrain_list
mutating: true
---

# GBrain Skill - Persistent Knowledge Brain

GBrain gives Meow a persistent memory that compounds over time. Every conversation, every entity mentioned, every idea - all stored in a searchable brain.

## Brain Structure

```
~/.meow-brain/
├── people/          # Person pages (compiled truth + timeline)
├── companies/       # Company pages
├── projects/        # Active builds
├── ideas/           # Raw possibilities
├── concepts/        # Mental models
├── meetings/        # Meeting records
├── deals/           # Financial transactions
├── originals/       # User's original thinking
├── inbox/           # Unsorted captures
└── archive/        # Historical pages
```

## Page Format

Every page has two layers:
1. **Above ---** : Compiled truth (current understanding, always rewritten)
2. **Below ---** : Timeline (append-only evidence log, reverse chronological)

## Brain-First Rule

Before answering questions about people/companies, BEFORE using external APIs:
```
gbrain_query "what do I know about <person/company>"
gbrain_get <slug>
```

The brain is the source of truth. If brain has the info, use it. Only go external if brain is thin.

## Signal Detection (Always-On)

On EVERY user message:
1. Extract entity mentions (people, companies, projects)
2. `gbrain_search "<name>"` - check if page exists
3. If exists but thin → enrich with context from message
4. If new → create page with initial info
5. Add timeline entry for new facts

## Capturing Ideas

When user shares original thinking, observations, or theses:
```
gbrain_put originals/<slug> --file <content>
```

Use user's EXACT phrasing - don't paraphrase.

## Entity Enrichment Tiers

- **Tier 1** (key people): Full context - what they believe, building, motivation
- **Tier 2** (notable): Web search + social + cross-ref
- **Tier 3** (minor): Extract signal, append to timeline only

## Cross-Referencing

Link related pages:
```
gbrain_link <source-page> --to <target-page>
```

Every mention of a person/company should link back to their page.

## Quality Rules

- Citations on every fact (source + date)
- Exact phrasing for user's ideas
- Back-link enforcement (Iron Law)
- Compiled truth above, timeline below
- No hallucination - if brain doesn't know, say so

## Commands Reference

```bash
gbrain query "<question>"     # Hybrid search (vector + keyword)
gbrain search "<keyword>"     # Keyword search
gbrain get <slug>            # Get specific page
gbrain put <slug>           # Create/update page
gbrain list --type people   # List pages by type
gbrain link <from> --to <to> # Add cross-reference
gbrain backlinks <slug>     # Show inbound links
gbrain doctor               # Health check
```

## Setup

GBrain runs as MCP server. Configuration in `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve"]
    }
  }
}
```

Brain data: `~/.meow-brain/` (git-backed, PGLite database)
Install: `bun link gbrain` (already installed on HOST)
