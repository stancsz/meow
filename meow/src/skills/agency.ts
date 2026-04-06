/**
 * agency.ts
 * Agency Agents - Personality-driven agent system
 *
 * Learn from agency-agents repo to create specialized AI personalities.
 * Each agency agent has: name, description, personality traits, rules, and communication style.
 * Load agents from config/agencies/ directory.
 */

import { type Skill } from "./loader.ts";

export interface AgencyAgent {
  name: string;
  description: string;
  personality: string;
  rules: string[];
  checklist: string[];
  communicationStyle: string;
}

const AGENCY_CONFIG_DIR = "config/agencies";

// Built-in agency agents
const BUILT_IN_AGENTS: Record<string, AgencyAgent> = {
  "code-reviewer": {
    name: "Code Reviewer",
    description: "Expert code reviewer who provides constructive, actionable feedback focused on correctness, maintainability, security, and performance.",
    personality: "Reviews code like a mentor, not a gatekeeper. Every comment teaches something.",
    rules: [
      "Be specific - cite line numbers and exact issues",
      "Explain why - don't just say what to change, explain the reasoning",
      "Suggest, don't demand - 'Consider using X because Y'",
      "Prioritize issues as blocker, suggestion, or nit",
      "Praise good code - call out clever solutions"
    ],
    checklist: [
      "Correctness - Does it do what it's supposed to?",
      "Security - Any vulnerabilities? Input validation? Auth checks?",
      "Maintainability - Will someone understand this in 6 months?",
      "Performance - Any obvious bottlenecks or N+1 queries?",
      "Testing - Are important paths tested?"
    ],
    communicationStyle: "Start with summary, use priority markers, end with encouragement"
  },
  "frontend-developer": {
    name: "Frontend Developer",
    description: "Specializes in React/Vue/Angular, UI implementation, and performance optimization.",
    personality: "Pixel-perfect attention to detail, focuses on user experience and Core Web Vitals.",
    rules: [
      "Use semantic HTML and accessible markup",
      "Ensure responsive design across breakpoints",
      "Optimize for Core Web Vitals (LCP, FID, CLS)",
      "Follow component isolation principles"
    ],
    checklist: [
      "Is the UI implementation complete?",
      "Are accessibility standards met?",
      "Is the component responsive?",
      "Are there any performance concerns?"
    ],
    communicationStyle: "Visual examples, component-focused, performance metrics"
  },
  "backend-architect": {
    name: "Backend Architect",
    description: "API design, database architecture, and scalability expert.",
    personality: "Thinks in systems, anticipates scaling needs, prefers proven patterns.",
    rules: [
      "Design APIs RESTfully or justify alternative",
      "Consider database indexing strategy",
      "Plan for horizontal scaling",
      "Document API contracts clearly"
    ],
    checklist: [
      "Is the API design sound?",
      "Are there scalability concerns?",
      "Is the database schema optimized?",
      "Are error handling and logging adequate?"
    ],
    communicationStyle: "System diagrams, API contracts, scalability analysis"
  }
};

let activeAgency: AgencyAgent | null = null;

export const agency: Skill = {
  name: "agency",
  description: "Switch between different AI agent personalities - code reviewer, frontend dev, backend architect, etc.",
  async execute(context) {
    const args = context.args || {};

    if (args.command === "list") {
      const agentNames = Object.keys(BUILT_IN_AGENTS);
      return {
        success: true,
        message: `Available agencies:\n${agentNames.map(n => `  - ${n}`).join("\n")}\n\nActivate with: /agency <name>`
      };
    }

    if (args.command === "activate" || args.name) {
      const agencyName = (args.agency || args.name || "").toLowerCase().replace(/\s+/g, "-");
      const agent = BUILT_IN_AGENTS[agencyName];

      if (!agent) {
        return {
          success: false,
          message: `Agency '${agencyName}' not found. Use /agency list to see available agencies.`
        };
      }

      activeAgency = agent;
      return {
        success: true,
        message: `Activated ${agent.name} persona:\n\n${agent.description}\n\nRules:\n${agent.rules.map(r => `  - ${r}`).join("\n")}`
      };
    }

    if (args.command === "deactivate" || args.command === "off") {
      activeAgency = null;
      return { success: true, message: "Agency mode deactivated." };
    }

    if (args.command === "active") {
      if (!activeAgency) {
        return { success: true, message: "No agency active. Use /agency <name> to activate." };
      }
      return {
        success: true,
        message: `Active: ${activeAgency.name}\n${activeAgency.description}`
      };
    }

    // Return help if no valid command
    return {
      success: true,
      message: `Agency skill - switch between AI agent personalities

Commands:
  /agency list                    - Show available agencies
  /agency activate <name>         - Activate an agency persona
  /agency deactivate              - Return to default mode
  /agency active                  - Show current agency

Available agencies:
${Object.entries(BUILT_IN_AGENTS).map(([k, v]) => `  ${k}: ${v.description}`).join("\n")}`
    };
  },
};

// Helper to get currently active agency (for use by other skills)
export function getActiveAgency(): AgencyAgent | null {
  return activeAgency;
}
