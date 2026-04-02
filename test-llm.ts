import OpenAI from "openai";

const apiKey = process.env.MINIMAX_API_KEY;
const baseURL = "https://api.minimax.io/v1";
const model = "minimax-m2.7";

console.log("Testing MiniMax API configuration:");
console.log("API Key:", apiKey ? "SET (length=" + apiKey.length + ")" : "NOT SET");
console.log("Base URL:", baseURL);
console.log("Model:", model);

if (!apiKey) {
    console.error("ERROR: MINIMAX_API_KEY not set");
    process.exit(1);
}

const client = new OpenAI({
    apiKey,
    baseURL,
});

async function test() {
    console.log("\nMaking test request to MiniMax API...");
    try {
        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: "user", content: "Say 'Hello from MiniMax!' if you can hear me." },
            ],
        });
        console.log("SUCCESS!");
        console.log("Response:", response.choices[0]?.message?.content);
    } catch (e: any) {
        console.error("FAILED:", e.message);
        if (e.status) console.error("Status:", e.status);
        process.exit(1);
    }
}

test();
