---
name: agency-agents
repo: https://github.com/msitarzewski/agency-agents
docPath: engineering/engineering-code-reviewer.md
why: Agency agents provide specialized AI personalities for different tasks - code review, frontend, backend, etc. Enables Meow to adopt different personas for different contexts.
minimalSlice: "Create src/skills/agency.ts that defines an agent personality system. Each agency agent has: name, description, personality traits, rules, and communication style. Load agents from YAML/JSON config files."
fit: skill
complexity: 2
status: pending
---

# Agency Agents Capability

Learn from the agency-agents repo to create a personality-driven agent skill system.

## Core Trick

The agency-agents repo shows how to create specialized AI agents with:
- **Identity**: Name, personality, communication style
- **Mission**: Core purpose and focus areas
- **Rules**: Specific guidelines and checklists
- **Format**: Structured output for consistency

## Minimal Slice for Meow

Create `src/skills/agency.ts`:

1. Define an AgencyAgent interface with:
   - name, description, personality, rules, checklist
2. Load agents from `config/agencies/` directory (YAML files)
3. Each agency agent can be activated via `/agency <name>` command
4. When active, the agent adopts that persona for all interactions

## Why Worth It

- Enables Meow to be more than a generic assistant
- Different contexts need different approaches
- Personality-driven agents are more engaging and effective
- Natural extension of the existing skill system
