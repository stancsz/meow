import "dotenv/config";
import OpenAI from "openai";

export function createLLM() {
    // Support multiple LLM providers - MiniMax (preferred), DeepSeek, OpenAI
    const apiKey = process.env.MINIMAX_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || "https://api.minimax.io/v1";
    const model = process.env.MODEL || "minimax-m2.7";

    if (!apiKey) {
        throw new Error("Missing MINIMAX_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY");
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
