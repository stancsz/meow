# 🐱 Meow

**The sovereign agent platform with CLI and desktop power.**

<img src="docs/image.png" alt="Meow Logo" width="200">

Meow is an ultra-lean sovereign agent platform designed to deliver **Claude Code-level autonomy** on a **Free Tier** budget. It consists of two main components:

- **meow** 🐱 - The featherweight CLI/TUI agent with heavyweight power
- **meowclaw** 🦀 - The desktop app with Electron wrapper for GUI-based workflows

Optimized for AWS/GCP free instances, Meow bridges the gap between raw LLMs and real-world execution through native **Agentic Browsing**, **MCP** integration, and a modular **Skill** vault.

> [!IMPORTANT]
> **Quick Start:** One-command installation:
> ```bash
> # macOS/Linux/Git Bash
> curl -fsSL https://raw.githubusercontent.com/stancsz/meow/main/setup.sh | bash
> ```
> ```powershell
> # Windows PowerShell
> (irm https://raw.githubusercontent.com/stancsz/meow/main/setup.sh) | bash
> ```
> Or download and run:
> ```bash
> ./setup.sh
> ```
>
> **Windows Developers:** If you're building the Electron app, ensure **Developer Mode** is enabled in Windows settings to allow symbolic links.

> [!TIP]
> **⚡ 121 Lines of Pure Power.** The core engine in `packages/core` is so lean, it fits in just 121 lines of dense, optimized code.
>
> Meow is one of the very few **OpenCLAW-equivalent** frameworks that delivers high-tier agentic browser automation and advanced tools without demanding heavy infrastructure.

---

## 🚀 Key Features

- **🌐 Agentic Browser**: Integrated `agent-browser` capabilities allow your AI to navigate the web, interact with elements, and extract data just like a human.
- **🛠️ Modular Plugins**: Easily extend capabilities with plugins for **Discord**, **WhatsApp**, **Messenger**, and more.
- **🧠 Skill System**: Inject specialized knowledge or workflows via Markdown files in the `.agents/skills/` directory. Supports Anthropic-style `SKILL.md` format.
- **🐳 Cloud Ready**: Pre-configured Terraform and Docker setups for "Free Tier" deployment on Google Cloud.
- **🔒 Security First**: Integrated **Triple Lock** security and IPI sanitization for AI safety.
- **💾 Local First**: Zero-config SQLite support for rapid development without complex database setups.

---

## 📂 Project Structure

```
meow/
├── cli/                    # CLI entry point (meow CLI)
├── src/                    # CLI source code
│   ├── cli/               # CLI commands and interface
│   ├── config/            # Configuration
│   └── core/              # Orchestrator core
└── package.json

meowclaw/                  # Desktop App
├── electron/              # Electron main/preload scripts
└── server/                # Next.js dashboard (meowclaw UI)

packages/
├── core/                  # Shared engine (dispatcher, orchestrator, etc.)
├── agents/                # .agents workspace (skills, workflows, comm)
├── db/                    # Sovereign Motherboard (SQLite/Supabase)
└── providers/             # LLM provider integrations
```

---

## 🐱 Meow CLI vs 🦀 MeowClaw

| Component | Description | Use Case |
|-----------|-------------|----------|
| **meow** | CLI/TUI agent | Terminal-first workflows, scripting, headless automation |
| **meowclaw** | Desktop app | GUI-based workflows, visual monitoring, desktop integration |

---

## 🛠️ Getting Started

### 1. Local Development
```bash
# One-command setup
./setup.sh

# Or manually:
# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY or DEEPSEEK_API_KEY
# For Gas Tank payments integration, also provide STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET

# Start Meow CLI
bun run start

# Start MeowClaw Desktop
bun run electron:dev
```

### 2. Testing
To run the standard test suite:
```bash
bun run test
```

To run the full end-to-end swarm orchestration integration test (simulating the entire pipeline from plan generation to worker execution and Motherboard state updates):
```bash
bun run test:integration:workflow
```

### 3. Deployment
Ready to go live? Check our [Setup & Deployment Guide](docs/setup_guide.md).

---

## 📖 Documentation

- [Setup & GCP Deployment Strategy](docs/setup_guide.md)
- [How to add Agent Skills](packages/agents/skills/README.md)
- [Browser Skill Documentation](packages/agents/skills/browser.md)
- [Development Roadmap](docs/ROADMAP.md)

---

## 🧩 Default Skills

The following skills are pre-installed in the `packages/agents/skills/` vault:
- **Web Browsing**: Full-page navigation and interaction.
- **Dogfooding**: Exploratory QA testing for web apps.
- **Shell Management**: Advanced system operations.

---

*Meow is built for speed, safety, and autonomy. Join the swarm. 🦀*
