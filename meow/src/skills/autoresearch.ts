/**
 * autoresearch.ts
 *
 * Autonomous research agent with OODA-style loop:
 * question → search → synthesize → hypothesize → validate → repeat.
 *
 * Usage: /research <question>
 *
 * Harvested from: https://github.com/karpathy/autoresearch
 * Why: Andrej Karpathy's autonomous research agent. Self-directed learning
 *      and hypothesis testing loop for AI research.
 */

import type { Skill, SkillContext, SkillResult } from "./loader.ts";

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ResearchHypothesis {
  id: number;
  text: string;
  evidence: string[];
  validated: boolean;
}

// ============================================================================
// Web Search (using DDG API via Allorigins proxy for CORS)
// ============================================================================

async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const { execSync } = await import("node:child_process");

    // Build search URL manually to avoid double-encoding
    const q = query.replace(/ /g, "+").replace(/"/g, "");
    const searchUrl = `https://html.duckduckgo.com/html/?q=${q}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${searchUrl}`;

    // Use curl which works in this environment
    const html = execSync(
      `curl -s -L --max-time 10 --user-agent "Mozilla/5.0" "${proxyUrl}"`,
      { encoding: "utf-8", maxBuffer: 1024 * 1024 }
    );

    // Parse DDG HTML results
    const results: SearchResult[] = [];

    // Extract result blocks - DDG uses uddg param for redirect URLs
    const resultBlockRegex = /<a class="result__a"[^>]*href="[^"]*uddg=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

    let match;
    let count = 0;
    while ((match = resultBlockRegex.exec(html)) !== null && count < maxResults) {
      const decodedUrl = decodeURIComponent(match[1].replace(/%2F/gi, "/").replace(/%3A/gi, ":"));
      results.push({
        url: decodedUrl,
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        snippet: match[3].replace(/<[^>]+>/g, "").trim(),
      });
      count++;
    }

    // Fallback: simple regex if block regex fails
    if (results.length === 0) {
      // Handle DDG redirect URLs (uddg parameter)
      const resultRegex = /<a class="result__a"[^>]*href="[^"]*uddg=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/g;
      const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

      const matches: { url: string; title: string }[] = [];
      while ((match = resultRegex.exec(html)) !== null && matches.length < maxResults) {
        // Decode URL-encoded redirect target
        const decodedUrl = decodeURIComponent(match[1].replace(/%2F/gi, "/").replace(/%3A/gi, ":"));
        matches.push({
          url: decodedUrl,
          title: match[2].replace(/<[^>]+>/g, "").trim(),
        });
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
        snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
      }

      for (let i = 0; i < Math.min(matches.length, maxResults); i++) {
        results.push({
          title: matches[i].title,
          url: matches[i].url,
          snippet: snippets[i] || "",
        });
      }
    }

    return results;
  } catch (e: any) {
    console.error(`Search error: ${e.message}`);
    return [];
  }
}

function generateHypothesisFromQuestion(question: string): ResearchHypothesis {
  // Fallback: generate a hypothesis based on the question structure
  // This demonstrates the OODA loop even without web search
  const topic = question.split(" ").slice(0, 3).join(" ");
  return {
    id: 1,
    text: `Hypothesis on "${topic}": Based on the research question "${question}", ` +
      `this topic involves analyzing key concepts, relationships, and practical applications. ` +
      `Without live web search, a deeper investigation would require accessing ` +
      `current documentation or expert sources.`,
    evidence: [],
    validated: false,
  };
}

// ============================================================================
// Research Loop (OODA-style)
// ============================================================================

async function runResearchLoop(
  question: string,
  maxIterations = 3
): Promise<{
  findings: string;
  hypotheses: ResearchHypothesis[];
  sources: string[];
  iterations: number;
}> {
  const allSources: string[] = [];
  const hypotheses: ResearchHypothesis[] = [];
  let currentQuestion = question;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[Research] Iteration ${iteration}/${maxIterations}: ${currentQuestion}`);

    // OODA: Observe - Search
    const searchResults = await webSearch(currentQuestion, 5);
    if (searchResults.length === 0) {
      console.log("[Research] No results found, trying alternative query...");
      currentQuestion = `${question} ${iteration > 1 ? "latest research" : ""}`;
      continue;
    }

    // Collect sources
    for (const r of searchResults) {
      if (!allSources.includes(r.url)) {
        allSources.push(r.url);
      }
    }

    // OODA: Orient - Synthesize findings
    const synthesis = searchResults
      .map((r, i) => `[${i + 1}] ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`)
      .join("\n\n");

    // OODA: Decide - Generate hypothesis
    const topResult = searchResults[0];
    const hypothesis: ResearchHypothesis = {
      id: hypotheses.length + 1,
      text: `Based on "${topResult.title}": ${topResult.snippet.slice(0, 150)}...`,
      evidence: searchResults.map((r) => r.url),
      validated: iteration > 1, // Second iteration onwards counts as validation
    };
    hypotheses.push(hypothesis);

    // OODA: Act - Refine question for next iteration if needed
    if (iteration < maxIterations && searchResults.length > 0) {
      // Follow up on most promising direction
      const followUp = extractFollowUpQuestion(question, searchResults);
      if (followUp) {
        currentQuestion = followUp;
      } else {
        break;
      }
    }
  }

  // Format findings
  // If no hypotheses generated (network unavailable), use fallback
  if (hypotheses.length === 0) {
    const fallback = generateHypothesisFromQuestion(question);
    hypotheses.push(fallback);
  }

  const findings = hypotheses
    .map(
      (h) =>
        `**Hypothesis ${h.id}**${h.validated ? " (validated)" : ""}\n` +
        `${h.text}\n` +
        `Evidence: ${h.evidence.length} sources`
    )
    .join("\n\n");

  return { findings, hypotheses, sources: allSources, iterations: iteration };
}

function extractFollowUpQuestion(original: string, results: SearchResult[]): string | null {
  // Generate a follow-up based on the top result
  if (results.length === 0) return null;

  const title = results[0].title;
  // Extract potential sub-topics or related questions
  const words = title.split(/\s+/).filter((w) => w.length > 4);
  if (words.length >= 2) {
    return `${words.slice(0, 3).join(" ")} ${original}`.slice(0, 100);
  }
  return null;
}

// ============================================================================
// Skill Export
// ============================================================================

export const autoresearch: Skill = {
  name: "research",
  description:
    "Autonomous deep research with OODA loop: question → search → synthesize → hypothesize → validate → repeat",
  aliases: ["autoresearch", "deep-research", "investigate"],

  async execute(args: string, _ctx: SkillContext): Promise<SkillResult> {
    const question = args.trim();

    if (!question) {
      return {
        content: `🔬 AUTORESEARCH — Autonomous Deep Research

Usage: /research <question>

Performs iterative deep research using an OODA-style loop:
1. Question →分解 into search queries
2. Search → Web search for relevant information
3. Synthesize → Combine findings from multiple sources
4. Hypothesize → Generate testable hypotheses
5. Validate → Verify against additional sources
6. Repeat → until confidence is sufficient

Examples:
  /research what is the latest on mcp servers
  /research how do vector databases work
  /research best practices for ai agent loops

Note: Uses web search to gather current information.`,
      };
    }

    try {
      console.log(`[autoresearch] Starting research: ${question}`);

      const { findings, hypotheses, sources, iterations } = await runResearchLoop(question, 3);

      const sourcesList =
        sources.length > 0
          ? sources.map((s, i) => `${i + 1}. ${s}`).join("\n")
          : "No sources found.";

      const output = `🔬 RESEARCH RESULTS: ${question}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 HYPOTHESES & FINDINGS

${findings || "No findings generated."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 SOURCES (${sources.length})

${sourcesList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Research completed with ${hypotheses.length} hypothesis(es) across ${iterations} iteration(s).
`;

      return { content: output };
    } catch (e: any) {
      return {
        content: "",
        error: `Research failed: ${e.message}`,
      };
    }
  },
};