/**
 * Auto-Commit Hook Fix - XL-21
 * 
 * Problem: The auto-commit hook was failing when no staged changes existed.
 * Solution: Safely handle git auto-commit operations by checking for staged changes first.
 * 
 * @see JOB.md [XL-21] Fix auto_commit
 */

import { existsSync, readFileSync, execSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

const AUTO_COMMIT_ENABLED = process.env.AUTO_COMMIT_ENABLED !== "false";
const AUTO_COMMIT_MIN_CHANGES = parseInt(process.env.AUTO_COMMIT_MIN_CHANGES || "1");

// ============================================================================
// Git Status Check
// ============================================================================

/**
 * Check if there are staged changes ready to commit
 */
export function hasStagedChanges(): boolean {
  try {
    const result = execSync("git diff --staged --name-only", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const files = result.trim().split("\n").filter(f => f.length > 0);
    return files.length >= AUTO_COMMIT_MIN_CHANGES;
  } catch (error) {
    // Exit code 1 means no staged changes (not an error)
    if (error instanceof Error && "status" in error && (error as any).status === 1) {
      return false;
    }
    console.warn("[auto-commit] Failed to check staged changes:", error);
    return false;
  }
}

/**
 * Get list of staged files
 */
export function getStagedFiles(): string[] {
  try {
    const result = execSync("git diff --staged --name-only", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim().split("\n").filter(f => f.length > 0);
  } catch {
    return [];
  }
}

// ============================================================================
// Auto-Commit Execution
// ============================================================================

/**
 * Execute git commit for staged changes
 * Returns true if commit was successful or no-op (no changes)
 */
export function autoCommit(options: {
  message?: string;
  allowEmpty?: boolean;
} = {}): { success: boolean; message: string; commitHash?: string } {
  const { message = "chore: auto-commit via Meow swarm", allowEmpty = false } = options;

  // Safety check: Ensure we're in a git repository
  if (!existsSync(".git")) {
    return { success: false, message: "Not a git repository" };
  }

  // Check for staged changes first (the fix!)
  const stagedFiles = getStagedFiles();
  
  if (stagedFiles.length === 0) {
    console.log("[auto-commit] No staged changes - skipping commit (no-op)");
    return { success: true, message: "No staged changes - skipped" };
  }

  if (!AUTO_COMMIT_ENABLED) {
    console.log("[auto-commit] Disabled via AUTO_COMMIT_ENABLED=false");
    return { success: false, message: "Auto-commit disabled" };
  }

  try {
    // Build git commit command
    const commitMessage = message.includes("${files}") 
      ? message.replace("${files}", stagedFiles.join(", "))
      : `${message}\n\nStaged files: ${stagedFiles.join(", ")}`;

    const args = ["commit", "-m", commitMessage];
    
    // Allow empty commits if explicitly enabled
    if (allowEmpty) {
      args.push("--allow-empty");
    }

    const result = execSync(`git ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"]
    });

    // Extract commit hash
    const hashMatch = result.match(/\[([^\s]+)\s+([^\]]+)\]/);
    const commitHash = hashMatch ? hashMatch[1] : undefined;

    console.log(`[auto-commit] ✅ Committed: ${stagedFiles.length} file(s)`);
    console.log(`[auto-commit] 📝 ${commitMessage.split("\n")[0]}`);

    return { 
      success: true, 
      message: `Committed ${stagedFiles.length} files`,
      commitHash 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[auto-commit] ❌ Commit failed:", errorMessage);
    return { success: false, message: errorMessage };
  }
}

// ============================================================================
// DoneHook Integration
// ============================================================================

import type { DoneHook, HookContext, HookResult } from "./done-hooks";

/**
 * Create the Auto-Commit DoneHook
 * 
 * This hook triggers after task completion to automatically
 * commit any staged changes.
 */
export function createAutoCommitHook(): DoneHook {
  return {
    name: "auto-commit",
    priority: 25,  // Low priority - runs after most other hooks
    trigger: (context: HookContext) => {
      // Trigger only on successful task completion
      return context.task.success && AUTO_COMMIT_ENABLED;
    },
    execute: async (context: HookContext): Promise<HookResult> => {
      const result = autoCommit({
        message: `chore: completed task via Meow - ${context.task.description.slice(0, 50)}`
      });
      
      return {
        success: result.success,
        metadata: {
          commitHash: result.commitHash,
          stagedCount: getStagedFiles().length
        }
      };
    }
  };
}

/**
 * Register auto-commit hook to DoneHooks
 */
export function registerAutoCommitHook(): void {
  try {
    const { getDefaultHooks } = require("./done-hooks");
    const hooks = getDefaultHooks();
    
    if (!hooks.hasHook("auto-commit")) {
      hooks.register(createAutoCommitHook());
      console.log("[auto-commit] Hook registered to DoneHooks");
    }
  } catch (e) {
    console.error("[auto-commit] Failed to register hook:", e);
  }
}

// ============================================================================
// CLI for Testing
// ============================================================================

const cmd = process.argv[2]?.toLowerCase();

if (cmd === "check") {
  const staged = getStagedFiles();
  console.log(`Staged files: ${staged.length}`);
  if (staged.length > 0) {
    console.log(staged.join("\n"));
  }
  process.exit(0);
}

if (cmd === "run" || cmd === "commit") {
  const result = autoCommit();
  console.log(result.message);
  process.exit(result.success ? 0 : 1);
}

if (cmd === "dry-run") {
  const staged = getStagedFiles();
  if (staged.length === 0) {
    console.log("No staged changes - would skip commit");
  } else {
    console.log(`Would commit ${staged.length} files:`);
    console.log(staged.join("\n"));
  }
  process.exit(0);
}

// Export for use in other modules
export { autoCommit, hasStagedChanges, getStagedFiles };
