# 🦀 SimpleClaw

SimpleClaw is a **highly hackable, customizable, and secure** variant of the Claw agent. It is designed for developers who want a "zero-hop" execution environment that is easy to extend and audit.

## 🚀 Key Philosophy

*   **Ultra-Lean Core**: The entire core engine is just **~130 lines of code**.
*   **Plugin-First**: All integrations (WhatsApp, Discord, Messenger) and extra capabilities are implemented as external plugins.
*   **Zero-Hop Execution**: Native integration with the Bun runtime for maximum performance.
*   **Triple-Lock Security**: Built-in process isolation, identity verification, and IPI sanitization.

## 🛠️ Architecture

SimpleClaw is split into a tiny core engine and a dynamic plugin system:

### 1. The Core (~130 LOC)
The "Brain" resides in `src/core` and `src/index.ts`. It handles:
- **Server Orchestration**: A tiny Bun-powered HTTP server.
- **Dynamic Loader**: Automatically discovers and mounts plugins from `src/plugins`.
- **Extension Registry**: A centralized hub for Skills, Knowledge Bases, MCPs, and Webhooks.
- **Native Executor**: Handles core filesystem, shell, and git operations with built-in security filters.

### 2. The Plugins
Everything else is an extension. By moving integrations out of the core, SimpleClaw remains easy to audit and modify.
- **Webhooks**: Located in `src/plugins/`.
- **Skills**: Can be registered dynamically via the `extensionRegistry`.
- **MCP**: Native support for Model Context Protocol servers.

## 🔌 Adding a Plugin

To add a new integration or capability, simply create a file in `src/plugins/`:

```typescript
import type { Extension } from "../core/extensions.ts";

export const plugin: Extension = {
  name: "my-custom-tool",
  type: "webhook", // OR 'skill' | 'mcp'
  route: "/my-endpoint",
  execute: async (req) => {
    return new Response(JSON.stringify({ status: "Hello from Plugin!" }));
  }
};
```

## 🔒 Security

SimpleClaw implements a **Triple-Lock** security model:
1.  **Isolation**: Process-level validation via Bun's native sandbox capabilities.
2.  **Identity**: SPIFFE ID verification on every request.
3.  **Guardian**: All external data is passed through a (mock) Haiku 4.5 IPI Sanitizer before ingestion.

## 📦 Getting Started

```bash
# Install dependencies
npm install

# Start the agent
bun run src/index.ts
```

---
*Built for speed, security, and extreme customizability.*
