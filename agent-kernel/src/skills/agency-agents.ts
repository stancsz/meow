/**
 * agency-agents.ts - Harvested skill for agency agents capability
 *
 * Learn from agency-agents repo to create a personality-driven agent skill system.
 */

import { type Skill } from "./loader.ts";

const DESCRIPTION = `# Agency Agents Capability

Learn from the agency-agents repo to create a personality-driven agent skill system.

## Core Trick

The agency-agents repo shows how to create specialized AI agents with:
- Identity: Name, personality, communication style
- Mission: Core purpose and focus areas
- Rules: Specific guidelines and checklists
- Format: Structured output for consistency

## Minimal Slice for Meow

Create src/skills/agency.ts:
1. Define an AgencyAgent interface with: name, description, personality, rules, checklist
2. Load agents from config/agencies/ directory (YAML files)
3. Each agency agent can be activated via /agency <name> command
4. When active, the agent adopts that persona for all interactions

## Why Worth It

- Enables Meow to be more than a generic assistant
- Different contexts need different approaches
- Personality-driven agents are more engaging and effective`;

export const agency_agents: Skill = {
  name: "agency-agents",
  description: DESCRIPTION,
  async execute(context) {
    // TODO: Implement agency-agents capability
    return { success: true, message: "agency-agents capability" };
  },
};
