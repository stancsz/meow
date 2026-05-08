# Environment Awareness & Host-Tool Discovery

## Objective
To transform MEOW into a truly "Context-Aware" orchestrator that automatically discovers and leverages all AI tools, MCP servers, and Claude skills configured on the host machine. This ensures optimal delegation and prevents "Reinventing the Wheel" by using battle-tested tools already available to the user.

## Features

### 1. MCP Discovery Engine
- **Target**: Automatically detect and register MCP servers configured in Claude Desktop.
- **Paths**:
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
    - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Logic**: Parse the JSON, extract `mcpServers`, and initialize `McpConfig` objects for each.

### 2. Global Skills Discovery
- **Target**: Discover reusable skill patterns (`SKILL.md`) installed globally.
- **Paths**:
    - `~/.claude/skills/`
    - `~/.meow/skills/`
- **Logic**: Recursively scan for `SKILL.md` files, parse frontmatter (name/description), and add to the unified `SkillManager` registry.

### 3. Orchestrator Integration (The "Awareness" Loop)
- **Context Injection**: The `TaskDecomposer` prompt must be updated to include the full "Host Tool Palette."
- **Delegation Logic**: The orchestrator should prefer a specialized MCP tool or Skill over a generic "Summon Specialist" call when a direct capability match is found.
- **Capability Mapping**: Generate a summarized capability map (e.g., "sqlite-explorer -> provides SQL querying capabilities") to minimize token usage while maintaining high utility.

### 4. Specialist Context Synchronization
- **Tool Palette**: When summoning a specialist (Claude Code, Aider), MEOW will now inject the discovered host tools into their context, effectively "arming" the subagent with the host's capabilities.

## Definition of Done (DoD)

- [ ] **Automated Discovery**: Discovery module successfully finds and parses `claude_desktop_config.json` and global skill directories on project startup.
- [ ] **Unified Registry**: `McpManager` and `SkillManager` successfully merge project-local and host-global tools without naming collisions.
- [ ] **Decomposition Awareness**: The `Orchestrator` correctly identifies subtasks that can be solved by discovered tools (verified via LLM-trace).
- [ ] **Tool invocation**: The agent can successfully call a discovered MCP tool (e.g., a filesystem explorer or database browser).
- [ ] **Regression Testing**: Discovery logic must be covered by unit tests with mocked filesystem paths for all target OSs.
- [ ] **Documentation**: `ENVIRONMENT_AWARENESS.md` is finalized and referenced in `PRODUCTION_READINESS.md`.

## Implementation Roadmap

1. **Phase 1: Discovery Module** (Discovery of config files and skills).
2. **Phase 2: Registry Hardening** (Merging logic and collision handling).
3. **Phase 3: Orchestrator Prompt Tuning** (Teaching the decomposer to use the new "Awareness").
4. **Phase 4: Verification & E2E Tests**.
