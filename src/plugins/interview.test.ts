import { expect, test, describe } from "bun:test";
import { plugin } from "./interview";

describe("Interview Plugin", () => {
  test("list_sections should return all sections", async () => {
    const resultStr = await plugin.execute({ action: "list_sections" });
    const result = JSON.parse(resultStr as string);

    expect(result.sections).toBeDefined();
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections).toContain("I. Architectural Foundations");
    expect(result.sections).toContain("V. The \"Executive\" Questions");
  });

  test("get_section should return questions for a valid section", async () => {
    const sectionName = "II. Advanced Scenario Design";
    const resultStr = await plugin.execute({ action: "get_section", section: sectionName });
    const result = JSON.parse(resultStr as string);

    expect(result.section).toBe(sectionName);
    expect(result.questions).toBeDefined();
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions[0].question).toBeDefined();
    expect(result.questions[0].answer).toBeDefined();
  });

  test("get_section should return an error for an invalid section", async () => {
    const result = await plugin.execute({ action: "get_section", section: "Invalid Section Name" });
    expect(result).toContain("ERROR: Section 'Invalid Section Name' not found");
  });

  test("search_questions should return relevant results", async () => {
    const query = "Working Memory";
    const resultStr = await plugin.execute({ action: "search_questions", question: query });
    const result = JSON.parse(resultStr as string);

    expect(result.query).toBe(query);
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);

    // Check if the expected question about Working Memory is present
    const found = result.results.some((r: any) => r.question.includes("Working Memory"));
    expect(found).toBe(true);
  });

  test("search_questions should be case-insensitive", async () => {
    const query = "working memory"; // lower case
    const resultStr = await plugin.execute({ action: "search_questions", question: query });
    const result = JSON.parse(resultStr as string);

    const found = result.results.some((r: any) => r.question.includes("Working Memory"));
    expect(found).toBe(true);
  });

  test("unknown action should return an error", async () => {
    const result = await plugin.execute({ action: "unknown_action" });
    expect(result).toContain("ERROR: Unknown action: unknown_action");
  });
});
