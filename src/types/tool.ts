import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * Sanitize a file path to prevent shell metacharacter injection.
 * Strips any shell operators appended after the actual path.
 * e.g. "/path/file.md | tail -300" → "/path/file.md"
 */
function sanitizePath(raw: string): string {
  // Strip everything after shell metacharacters: | & $ ; < > ` \ and anything following
  const cleaned = String(raw).replace(/[|&;$<>`\\].*$/, "").trim();
  return path.normalize(cleaned);
}

/**
 * Sanitize a directory argument — must be a plain path, no shell operators.
 */
function sanitizeDir(raw: string | undefined): string {
  if (!raw) return ".";
  const cleaned = String(raw).replace(/[|&;$<>`\\].*$/, "").trim();
  return path.normalize(cleaned || ".");
}

export interface Tool {
  name: string;
  description: string;
  execute: (args: string, agent?: any) => Promise<string>;
}

export const DEFAULT_TOOLS: Tool[] = [
  {
    name: "read",
    description: "Read file contents",
    execute: async (pathArg: string) => {
      const safePath = sanitizePath(pathArg);
      try {
        return await readFile(safePath, "utf-8");
      } catch (e: any) {
        if (e.code === "ENOENT") {
          return `Error: File not found: ${safePath}. Check the path — shell operators (|, &, $, ;, etc.) are not allowed in file paths.`;
        }
        return `Error reading ${safePath}: ${e.message}`;
      }
    },
  },
  {
    name: "write",
    description: "Write file contents",
    execute: async (args: string) => {
      const idx = args.indexOf("|");
      if (idx === -1) return "Error: write requires 'path|content' format";
      const safePath = sanitizePath(args.slice(0, idx));
      const content = args.slice(idx + 1);
      try {
        await writeFile(safePath, content);
        return "Written successfully";
      } catch (e: any) {
        return `Error writing to ${safePath}: ${e.message}`;
      }
    },
  },
  {
    name: "run",
    description: "Execute a shell command or script",
    execute: async (cmd: string) => {
      try {
        const { stdout, stderr } = await execAsync(cmd, { encoding: "utf-8" });
        return stdout || stderr || "(Command executed with no output)";
      } catch (e: any) {
        return `Command Failed:\nSTDOUT: ${e.stdout}\nSTDERR: ${e.stderr}\nError: ${e.message}`;
      }
    },
  },
  {
    name: "grep",
    description: "Search in files (local)",
    execute: async (args: string) => {
      const [patternRaw, dirRaw] = args.split("|");
      const pattern = (patternRaw || "").trim();
      const dir = sanitizeDir(dirRaw);

      if (!pattern) return "Error: grep requires a non-empty pattern.";

      // Escape special regex chars in pattern to treat it as a literal string.
      // The -F flag makes grep treat pattern as fixed string, avoiding injection risk.
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? `findstr /s /i /c:${JSON.stringify(pattern)} ${dir}\\*`
        : `grep -rn -F ${JSON.stringify(pattern)} -- ${dir}`;

      try {
        const { stdout } = await execAsync(cmd, { encoding: "utf-8" });
        return stdout || "No matches found.";
      } catch (e: any) {
        if (e.status === 1) return "No matches found."; // grep exit 1 = no match
        return `Error running grep: ${e.message}`;
      }
    },
  },
  {
    name: "browse",
    description: "Read content from a URL (10s timeout)",
    execute: async (url: string) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url.trim(), { signal: controller.signal });
        clearTimeout(timeout);
        const text = await response.text();
        return text.substring(0, 5000) + (text.length > 5000 ? "\n... [Truncated]" : "");
      } catch (e: any) {
        if (e.name === 'AbortError') return `Error browsing ${url}: TIMEOUT after 10s - site may be slow/unreachable`;
        return `Error browsing ${url}: ${e.message}`;
      }
    },
  },
  {
    name: "search",
    description: "Search the web (Google/DDG style) - 10s timeout",
    execute: async (query: string) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await response.json() as any;
        let result = `Web results for: ${query}\n\n`;
        if (data.AbstractText) result += `Summary: ${data.AbstractText}\n\n`;
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          result += "Related Topics:\n";
          data.RelatedTopics.slice(0, 5).forEach((t: any) => {
            if (t.Text) result += `- ${t.Text} (${t.FirstURL})\n`;
          });
        }
        return result || "No relevant web results found.";
      } catch (e: any) {
        return `Error searching web for ${query}: ${e.message}`;
      }
    },
  },
  {
    name: "ls",
    description: "List files in a directory",
    execute: async (dir: string) => {
      try {
        const { stdout } = await execAsync(`git ls-files ${dir || "."}`, { encoding: "utf-8" });
        return stdout;
      } catch (e) {
        const isWin = process.platform === "win32";
        const cmd = isWin ? `dir /b ${dir || "."}` : `ls ${dir || "."}`;
        try {
          const { stdout } = await execAsync(cmd, { encoding: "utf-8" });
          return stdout;
        } catch (e2) {
          return `Error: ${e2}`;
        }
      }
    },
  },
  {
    name: "diff",
    description: "Show uncommitted changes in the repo",
    execute: async () => {
      try {
        const { stdout } = await execAsync("git diff", { encoding: "utf-8" });
        return stdout;
      } catch (e) {
        return "No changes or not a git repo.";
      }
    },
  },
  {
    name: "use_skill",
    description: "Load and use a specific skill (expertise/workflow)",
    execute: async (name: string, agent?: any) => {
      if (!agent || !agent.skillManager) return "Skill system not initialized.";
      const skill = agent.skillManager.getSkill(name);
      if (!skill) return `Skill '${name}' not found.`;

      // Record skill usage for effectiveness tracking (Phase 3.2)
      const meowDb = agent.db as any;
      if (meowDb && typeof meowDb.insertSkillEffectiveness === "function") {
        try {
          // Record skill with task result = null (unknown yet, updated on task complete)
          meowDb.insertSkillEffectiveness({
            skillName: name,
            runId: agent.runId,
          });
        } catch {}
      }

      agent.messages.push({
        role: "user",
        content: `ACTIVATE SKILL: ${skill.name}\n\nExpertise/Workflow:\n${skill.content}\n\nPlease follow these instructions for the current task.`
      });
      return `Skill '${name}' activated and injected into context.`;
    },
  },
  {
    name: "mcp_list",
    description: "List available tools from all connected MCP servers",
    execute: async (_: string, agent?: any) => {
      if (!agent || !agent.mcpManager) return "MCP system not initialized.";
      const tools = await agent.mcpManager.listAllTools();
      if (tools.length === 0) return "No MCP tools available.";
      return tools.map((t: any) => `[${t.server}] ${t.name}: ${t.description}`).join("\n");
    },
  },
  {
    name: "mcp_call",
    description: "Call a tool from an MCP server (args: server|tool|JSON_args)",
    execute: async (args: string, agent?: any) => {
      if (!agent || !agent.mcpManager) return "MCP system not initialized.";
      const [server, tool, jsonArgs] = args.split("|");
      try {
        const parsedArgs = jsonArgs ? JSON.parse(jsonArgs) : {};
        const result = await agent.mcpManager.callTool(server, tool, parsedArgs);
        return JSON.stringify(result, null, 2);
      } catch (e: any) {
        return `Error calling MCP tool ${server}:${tool}: ${e.message}`;
      }
    },
  },
  {
    name: "activate_extension",
    description: "Load an available extension into the current session (args: extension_name)",
    execute: async (args: string, agent?: any) => {
      const name = args.trim();
      if (!agent || !agent.extensionManager) {
        return "Error: Extension manager not available.";
      }
      const extension = await agent.extensionManager.activate(name);
      if (extension) {
        return `Successfully activated extension: ${extension.name}. Its tools are now available for use.`;
      }
      return `Error: Extension '${name}' not found. Check the extensions list in the system prompt.`;
    },
  },
  {
    name: "summon",
    description: "Summon a specialist (Claude Code/Aider) for a complex mission (args: agent_name|goal)",
    execute: async (args: string, agent?: any) => {
      const parts = args.split("|");
      const agentName = parts[0]?.trim();
      const goal = parts.slice(1).join("|")?.trim();
      
      const { summon } = await import("../agent/summoner");
      const result = await summon(agentName as any, {
        goal: goal || "Solve current roadblock",
        files: agent?.getFiles() || [],
        lastError: "Explicitly requested by agent",
        attempt: 1,
        existingSkills: agent?.skillManager?.getSkillNames() || [],
        monolithBlueprint: agent?.MONOLITH_BLUEPRINT,
        kernel: agent?.kernel
      });
      return result;
    },
  },
  {
    name: "archive_context",
    description: "Offload the current conversation history to the Knowledge Base (L3) to free up context space and prevent poisoning. Use this for large logs or long discussions that are now resolved.",
    execute: async (_: string, agent?: any) => {
      if (!agent || typeof agent.compressAndOffload !== "function") {
        return "Error: Context management system not available.";
      }
      await agent.compressAndOffload();
      return "Successfully archived conversation tail to Quantum Knowledge Base. L1 context is now pruned.";
    },
  },
  {
    name: "verify_mission",
    description: "Autonomously review if the work is done properly against the goal. Args: goal | test_command (optional)",
    execute: async (args: string, agent?: any) => {
      const [goal, testCmd] = args.split("|").map(s => s.trim());
      if (!agent) return "Error: Agent not initialized.";
      
      const { MissionReviewer } = await import("../agent/mission_reviewer");
      const reviewer = new MissionReviewer(agent);
      return await reviewer.verify(goal, testCmd);
    },
  },
  {
    name: "commit_work",
    description: "Commit the successfully reviewed changes. MEOW (The Expert Taster) uses this to finalize a mission. Args: message",
    execute: async (message: string) => {
      try {
        await execAsync(`git add . && git commit -m "${message.replace(/"/g, '\\"')}"`);
        return `✅ Changes committed: ${message}`;
      } catch (e: any) {
        return `Error committing changes: ${e.message}`;
      }
    },
  },
  {
    name: "check_mission_status",
    description: "Check the status and heartbeat of all active/recent missions. Use this to detect hanged specialists.",
    execute: async (_: string, agent?: any) => {
      if (!agent || !agent.db) return "Error: Database not available.";
      const missions = await agent.db.query(
        `SELECT pid, agent_name, goal, status, last_pulse, created_at
        FROM missions
        ORDER BY created_at DESC LIMIT 10`
      );
      
      if (missions.length === 0) return "No missions found in history.";
      
      let report = "### Swarm Mission Status\n\n";
      report += "| PID | Specialist | Status | Last Pulse | Goal |\n";
      report += "|-----|------------|--------|------------|------|\n";
      missions.forEach((m: any) => {
        const pulse = new Date(m.last_pulse).getTime();
        const diff = (Date.now() - pulse) / 1000;
        const pulseStatus = diff > 300 ? "⚠️ STALLED" : "🟢 ACTIVE";
        report += `| ${m.pid} | ${m.agent_name} | ${m.status} (${pulseStatus}) | ${m.last_pulse} | ${m.goal.substring(0, 50)}... |\n`;
      });
      return report;
    },
  },
  {
    name: "abort_mission",
    description: "Kill a hanged mission by PID. Args: pid",
    execute: async (pidStr: string, agent?: any) => {
      const pid = parseInt(pidStr.trim());
      if (isNaN(pid)) return "Error: Invalid PID.";
      try {
        if (process.platform === "win32") {
          await execAsync(`taskkill /F /PID ${pid}`);
        } else {
          await execAsync(`kill -9 ${pid}`);
        }
        
        if (agent?.kernel) {
          agent.kernel.updateMissionPulse(pid, "aborted");
        }
        return `✅ Mission ${pid} aborted successfully.`;
      } catch (e: any) {
        return `Error aborting mission ${pid}: ${e.message}`;
      }
    },
  },
  {
    name: "summon_swarm",
    description: "Launch multiple specialists in parallel. Format: agent1|goal1 || agent2|goal2",
    execute: async (args: string, agent?: any) => {
      const missions = args.split("||").map(m => {
        const parts = m.split("|").map(s => s.trim());
        const agentName = parts[0];
        const goal = parts.slice(1).join("|");
        return { 
          name: agentName, 
          context: {
            goal,
            files: agent?.getFiles() || [],
            kernel: agent?.kernel,
            monolithBlueprint: agent?.MONOLITH_BLUEPRINT
          }
        };
      });

      if (missions.length === 0) return "Error: No missions specified.";
      
      const { summonParallel } = await import("../agent/summoner");
      const results = await summonParallel(missions as any);
      
      let report = "### Swarm Mission Results\n\n";
      results.forEach(r => {
        report += `#### Agent: ${r.agentName} (${r.success ? "✅" : "❌"})\n${r.output.substring(0, 500)}...\n\n`;
      });
      return report;
    },
  },
];