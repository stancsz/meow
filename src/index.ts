import { extensionRegistry } from "./core/extensions.ts";
import { loadPlugins } from "./core/loader.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { config as agentBrainConfig } from "./config/agent_brain.ts";

console.log("Starting SimpleClaw Agent Server...");
console.log("Agent Brain Configuration:", JSON.stringify(agentBrainConfig));

// Load all external plugins/extensions
await loadPlugins();

const server = Bun.serve({
  port: 3000,
  async fetch(req: Request) {
    // 1. Triple-Lock Security Verification
    const securityRejection = enforceSecurityLocks(req);
    if (securityRejection) {
      return securityRejection;
    }

    // 2. Routing logic
    const url = new URL(req.url);

    // Check if any registered webhook plugin handles this path
    const webhook = extensionRegistry.findWebhook(url.pathname);
    if (webhook) {
      return await webhook.execute(req);
    }

    return new Response(
      JSON.stringify({ error: "Not Found", path: url.pathname }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
});

console.log(`Listening on http://localhost:${server.port}`);
