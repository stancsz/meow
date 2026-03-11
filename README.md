# 🦀 SimpleClaw

**The Lightweight, Agentic Automation Framework.**

<img src="docs/image.png" alt="SimpleClaw Logo" width="200">

> [!IMPORTANT]
> **Quick Start:** Ask your agent to run `bash https://github.com/stancsz/simpleclaw/blob/main/setup.sh` to get started instantly.

> [!TIP]
> **⚡ 121 Lines of Pure Power.** The core engine in `src/core` is so lean, it fits in just 121 lines of dense, optimized code.
>
> SimpleClaw is one of the very few **OpenCLAW-equivalent** frameworks that runs effectively on **AWS/GCP Free Tiers**, supporting full browser automation and advanced agentic "claw" features without the heavy infrastructure overhead.



SimpleClaw is a minimalist yet powerful multi-agent framework designed to bridge the gap between AI models and real-world tools. It features a modular plugin system, integrated web browsing, and a robust "Skill" library modeled after state-of-the-art agentic architectures.

---

## 🚀 Key Features

- **🌐 Agentic Browser**: Integrated `agent-browser` capabilities allow your AI to navigate the web, interact with elements, and extract data just like a human.
- **🛠️ Modular Plugins**: Easily extend capabilities with plugins for **Discord**, **WhatsApp**, **Messenger**, and more.
- **🧠 Skill System**: Inject specialized knowledge or workflows via Markdown files in the `skills/` directory. Supports Anthropic-style `SKILL.md` format.
- **🐳 Cloud Ready**: Pre-configured Terraform and Docker setups for "Free Tier" deployment on Google Cloud.
- **🔒 Security First**: Integrated **Triple Lock** security and IPI sanitization for AI safety.
- **💾 Local First**: Zero-config SQLite support for rapid development without complex database setups.

---

## 📂 Project Structure

- `cli/`: LLM-integrated terminal interface for interacting with your agent.
- `src/core/`: The "Brain" and execution logic of the framework.
- `src/plugins/`: Extensible tools and platform integrations (Browser, Discord, etc.).
- `skills/`: Markdown-based expertise for the agent (e.g., Exploratory Testing).
- `terraform/`: Infrastructure-as-Code for GCP Free Tier deployment.
- `server/`: Next.js management dashboard for bot orchestration.

---

## 🛠️ Getting Started

### 1. Local Development
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# Launch the CLI
npx tsx cli/index.ts
```

### 2. Deployment
Ready to go live? Check our [Setup & Deployment Guide](docs/setup_guide.md).

---

## 📖 Documentation

- [Setup & GCP Deployment Strategy](docs/setup_guide.md)
- [How to add Agent Skills](skills/README.md)
- [Browser Skill Documentation](skills/browser.md)

---

## 🧩 Default Skills

The following skills are pre-installed in the `skills/` vault:
- **Web Browsing**: Full-page navigation and interaction.
- **Dogfooding**: Exploratory QA testing for web apps.
- **Shell Management**: Advanced system operations.

---

*SimpleClaw is built for speed, safety, and autonomy. Join the swarm. 🦀*
