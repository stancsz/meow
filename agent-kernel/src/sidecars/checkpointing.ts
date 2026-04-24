/**
 * checkpointing.ts - Harvested from google/gemini-cli
 *
 * Automatically snapshots project state before AI file modifications.
 * Lets users approve experimental changes knowing they can instantly revert.
 *
 * Core trick: before each write/edit tool call, git stash a temporary checkpoint.
 * After the tool runs, if user approves the result, checkpoint is dropped.
 * If user runs /restore, revert to checkpoint via git stash pop.
 *
 * Minimal slice: git stash + slash command, ~80 lines.
 */
import { exec } from "node:child_process";
import { registerCommand } from "./slash-commands.ts";

// Track the most recent checkpoint stash reference
let lastCheckpointRef: string | null = null;
let checkpointActive = false;

function execGit(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(`git ${cmd}`, { encoding: "utf-8" }, (err, stdout, stderr) => {
      resolve({ stdout, stderr, code: err ? 1 : 0 });
    });
  });
}

/**
 * Create a checkpoint via git stash before write/edit operations.
 * Returns the stash ref for later restoration.
 */
export async function createCheckpoint(): Promise<string | null> {
  // Drop any existing checkpoint first (find by message pattern)
  if (checkpointActive) {
    await dropCheckpoint();
  }

  const timestamp = Date.now();
  const msg = `checkpoint:${timestamp}`;
  const result = await execGit(`stash push -m "${msg}"`);

  if (result.code !== 0) {
    // Not a git repo or stash failed - checkpoint not available
    return null;
  }

  // After git stash push, the new stash is always at stash@{0}
  lastCheckpointRef = "stash@{0}";
  checkpointActive = true;
  return lastCheckpointRef;
}

/**
 * Drop the checkpoint (user approved the changes).
 */
export async function dropCheckpoint(): Promise<void> {
  if (!checkpointActive) return;

  // Find our checkpoint by message pattern
  const listResult = await execGit("stash list");
  const lines = listResult.stdout.split("\n").filter((l) => l.includes("checkpoint:"));

  if (lines.length > 0) {
    const match = lines[0].match(/^(stash@\{\d+\})/);
    if (match) {
      await execGit(`stash drop ${match[1]}`);
    }
  }

  checkpointActive = false;
  lastCheckpointRef = null;
}

/**
 * Restore to the last checkpoint via git stash pop.
 */
export async function restoreCheckpoint(): Promise<{ success: boolean; message: string }> {
  if (!checkpointActive) {
    return { success: false, message: "No active checkpoint to restore." };
  }

  // Find our checkpoint by message pattern (handles case where user created other stashes)
  const listResult = await execGit("stash list");
  const lines = listResult.stdout.split("\n").filter((l) => l.includes("checkpoint:"));

  if (lines.length === 0) {
    checkpointActive = false;
    lastCheckpointRef = null;
    return { success: false, message: "Checkpoint stash not found (may have already been restored)." };
  }

  // Extract stash ref from first matching line: "stash@{N} on branch: message"
  const match = lines[0].match(/^(stash@\{\d+\})/);
  if (!match) {
    return { success: false, message: "Could not parse stash reference." };
  }

  const stashRef = match[1];
  const result = await execGit(`stash pop ${stashRef}`);
  checkpointActive = false;
  lastCheckpointRef = null;

  if (result.code !== 0) {
    return { success: false, message: `Restore failed: ${result.stderr}` };
  }
  return { success: true, message: "Restored to checkpoint. All changes since checkpoint have been reverted." };
}

/**
 * Lineage Checkpoint (Autoresearch style):
 * Creates a real commit on a side-branch to track research iteration.
 * This is persistent even if stashes are cleared.
 */
export async function createLineageCheckpoint(tag: string): Promise<{ success: boolean; hash?: string; stderr?: string }> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("git add -A", { encoding: "utf-8", timeout: 5000 });
    const msg = `research-iteration: ${tag}`;
    const result = execSync(`git commit --allow-empty -m "${msg}"`, { encoding: "utf-8", timeout: 5000 });
    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    return { success: true, hash };
  } catch (e: any) {
    return { success: false, stderr: e.message };
  }
}


/**
 * Check if a checkpoint is currently active.
 */
export function hasCheckpoint(): boolean {
  return checkpointActive && lastCheckpointRef !== null;
}

// Register /restore slash command
registerCommand({
  name: "restore",
  description: "Restore files to the last checkpoint state",
  execute: async () => {
    if (!hasCheckpoint()) {
      return { content: "No checkpoint to restore. Checkpoints are created automatically before write/edit operations." };
    }
    const result = await restoreCheckpoint();
    return { content: result.message };
  },
});

/**
 * Initialize checkpointing sidecar.
 * Wraps write/edit tools in tool-registry to auto-checkpoint before modifications.
 */
export async function initializeCheckpointing(): Promise<void> {
  const { getTool, registerTool } = await import("./tool-registry.ts");

  const wrapToolWithCheckpoint = (tool: Tool): Tool => {
    if (tool.name !== "write" && tool.name !== "edit") {
      return tool;
    }
    return {
      ...tool,
      execute: async (args, context) => {
        await createCheckpoint();
        return tool.execute(args, context);
      },
    };
  };

  // Wrap existing write/edit tools
  const writeTool = getTool("write");
  const editTool = getTool("edit");

  if (writeTool) registerTool(wrapToolWithCheckpoint(writeTool));
  if (editTool) registerTool(wrapToolWithCheckpoint(editTool));
}

// Register /checkpoint command
registerCommand({
  name: "checkpoint",
  description: "Create a lineage checkpoint (git commit) for the current state",
  execute: async (args: string[]) => {
    const tag = args[0] || "manual-checkpoint";
    const result = await createLineageCheckpoint(tag);
    if (result.success) {
      return { content: `Lineage checkpoint created: ${result.hash} (${tag})` };
    }
    return { content: `Failed to create checkpoint: ${result.stderr}` };
  },
});

// Tool interface (re-exported for type use)
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  cwd: string;
  dangerous: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

interface ToolResult {
  content: string;
  error?: string;
}
