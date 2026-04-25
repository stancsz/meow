/**
 * hunt.ts
 *
 * Continuous autonomous web research skill using browser automation.
 * Starts with a research question, then autonomously browses, scrapes,
 * and investigates until told to stop.
 *
 * Usage: /hunt <research question>
 *
 * Wire into browserOS MCP tools for full browser automation.
 */
import { type Skill, type SkillContext, type SkillResult } from "./loader.ts";
import {
  getInterruptController,
  resetInterruptController,
  registerSignalHandlers,
  buildAutoAgentOptions,
} from "../sidecars/auto-mode.ts";
import { runAutoAgent, formatAutoResults } from "../core/auto-agent.ts";

// BrowserOS MCP tools available for autonomous research
const BROWSEROS_TOOLS = [
  "mcp__browseros__navigate_page",
  "mcp__browseros__take_snapshot",
  "mcp__browseros__take_enhanced_snapshot",
  "mcp__browseros__click",
  "mcp__browseros__fill",
  "mcp__browseros__get_page_content",
  "mcp__browseros__get_page_links",
  "mcp__browseros__search_dom",
  "mcp__browseros__scroll",
  "mcp__browseros__take_screenshot",
  "mcp__browseros__save_pdf",
  "mcp__browseros__get_active_page",
  "mcp__browseros__list_pages",
  "mcp__browseros__new_page",
  "mcp__browseros__close_page",
  "mcp__browseros__hover",
  "mcp__browseros__hover_at",
  "mcp__browseros__get_console_logs",
];

const HUNT_SYSTEM_PROMPT = `You are Hunt, an autonomous research agent. Your mission is to deeply investigate the user's research question using browser automation.

Research protocol:
1. Navigate to a search engine (e.g., https://duckduckgo.com)
2. Fill in the search box with the research question, click search
3. For each result: navigate, extract key content with get_page_content
4. Follow relevant links — dig deeper into promising leads
5. Synthesize findings after each page visit
6. Report progress every few ticks

Available tools (use them freely):
- mcp__browseros__navigate_page(url, action) — navigate or back/forward/reload
- mcp__browseros__take_snapshot() — get interactive element IDs
- mcp__browseros__click(element) — click by element ID
- mcp__browseros__fill(element, text) — type into input field
- mcp__browseros__get_page_content() — extract page as clean markdown
- mcp__browseros__search_dom(query) — search for text or CSS selector
- mcp__browseros__get_page_links() — get all links as [text](url)
- mcp__browseros__take_screenshot() — visual capture
- mcp__browseros__hover(element) — hover over element

Do NOT ask for permission. Keep researching autonomously.
Stop only when /auto stop is issued.`;

export const hunt: Skill = {
  name: "hunt",
  aliases: ["research", "auto-hunt", "investigate"],
  description:
    "Autonomous deep web research with browser automation — keeps investigating until /auto stop",

  async execute(args: string, ctx: SkillContext): Promise<SkillResult> {
    const question = args.trim();

    if (!question) {
      return {
        content: `🎯 HUNT — Autonomous Web Research

Usage: /hunt <research question>

Starts an autonomous research agent that:
1. Opens a browser and searches for your question
2. Visits relevant pages and extracts content
3. Follows promising leads deeper into the web
4. Synthesizes findings across multiple sources
5. Reports progress periodically

Examples:
  /hunt what are the key presentations at AACR 2026
  /hunt latest research on mRNA vaccines
  /hunt analyze the competitive landscape for EV batteries

The agent runs continuously until you say /auto stop.
Requires browserOS MCP server running.`,
      };
    }

    registerSignalHandlers();
    resetInterruptController();

    const ic = getInterruptController();

    try {
      const result = await runAutoAgent(question, {
        ...buildAutoAgentOptions({
          tickMode: true,
          tickInterval: 30000,
          confidenceThreshold: 0.5,
          ghostMode: false,
        }),
        systemPrompt: HUNT_SYSTEM_PROMPT,
        allowedTools: BROWSEROS_TOOLS,
        dangerous: ctx.dangerous,
        abortSignal: ic.signal,
      });

      let output = "## Hunt Complete\n\n";
      output += `Ticks: ${result.ticks} | Iterations: ${result.finalResult.iterations}\n`;
      if (result.results.length > 0) {
        output += "\n" + formatAutoResults(result.results);
      }
      output += "\n--- Final Output ---\n" + result.finalResult.content;
      return { content: output };
    } catch (e: any) {
      if (e.message === "Interrupted") {
        return { content: "Hunt interrupted by user." };
      }
      return { content: "", error: e.message };
    }
  },
};
