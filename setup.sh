#!/bin/bash
# SimpleClaw Unified Installer
# One-click setup for new workstation users
# Works on macOS, Linux, and Windows (via Git Bash/WSL)

set -e

echo "🦀 SimpleClaw - Autonomous Agent Workstation"
echo "============================================"
echo ""

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)    echo "macOS" ;;
        Linux*)     echo "Linux" ;;
        CYGWIN*|MINGW*|MSYS*) echo "Windows" ;;
        *)          echo "Unknown" ;;
    esac
}

PLATFORM=$(detect_platform)
echo "📋 Platform detected: $PLATFORM"

# Check if we're already in a SimpleClaw directory
is_simpleclaw_dir() {
    [ -f "package.json" ] && grep -q "simpleclaw" package.json 2>/dev/null || [ -f "CLAUDE.md" ]
}

# Install Bun if not present
install_bun() {
    if ! command -v bun &> /dev/null; then
        echo "📦 Installing Bun runtime..."
        case "$PLATFORM" in
            macOS|Linux)
                curl -fsSL https://bun.sh/install | bash
                # Update shell config
                if [ -f "$HOME/.bashrc" ]; then
                    source "$HOME/.bashrc" 2>/dev/null || true
                fi
                if [ -f "$HOME/.zshrc" ]; then
                    source "$HOME/.zshrc" 2>/dev/null || true
                fi
                ;;
            Windows)
                echo "⚠️  Windows users: Please install Bun manually from https://bun.sh"
                echo "   Then restart your terminal and run this script again."
                exit 1
                ;;
            *)
                echo "❌ Unsupported platform for automatic Bun installation"
                exit 1
                ;;
        esac
    else
        echo "✅ Bun already installed: $(bun --version)"
    fi
}

# Clone or update repository
setup_repo() {
    if is_simpleclaw_dir; then
        echo "📁 Already in SimpleClaw directory"
        echo "🔄 Updating from git..."
        git pull origin main 2>/dev/null || echo "⚠️  Could not update (not a git repo or no network)"
    else
        echo "📥 Cloning SimpleClaw repository..."
        git clone https://github.com/stancsz/simpleclaw.git simpleclaw-setup
        cd simpleclaw-setup
    fi
}

# Install dependencies
install_deps() {
    echo "📦 Installing dependencies..."
    bun install
    
    # Check for agent-browser dependency
    if ! bun list | grep -q "agent-browser"; then
        echo "🌐 Installing agent-browser..."
        bun add agent-browser
    fi
}

# Setup environment
setup_env() {
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        echo "📝 Creating .env file from example..."
        cp .env.example .env
        echo ""
        echo "⚠️  IMPORTANT: Edit .env file and add your API keys:"
        echo "   - OPENAI_API_KEY or DEEPSEEK_API_KEY for LLM access"
        echo "   - Other API keys as needed for skills"
        echo ""
        echo "You can edit it now with: nano .env (or your preferred editor)"
    elif [ -f ".env" ]; then
        echo "✅ .env file already exists"
    else
        echo "⚠️  No .env.example found, creating minimal .env..."
        echo "# SimpleClaw Environment Variables" > .env
        echo "# Add your API keys here" >> .env
        echo "# OPENAI_API_KEY=your_key_here" >> .env
        echo "# DEEPSEEK_API_KEY=your_key_here" >> .env
    fi
}

# Setup browser automation
setup_browser() {
    echo "🌐 Setting up browser automation..."
    if command -v npx &> /dev/null; then
        npx playwright install chromium 2>/dev/null || echo "⚠️  Playwright installation skipped (optional)"
    else
        echo "⚠️  npx not available, skipping Playwright (browser skill may need manual setup)"
    fi
}

# Final instructions
show_instructions() {
    echo ""
    echo "🎉 SimpleClaw setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your API keys"
    echo "2. Start SimpleClaw with:"
    echo "   bun run start"
    echo ""
    echo "Or try the self-improvement loop:"
    echo "   ./loop/dogfood.sh"
    echo ""
    echo "Available commands:"
    echo "  bun run start      - Start the agent"
    echo "  bun run test       - Run tests"
    echo "  ./loop/dogfood.sh  - Self-improvement mode"
    echo ""
    echo "📚 Documentation:"
    echo "  - Read SPEC.md for architecture overview"
    echo "  - Read CLAUDE.md for current status"
    echo "  - Check .agents/skills/ for available skills"
}

# Main execution
main() {
    echo "🚀 Starting SimpleClaw installation..."
    echo ""
    
    install_bun
    setup_repo
    install_deps
    setup_env
    setup_browser
    show_instructions
}

# Run main function
main