---
name: repo-map
description: Generate and use a compact repository map to save tokens and understand codebase structure
category: optimization
---

# Repo Map Skill

## What is it?
The `repo-map` skill allows MEOW to generate a high-density, token-efficient summary of the entire repository. This is inspired by Aider's repository mapping feature. It uses static analysis (regex-based) to extract symbols like classes, functions, and interfaces across the project.

## Why use it?
- **Saves Tokens**: Instead of reading full files, read just the signatures.
- **Context Awareness**: Helps the agent understand how files relate to each other.
- **Rapid Navigation**: Quickly find where specific functions are defined without grep-ing blindly.

## Usage

### 1. Generate the map
To see the entire repo structure in a compact format, use the `run` tool:

```bash
TOOL: run | npx tsx src/agent/repo_map.ts
```

### 2. Add to context
You can pipe the output of the map into your current session to give yourself a "birds-eye view" of the project.

### 3. Use for Summoning
Before summoning a specialist like `cc` or `aider`, generate a map to identify exactly which files are relevant. This ensures you only pass the necessary files to the specialist, saving their context window.

## How it works
The script in `src/agent/repo_map.ts` performs the following:
1. **Globs** the repo for source files (TS, JS, PY, etc.), automatically respecting `.gitignore` rules.
2. **Extracts Symbols** using optimized regex patterns for each language.
3. **Summarizes** the top files (based on directory depth and importance).

## Best Practices
- Run `repo-map` at the start of a mission to build a mental model.
- Use it when you are looking for an existing function but don't know which file it's in.
- If the project is very large, you can modify the script to increase the `maxFiles` limit.

## Examples

**Task**: "I need to add a new endpoint but don't know where the models are defined."
**Action**:
```bash
TOOL: run | npx tsx src/agent/repo_map.ts
```
**Result**:
```markdown
### src/models/user.ts
Symbols: User, createUser, validateEmail

### src/api/routes.ts
Symbols: setupRoutes, authMiddleware
```
