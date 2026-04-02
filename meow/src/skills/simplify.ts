/**
 * skills/simplify.ts
 *
 * Simplify/refactor code while preserving behavior.
 * Uses the LLM to analyze and suggest simplifications.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

export const simplify: Skill = {
  name: "simplify",
  description: "Simplify and refactor code while preserving behavior",
  aliases: ["refactor", "clean"],

  async execute(args: string, context: SkillContext): Promise<SkillResult> {
    // Handle --apply flag
    if (args.startsWith("--apply ")) {
      const path = args.slice(8).trim();
      return applySimplification(path);
    }

    if (!args || args.startsWith("--")) {
      return { content: "", error: "Usage: /simplify <filepath>\n       /simplify --apply <filepath>" };
    }

    const path = args.trim();

    try {
      const content = readFileSync(path, "utf-8");

      const client = createLLMClient();
      const model = process.env.LLM_MODEL || "MiniMax-M2.7";

      // Prompt for simplification
      const simplifyPrompt = `You are a code refactoring assistant. Simplify the following code while preserving behavior exactly.

Rules:
1. Preserve all functionality - do not change what the code does
2. Remove redundant code, dead code, and comments
3. Simplify complex conditionals and nested structures
4. Use more idiomatic language patterns
5. Do not add new features or change behavior

IMPORTANT: Output ONLY the simplified code, with no explanations or markdown. The user wants to replace their file directly with the simplified version.

\`\`\`
${content}
\`\`\``;

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: simplifyPrompt }],
        temperature: 0.3,
      });

      const simplified = response.choices[0]?.message?.content?.trim();

      if (!simplified) {
        return { content: "", error: "LLM returned empty response" };
      }

      // Extract code from markdown if present
      let code = simplified;
      const codeBlockMatch = simplified.match(/```(?:\w+)?\n([\s\S]*?)\n```$/);
      if (codeBlockMatch) {
        code = codeBlockMatch[1];
      }

      // Preview the changes
      const originalLines = content.split("\n").length;
      const newLines = code.split("\n").length;
      const change = newLines < originalLines
        ? `📉 Reduced from ${originalLines} to ${newLines} lines (${originalLines - newLines} lines removed)`
        : newLines > originalLines
          ? `📈 Expanded from ${originalLines} to ${newLines} lines`
          : `📊 Same line count (${originalLines} lines)`;

      return {
        content: `## Simplification Preview: ${path}

${change}

\`\`\`diff
${generateDiff(content, code)}
\`\`\`

To apply: /simplify --apply ${path}

Or review the diff above and edit manually.`,
      };
    } catch (e: any) {
      return { content: "", error: `Failed to simplify: ${e.message}` };
    }
  },
};

async function applySimplification(path: string): Promise<SkillResult> {
  try {
    const content = readFileSync(path, "utf-8");
    const client = createLLMClient();
    const model = process.env.LLM_MODEL || "MiniMax-M2.7";

    const simplifyPrompt = `You are a code refactoring assistant. Simplify the following code while preserving behavior exactly.

Output ONLY the simplified code with no explanations.

\`\`\`
${content}
\`\`\``;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: simplifyPrompt }],
      temperature: 0.3,
    });

    const simplified = response.choices[0]?.message?.content?.trim() || "";

    // Extract code from markdown if present
    let code = simplified;
    const codeBlockMatch = simplified.match(/```(?:\w+)?\n([\s\S]*?)\n```$/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
    }

    writeFileSync(path, code, "utf-8");

    const originalLines = content.split("\n").length;
    const newLines = code.split("\n").length;

    return {
      content: `✅ Applied simplification to ${path}\n${originalLines - newLines > 0 ? `Removed ${originalLines - newLines} lines` : newLines > originalLines ? `Added ${newLines - originalLines} lines` : "No line count change"}`,
    };
  } catch (e: any) {
    return { content: "", error: `Failed to apply simplification: ${e.message}` };
  }
}

function generateDiff(original: string, simplified: string): string {
  const origLines = original.split("\n");
  const simpLines = simplified.split("\n");
  const result: string[] = [];

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, simpLines.length);
  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i];
    const simp = simpLines[i];
    if (orig === simp) {
      result.push(`  ${orig}`);
    } else {
      if (orig !== undefined) result.push(`- ${orig}`);
      if (simp !== undefined) result.push(`+ ${simp}`);
    }
  }

  return result.slice(0, 100).join("\n");  // Limit to 100 lines for preview
}
