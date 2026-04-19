/**
 * skills/review.ts
 *
 * Code review skill - uses LLM to analyze code and provide feedback.
 */
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import type { Skill, SkillContext, SkillResult } from "./loader.ts";

function createLLMClient() {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || "https://api.minimax.io/v1";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  return new OpenAI({ apiKey, baseURL });
}

export const review: Skill = {
  name: "review",
  description: "Review code and provide constructive feedback",
  aliases: ["cr", "analyze"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    if (!args) {
      return { content: "", error: "Usage: /review <filepath>" };
    }

    const path = args.trim();

    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");

      // Detect language from file extension
      const ext = path.split(".").pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        ts: "TypeScript",
        tsx: "TypeScript/React",
        js: "JavaScript",
        jsx: "JavaScript/React",
        py: "Python",
        rs: "Rust",
        go: "Go",
        java: "Java",
        c: "C",
        cpp: "C++",
        cs: "C#",
        rb: "Ruby",
        php: "PHP",
      };
      const lang = langMap[ext || ""] || "code";

      const client = createLLMClient();
      const model = process.env.LLM_MODEL || "MiniMax-M2.7";

      const reviewPrompt = `You are an expert code reviewer. Analyze the following ${lang} code and provide constructive feedback.

Focus on:
1. **Correctness** - bugs, edge cases, error handling
2. **Security** - vulnerabilities, injection risks, sensitive data
3. **Performance** - algorithmic efficiency, memory usage, N+1 queries
4. **Maintainability** - code clarity, naming, documentation
5. **Best practices** - language idioms, design patterns, testing

Format your response as:
## Code Review: <filename>

### Summary
<2-3 sentence overview>

### Issues Found
< bulleted list of specific issues with line references if possible>

### Suggestions
< actionable improvements >

### Praise (if deserved)
< what's done well >

\`\`\`${lang}
${content}
\`\`\``;

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: reviewPrompt }],
        temperature: 0.3,
      });

      const review = response.choices[0]?.message?.content?.trim();

      if (!review) {
        return { content: "", error: "LLM returned empty response" };
      }

      // Add quick stats header
      const issueCount = (review.match(/Issues? Found/i) || []).length;
      const hasIssues = review.toLowerCase().includes("issue") || review.toLowerCase().includes("problem");

      return {
        content: `## Code Review: ${path}\n**Lines:** ${lines.length} | **Language:** ${lang}\n\n${review}`,
      };
    } catch (e: any) {
      return { content: "", error: `Failed to review: ${e.message}` };
    }
  },
};
