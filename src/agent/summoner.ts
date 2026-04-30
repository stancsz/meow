import { execSync, spawn } from "child_process";

export interface SummonContext {
  goal: string;
  files: string[];
  lastError?: string;
  attempt?: number;
  existingSkills?: string[];
  monolithBlueprint?: string;
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
  }
};

export interface SummonResult {
  success: boolean;
  output: string;
  agentName: string;
  exitCode?: number;
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

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number) => {
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
      });
    });
  });
}

export async function summonParallel(
  agents: Array<{ name: keyof typeof SPECIALISTS; context: SummonContext }>
): Promise<SummonResult[]> {
  return Promise.all(agents.map(a => summonAsync(a.name, a.context)));
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
    execSync(command, { stdio: "inherit", cwd: process.cwd() });
    return `✅ ${agent.name} has completed the mission. MEOW is resuming control and analyzing changes.`;
  } catch (error: any) {
    if (agentName === "aider" || agentName === "opencode") {
      console.log(`⚠️ ${agent.name} failed. Escalating to Claude Code (Level 2 Specialist)...`);
      return summon("cc", context);
    }
    return `❌ Escalation failed. ${agent.name} error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
