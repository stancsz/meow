import { createServer, type Server } from "node:http";
import { extensionRegistry, type Extension, type RuntimeMode } from "./extensions.ts";
import { loadPlugins } from "./loader.ts";
import { enforceSecurityLocks } from "../security/triple_lock.ts";
import { createCliTransport, type CliTransport } from "../../cli/index.ts";
import {
  createAgentDispatcher,
  type AgentDispatcher,
  type AgentDispatchSubmitInput,
} from "./dispatcher.ts";
import { getDefaultHeartbeatIntervalMs, startHeartbeatScheduler, stopHeartbeatScheduler } from "./heartbeat.ts";

const DEFAULT_PORT = 3018;
const DEFAULT_HEARTBEAT_SCOPE = "heartbeat:global";

export interface RuntimeStartOptions {
  mode?: RuntimeMode;
  port?: number;
  heartbeat?: {
    enabled?: boolean;
    intervalMs?: number;
  };
}

export interface RuntimeContext {
  mode: RuntimeMode;
  port: number;
  dispatcher: AgentDispatcher;
  cli?: CliTransport;
  server?: Server;
  submitWork: (input: AgentDispatchSubmitInput) => Promise<void>;
  close: () => Promise<void>;
}

let pluginsLoaded = false;

export async function startRuntime(options: RuntimeStartOptions = {}): Promise<RuntimeContext> {
  const mode = resolveRuntimeMode(options.mode);
  const port = options.port ?? DEFAULT_PORT;

  if (!pluginsLoaded) {
    await loadPlugins();
    pluginsLoaded = true;
  }

  const dispatcher = createAgentDispatcher();
  const cleanupTasks: Array<() => Promise<void> | void> = [];

  if (options.heartbeat?.enabled !== false) {
    const heartbeatIntervalMs = options.heartbeat?.intervalMs ?? getDefaultHeartbeatIntervalMs();
    startHeartbeatScheduler(
      dispatcher,
      {
        source: "heartbeat",
        scope: DEFAULT_HEARTBEAT_SCOPE,
        model: process.env.AGENT_MODEL || "gpt-5-nano",
        maxIterations: 3,
      },
      heartbeatIntervalMs,
    );
    cleanupTasks.push(() => stopHeartbeatScheduler());
  }

  let cli: CliTransport | undefined;
  if (mode === "cli" || mode === "hybrid") {
    cli = createCliTransport(dispatcher);
    cleanupTasks.push(() => cli?.close());
  }

  let server: Server | undefined;
  if (mode === "server" || mode === "hybrid") {
    server = await createWebhookServer(port, mode);
    cleanupTasks.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server?.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }),
    );
  }

  await startActiveExtensions(mode);

  return {
    mode,
    port,
    dispatcher,
    cli,
    server,
    submitWork: (input) => dispatcher.submit(input),
    close: async () => {
      for (const cleanup of cleanupTasks.reverse()) {
        await cleanup();
      }
    },
  };
}

export function resolveRuntimeMode(mode?: RuntimeMode): RuntimeMode {
  if (mode) {
    return mode;
  }

  const flag = process.argv.find((arg) => arg.startsWith("--mode="));
  const flagValue = flag?.split("=")[1] as RuntimeMode | undefined;
  if (flagValue === "cli" || flagValue === "server" || flagValue === "hybrid") {
    return flagValue;
  }

  const envMode = process.env.SIMPLECLAW_RUNTIME_MODE as RuntimeMode | undefined;
  if (envMode === "cli" || envMode === "server" || envMode === "hybrid") {
    return envMode;
  }

  return "cli";
}

async function startActiveExtensions(mode: RuntimeMode): Promise<void> {
  const extensions = extensionRegistry.getAll();
  for (const extension of extensions) {
    if (!shouldStartExtension(extension, mode)) {
      continue;
    }

    console.log(`🔌 Starting plugin: ${extension.name}...`);
    await extension.start?.();
  }
}

function shouldStartExtension(extension: Extension, mode: RuntimeMode): boolean {
  if (!extension.start) {
    return false;
  }

  if (extension.activation && extension.activation !== "transport") {
    return false;
  }

  if (!extension.runtimeModes || extension.runtimeModes.length === 0) {
    return mode === "server" || mode === "hybrid";
  }

  return extension.runtimeModes.includes(mode);
}

function shouldExposeExtension(extension: Extension, mode: RuntimeMode): boolean {
  if (!extension.runtimeModes || extension.runtimeModes.length === 0) {
    return mode === "server" || mode === "hybrid";
  }

  return extension.runtimeModes.includes(mode);
}

async function createWebhookServer(port: number, mode: RuntimeMode): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const requestObject = {
      url: url.toString(),
      method: req.method,
      headers,
      json: async () => {
        return new Promise((resolve) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
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
    if (!extension || !shouldExposeExtension(extension, mode)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: url.pathname }));
      return;
    }

    const response = await extension.execute(requestObject);
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(await response.text());
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use.`));
        return;
      }
      reject(err);
    });

    server.listen(port, () => {
      console.log(`🚀 SimpleClaw Server listening on http://localhost:${port}`);
      resolve();
    });
  });

  return server;
}
