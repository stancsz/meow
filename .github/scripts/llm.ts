import "dotenv/config";
import OpenAI from "openai";

export function createLLM() {
    // Support multiple LLM providers - OpenAI-compatible or Anthropic-compatible
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.LLM_MODEL || "gpt-4o";

    if (!apiKey) {
        throw new Error("Missing LLM_API_KEY");
    }

    const client = new OpenAI({
        apiKey,
        baseURL,
    });

    return {
        async generate(systemPrompt: string, userPrompt: string) {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            });
            return response.choices[0]?.message?.content || "";
        },
    };
}
