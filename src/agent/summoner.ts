import { execSync, spawn } from "child_process";
import { MeowKernel } from "../kernel/kernel";
import { Harvester } from "./harvester";
import { QuantumMemory } from "./quantum_memory";
import { BrowserOSManager, getBrowserOSManager } from "./browseros_manager";

export interface SummonContext {
  goal: string;
  files: string[];
  lastError?: string;
  attempt?: number;
  existingSkills?: string[];
  monolithBlueprint?: string;
  kernel?: MeowKernel;
}

export interface ExternalAgent {
  name: string;
  description: string;
  getCommand: (ctx: SummonContext) => string;
}

export const SPECIALISTS: Record<string, ExternalAgent> = {
  cc: {
    name: "Claude Code",
    description: "Excellent for reasoning, complex debugging, and state-of-the-art coding tasks.",
    getCommand: (ctx) => {
      const blueprint = ctx.monolithBlueprint || "Maintain surgical changes and simplicity.";
      const message = `I am MEOW (Meta-Orchestrator). I've hit a roadblock. 
GOAL: ${ctx.goal}
FAILURE: ${ctx.lastError || "Build/Test loop failure"}
ATTEMPT: ${ctx.attempt || 1}
RESOURCES: ${ctx.files.join(", ")}

# MONOLITH BLUEPRINT (Rules of the House):
${blueprint}

INSTRUCTIONS:
0. BEFORE STARTING: Run 'npx skills find <relevant-topic>' to check if a skill exists that can help with this task. If found, use or recommend it.
1. FIX the immediate issue and ensure all tests pass.
2. DO NOT TOUCH 'quantum_*.ts' files unless the goal specifically asks for it.
3. DO NOT COMMIT: MEOW is the Expert Taster and will review/commit your work.
4. REPORT: Summarize your changes and provide exact steps for MEOW to verify your work.
5. RECURSIVE IMPROVEMENT: If you find a missing pattern, create a reusable skill in 'src/skills/'.

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: State assumptions explicitly.
- SIMPLICITY FIRST: Minimum code.
- SURGICAL CHANGES: Match the existing style exactly.`;
      
      // Hardened Headless Flags: -p for non-interactive print mode, bypass for everything else
      return `claude "${message.replace(/"/g, '\\"')}" -p --dangerously-skip-permissions --permission-mode bypassPermissions`;
    }
  },
  aider: {
    name: "Aider",
    description: "Best for complex multi-file edits and git-integrated refactoring.",
    getCommand: (ctx) => {
      const fileArgs = ctx.files.join(" ");
      const blueprint = ctx.monolithBlueprint || "Maintain surgical changes.";
      const message = `I am Meow (Meta-Orchestrator). Roadblock: ${ctx.goal}. 
Last Error: ${ctx.lastError || "Unknown"}

# MONOLITH BLUEPRINT:
${blueprint}

Please fix the code, ensure tests pass.
Do NOT commit. MEOW will review and commit your changes.

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: State assumptions explicitly.
- SIMPLICITY FIRST: Minimum code. Match style.
- SURGICAL CHANGES: Do not refactor unrelated code.`;
      
      return `aider --message "${message.replace(/"/g, '\\"')}" ${fileArgs} --auto-test --yes --no-auto-commit`;
    }
  },
  opencode: {
    name: "OpenCode",
    description: "Open-source agent for autonomous project engineering and high-speed iteration.",
    getCommand: (ctx) => {
      const message = `Goal: ${ctx.goal}. Files: ${ctx.files.join(", ")}`;
      return `opencode "${message.replace(/"/g, '\\"')}"`;
    }
  },
  claude: {
    name: "Claude Code",
    description: "Standard specialist for high-fidelity logic fixes.",
    getCommand: (ctx) => {
      return SPECIALISTS.cc.getCommand(ctx); // Use the same robust prompt
    }
  },
  qa: {
    name: "QA Specialist",
    description: "Expert in bug hunting, unit testing, and documentation. Runs in parallel with coders.",
    getCommand: (ctx) => {
      const message = `I am Meow (Meta-Orchestrator). You are the QA SPECIALIST for this mission.
GOAL: ${ctx.goal}
FAILURE: ${ctx.lastError || "None reported"}
RESOURCES: ${ctx.files.join(", ")}

# QA CONSTRAINTS:
1. NO SOURCE MUTATIONS: You are FORBIDDEN from modifying 'src/*.ts' files (except for adding export/test tags).
2. TEST FOCUS: Your primary goal is to write unit tests (Jest/Vitest) that verify the current goal.
3. BUG HUNTING: Search for edge cases, race conditions, and performance bottlenecks.
4. DOCUMENTATION: Update README.md or SKILL.md to reflect the changes.
5. REPORT: Summarize all tests added and any bugs found.

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: Analyze the Coder's likely approach.
- SIMPLICITY FIRST: Clean, readable test code.
- GOAL-DRIVEN: Your success is defined by test coverage and documentation clarity.`;
      
      return `claude "${message.replace(/"/g, '\\"')}" -p --dangerously-skip-permissions --permission-mode bypassPermissions`;
    }
  },
  "claude-hermes": {
    name: "Hermes Agent",
    description: "[PARITY] Specializes in self-evolving skills. Uses Claude Code with Hermes-style prompts (hermes-agent CLI not available).",
    getCommand: (ctx) => {
      const blueprint = ctx.monolithBlueprint || "Maintain surgical changes.";
      const message = `I am MEOW (Meta-Orchestrator). You are HERMES - the Skill Evolution Specialist.
GOAL: ${ctx.goal}
FAILURE: ${ctx.lastError || "None reported"}
RESOURCES: ${ctx.files.join(", ")}

# MONOLITH BLUEPRINT (Rules of the House):
${blueprint}

HERMES SPECIALTY: Self-evolving skills and complex workflow codification.

INSTRUCTIONS:
1. Analyze the goal and identify the core workflow pattern
2. Implement the solution following KARPATHY guidelines
3. RECURSIVE IMPROVEMENT: Extract the workflow into a reusable SKILL.md in 'skills/'
4. DO NOT COMMIT: MEOW is the Expert Taster and will review/commit your work
5. REPORT: Summarize changes, the new skill created, and how to verify

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: State assumptions explicitly
- SIMPLICITY FIRST: Minimum code that solves the problem
- SURGICAL CHANGES: Touch only what must, match existing style
- GOAL-DRIVEN: Define success criteria before starting`;

      // Hermes uses Claude Code with specialized prompts for skill evolution
      return `claude "${message.replace(/"/g, '\\"')}" -p --dangerously-skip-permissions --permission-mode bypassPermissions`;
    }
  },
  "claude-browseros": {
    name: "BrowserOS",
    description: "Expert at web automation, research, and GUI-based web interaction. Uses browseros-cli with MCP tools.",
    getCommand: (ctx) => {
      // BrowserOS CLI doesn't have 'chat' - it uses MCP or direct commands
      // We use MCP tools via claude CLI to interact with browseros-cli server
      const message = `I am MEOW (Meta-Orchestrator). You are the WEB SPECIALIST using BrowserOS MCP.
GOAL: ${ctx.goal}
RESOURCES: ${ctx.files.join(", ")}

# BROWSEROS CAPABILITIES:
- Navigate to URLs, extract page content, take screenshots
- Fill forms, click elements, scroll, extract links
- Handle dialogs, uploads, downloads
- Multi-tab management

INSTRUCTIONS:
1. Use mcp__browseros__new_hidden_page to open URLs
2. Use mcp__browseros__get_page_content to extract text
3. Use mcp__browseros__ss for screenshots
4. If data needs saving, put it in project root
5. REPORT: Summarize actions taken and results found

# EXAMPLE WORKFLOW:
- Open: claude mcp call mcp__browseros__new_hidden_page --url "https://example.com" --hidden true
- Get content: claude mcp call mcp__browseros__get_page_content --page <pageId>
- Take screenshot: claude mcp call mcp__browseros__ss --page <pageId>`;

      // BrowserOS works through MCP tools with Claude Code
      return `claude "${message.replace(/"/g, '\\"')}" -p --dangerously-skip-permissions --permission-mode bypassPermissions`;
    }
  },
  eigent: {
    name: "Eigent AI",
    description: "Multi-agent workforce via native HTTP integration with Eigent desktop app. Use EigentClient for parallel task execution.",
    getCommand: (ctx) => {
      // Eigent now has native integration via EigentClient (eigent_client.ts)
      // This fallback uses Claude Code + BrowserOS MCP for web-based parallel tasks
      const message = `I am MEOW (Meta-Orchestrator). You are EIGENT - the Multi-Agent Desktop Workforce.
GOAL: ${ctx.goal}
RESOURCES: ${ctx.files.join(", ")}

# EIGENT CAPABILITIES:
- Parallel task execution using multiple agents
- Native HTTP integration with Eigent desktop app (localhost:3001)
- Web automation via BrowserOS MCP
- Desktop workflow automation

INSTRUCTIONS:
1. Check if EigentClient is available for native task execution
2. If native unavailable, use BrowserOS MCP for web-based parallel tasks
3. Aggregate results and handle dependencies
4. DO NOT COMMIT: MEOW is the Expert Taster and will review/commit
5. REPORT: Summarize parallel tasks executed and final aggregated results

# KARPATHY GUIDELINES:
- THINK BEFORE CODING: Plan parallelization strategy
- SIMPLICITY FIRST: Minimize redundant parallel tasks`;

      return `claude "${message.replace(/"/g, '\\"')}" -p --dangerously-skip-permissions --permission-mode bypassPermissions`;
    }
  }
};

export interface SummonResult {
  success: boolean;
  output: string;
  agentName: string;
  exitCode?: number;
  pid?: number;
}

export async function summonAsync(
  agentName: keyof typeof SPECIALISTS,
  context: SummonContext
): Promise<SummonResult> {
  const agent = SPECIALISTS[agentName];
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);

  console.log(`\n🔮 [MEOW] Non-blocking summon: ${agent.name}...`);

  const command = agent.getCommand(context);

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
    });

    const pid = child.pid || Math.floor(Math.random() * 100000);
    
    // 1. Register Mission with Kernel
    if (context.kernel) {
      context.kernel.registerMission(pid, agent.name, context.goal);
    }

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { 
      stdout += data.toString();
      // 2. Heartbeat Pulse
      context.kernel?.updateMissionPulse(pid, "running");
    });
    
    child.stderr?.on('data', (data: Buffer) => { 
      stderr += data.toString();
      context.kernel?.updateMissionPulse(pid, "running");
    });

    child.on('close', (code: number) => {
      const status = code === 0 ? "completed" : "failed";
      context.kernel?.updateMissionPulse(pid, status);
      
      resolve({
        success: code === 0,
        output: stdout || stderr || 'No output',
        agentName: agent.name,
        exitCode: code ?? undefined,
      });
    });

    child.on('error', (err: Error) => {
      resolve({
        success: false,
        output: err.message,
        agentName: agent.name,
        pid
      });
    });
  });
}

export async function summonParallel(agents: Array<{ name: string, context: SummonContext }>): Promise<SummonResult[]> {
  const promises = agents.map(a => summonAsync(a.name as any, a.context));
  const results = await Promise.all(promises);
  
  // Spooky Action at a Distance: Entangle the PIDs of the swarm
  const pids = results.map(r => r.pid).filter((pid): pid is number => !!pid);
  if (pids.length > 1 && agents[0].context.kernel) {
    const kernel = agents[0].context.kernel;
    pids.forEach(pid => {
      const others = pids.filter(p => p !== pid);
      // This is where we would normally call registerMission, but it's already called in summonAsync.
      // So we'll update the entanglement map directly or trigger a 'Bell State' sync.
      kernel.updateMissionPulse(pid, "entangled"); 
    });
  }

  return results;
}

export async function summon(agentName: keyof typeof SPECIALISTS, context: SummonContext): Promise<string> {
  const agent = SPECIALISTS[agentName];
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);

  console.log(`\n🔮 [META-ORCHESTRATOR] Summoning Specialist: ${agent.name}...`);
  console.log(`📝 Mission: ${context.goal}\n`);

  const command = agent.getCommand(context);

  try {
    if (agentName === "aider") {
      try {
        execSync("aider --version", { stdio: "ignore" });
      } catch (e) {
        console.log("⚠️ Aider not found in PATH. Escalating to Claude Code...");
        return summon("cc", context);
      }
    }
    if (agentName === "opencode") {
      try {
        execSync("opencode --version", { stdio: "ignore" });
      } catch (e) {
        console.log("⚠️ OpenCode not found in PATH. Escalating to Claude Code...");
        return summon("cc", context);
      }
    }
    if (agentName === "claude" || agentName === "cc") {
      try {
        execSync("claude --version", { stdio: "ignore" });
      } catch (e) {
        console.log("⚠️ Claude Code not found in PATH. Please run 'use_skill | setup' to install it.");
        throw new Error("Claude Code not found.");
      }
    }
    if (agentName === "claude-hermes") {
      // Hermes now uses Claude Code as backend - no separate installation needed
      // Just verify Claude is available
      try {
        execSync("claude --version", { stdio: "ignore" });
      } catch (e) {
        console.log("⚠️ Hermes Agent requires Claude Code. Please run 'use_skill | setup' to install it.");
        throw new Error("Claude Code not found - Hermes backend unavailable.");
      }
    }
    if (agentName === "claude-browseros") {
      // Use BrowserOSManager to check and auto-start if needed
      const browserOS = getBrowserOSManager();
      const status = await browserOS.ensureRunning();
      if (!status.connected || !status.cdpConnected) {
        throw new Error("BrowserOS not available.");
      }
      console.log(`✓ BrowserOS ready at ${status.serverUrl} (CDP: ${status.cdpConnected ? "connected" : "disconnected"})`);
    }
    execSync(command, { stdio: "inherit", cwd: process.cwd() });
    return `✅ ${agent.name} has completed the mission. MEOW is resuming control and analyzing changes.`;
  } catch (error: any) {
    if (agentName === "aider" || agentName === "opencode") {
      console.log(`⚠️ ${agent.name} failed. Escalating to Claude Code (Level 2 Specialist)...`);
      return summon("cc", context);
    }
    return `❌ Escalation failed. ${agent.name} error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * Summon the Harvester specialist to distill mission patterns into skills.
 * This is called after a mission is marked "COHERENT" for complex goals.
 */
export async function summonHarvester(
  goal: string, 
  complexity: "low" | "medium" | "high",
  quantumMemory: QuantumMemory,
  successfulPatterns: string[] = []
): Promise<{ success: boolean; skillPath?: string; skillName?: string; error?: string }> {
  const harvester = new Harvester(quantumMemory);
  
  const ctx = {
    goal,
    complexity,
    sessionLogs: [],
    successfulPatterns,
  };
  
  return harvester.harvest(ctx);
}
