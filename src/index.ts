import "dotenv/config";
import { extensionRegistry } from "./core/extensions.ts";
import { enforceSecurityLocks } from "./security/triple_lock.ts";
import { createServer } from "node:http";

const port = 3018;

export async function startClaw() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // Construct a partial Request object for the extensions
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    // Simple Request mock for plugins
    const requestObject = {
      url: url.toString(),
      method: req.method,
      headers: headers,
      json: async () => {
        return new Promise((resolve) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({});
            }
          });
        });
      },
    } as Request;

    const securityError = enforceSecurityLocks(requestObject);
    if (securityError) {
      res.writeHead(securityError.status, { "Content-Type": "application/json" });
      res.end(await securityError.text());
      return;
    }

    const extension = extensionRegistry.findWebhook(url.pathname);
    if (extension) {
      const response = await extension.execute(requestObject);
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(await response.text());
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
    }
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${port} is already in use. Exiting to prevent ghost processes.`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
    }
  });

  server.listen(port, async () => {
    console.log(`🚀 SimpleClaw Server listening on http://localhost:${port}`);
    
    // Start active plugins only AFTER server is up
    const activePlugins = extensionRegistry.getAll();
    for (const plugin of activePlugins) {
      if (plugin.start) {
        console.log(`🔌 Starting plugin: ${plugin.name}...`);
        await plugin.start();
      }
    }
  });

  return server;
}

// Start standalone if executed directly
if (import.meta.main || process.argv[1]?.endsWith("index.ts")) {
  await startClaw();
}
