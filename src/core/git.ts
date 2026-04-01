/**
 * Git Integration Module for SimpleClaw
 * Provides git-aware file editing, auto-commits, and branch awareness
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, access, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { constants } from 'node:fs';

const execAsync = promisify(exec);

export interface GitStatus {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  isClean: boolean;
}

export interface GitDiff {
  file: string;
  hunks: string[];
  additions: number;
  deletions: number;
}

export interface GitCapability {
  enabled: boolean;
  autoCommit: boolean;
  commitMessage: 'conventional' | 'auto' | 'manual';
  allowedOperations: GitOperation[];
  repoRoot?: string;
}

export type GitOperation = 'commit' | 'push' | 'pull' | 'branch' | 'diff' | 'status' | 'log';

export interface GitConfig {
  autoCommit?: boolean;
  commitMessage?: 'conventional' | 'auto' | 'manual';
  allowedOperations?: GitOperation[];
  userMessage?: string;
}

const DEFAULT_GIT_CONFIG: GitConfig = {
  autoCommit: false,
  commitMessage: 'conventional',
  allowedOperations: ['status', 'diff', 'commit', 'push', 'pull', 'branch', 'log'],
};

const CONVENTIONAL_COMMIT_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'
];

/**
 * Check if git is available and the current directory is a git repo
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: cwd || process.cwd() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository
 */
export async function getRepoRoot(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: cwd || process.cwd() });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get current git status
 */
export async function getGitStatus(cwd?: string): Promise<GitStatus> {
  const workDir = cwd || process.cwd();
  
  try {
    // Get current branch
    const { stdout: branchStdout } = await execAsync('git branch --show-current', { cwd: workDir });
    const branch = branchStdout.trim();

    // Get staged, modified, untracked files
    const { stdout: statusStdout } = await execAsync(
      'git status --porcelain',
      { cwd: workDir }
    );

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of statusStdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.slice(3).trim();

      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filePath);
      } else if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(filePath);
      }
      
      if (workTreeStatus !== ' ' && workTreeStatus !== '?' && workTreeStatus !== 'M' && workTreeStatus !== 'D') {
        modified.push(filePath);
      } else if (workTreeStatus === 'M' || workTreeStatus === 'D') {
        modified.push(filePath);
      }
    }

    // Get ahead/behind count
    let ahead = 0;
    let behind = 0;
    
    try {
      const { stdout: refStdout } = await execAsync('git rev-list --left-right --count HEAD...@{upstream}', { cwd: workDir });
      const [a, b] = refStdout.trim().split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // No upstream configured
    }

    return {
      branch,
      staged,
      modified,
      untracked,
      ahead,
      behind,
      isClean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
    };
  } catch (error) {
    throw new Error(`Failed to get git status: ${error}`);
  }
}

/**
 * Get diff for a specific file or all modified files
 */
export async function getGitDiff(files?: string[], cwd?: string): Promise<GitDiff[]> {
  const workDir = cwd || process.cwd();
  
  try {
    const fileArgs = files?.length ? files.join(' ') : '';
    const { stdout } = await execAsync(
      `git diff --unified=3 ${fileArgs}`,
      { cwd: workDir }
    );

    if (!stdout.trim()) return [];

    const diffs: GitDiff[] = [];
    const fileBlocks = stdout.split(/^diff --git/);

    for (const block of fileBlocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;

      const file = headerMatch[2];
      const hunks: string[] = [];
      let additions = 0;
      let deletions = 0;

      let currentHunk: string[] = [];
      let inHunk = false;

      for (const line of lines.slice(1)) {
        if (line.startsWith('@@')) {
          if (currentHunk.length > 0) {
            hunks.push(currentHunk.join('\n'));
          }
          currentHunk = [line];
          inHunk = true;
        } else if (inHunk) {
          currentHunk.push(line);
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }

      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
      }

      diffs.push({ file, hunks, additions, deletions });
    }

    return diffs;
  } catch (error) {
    throw new Error(`Failed to get git diff: ${error}`);
  }
}

/**
 * Get staged diff
 */
export async function getStagedDiff(cwd?: string): Promise<GitDiff[]> {
  const workDir = cwd || process.cwd();
  
  try {
    const { stdout } = await execAsync('git diff --cached --unified=3', { cwd: workDir });

    if (!stdout.trim()) return [];

    const diffs: GitDiff[] = [];
    const fileBlocks = stdout.split(/^diff --git/);

    for (const block of fileBlocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;

      const file = headerMatch[2];
      const hunks: string[] = [];
      let additions = 0;
      let deletions = 0;

      let currentHunk: string[] = [];
      let inHunk = false;

      for (const line of lines.slice(1)) {
        if (line.startsWith('@@')) {
          if (currentHunk.length > 0) {
            hunks.push(currentHunk.join('\n'));
          }
          currentHunk = [line];
          inHunk = true;
        } else if (inHunk) {
          currentHunk.push(line);
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }

      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
      }

      diffs.push({ file, hunks, additions, deletions });
    }

    return diffs;
  } catch (error) {
    throw new Error(`Failed to get staged diff: ${error}`);
  }
}

/**
 * Generate a conventional commit message based on changes
 */
export async function generateConventionalCommitMessage(
  diffs: GitDiff[],
  userMessage?: string
): Promise<string> {
  // Analyze changes to determine commit type
  let hasFeatures = false;
  let hasBugFixes = false;
  let hasDocs = false;
  let hasTests = false;
  let hasRefactor = false;
  let hasPerf = false;

  for (const diff of diffs) {
    const ext = extname(diff.file).toLowerCase();
    const isTest = ext.includes('test') || ext.includes('spec') || diff.file.includes('__tests__');
    const isDocs = diff.file.includes('docs') || diff.file.endsWith('.md');

    if (isTest) {
      hasTests = true;
    } else if (isDocs) {
      hasDocs = true;
    } else if (diff.additions > diff.deletions * 2) {
      hasFeatures = true;
    } else if (diff.deletions > diff.additions) {
      hasRefactor = true;
    }
  }

  // Determine primary type
  let type = 'chore';
  if (hasFeatures) type = 'feat';
  else if (hasBugFixes) type = 'fix';
  else if (hasDocs) type = 'docs';
  else if (hasTests) type = 'test';
  else if (hasRefactor) type = 'refactor';
  else if (hasPerf) type = 'perf';

  // Generate scope from primary changed directory
  let scope = '';
  const allFiles = diffs.map(d => d.file);
  const dirs = new Set(allFiles.map(f => f.split('/')[0]));
  if (dirs.size === 1) {
    scope = dirs.values().next().value || '';
  }

  // Generate description
  let description = userMessage || '';
  if (!description) {
    // Auto-generate from changed files
    const changedDirs = Array.from(dirs).slice(0, 3).join(', ');
    description = `update ${changedDirs}`;
  }

  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${description}`;
}

/**
 * Stage files for commit
 */
export async function stageFiles(files: string[], cwd?: string): Promise<void> {
  const workDir = cwd || process.cwd();
  
  try {
    await execAsync(`git add ${files.map(f => `"${f}"`).join(' ')}`, { cwd: workDir });
  } catch (error) {
    throw new Error(`Failed to stage files: ${error}`);
  }
}

/**
 * Commit staged changes
 */
export async function commitChanges(
  message: string,
  cwd?: string
): Promise<{ success: boolean; hash?: string; error?: string }> {
  const workDir = cwd || process.cwd();
  
  try {
    // Validate commit message
    if (!message || message.trim().length < 3) {
      return { success: false, error: 'Commit message too short' };
    }

    const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: workDir });
    
    // Get the commit hash
    const { stdout: hashStdout } = await execAsync('git rev-parse HEAD', { cwd: workDir });
    
    return { success: true, hash: hashStdout.trim() };
  } catch (error: any) {
    const message = error.message || String(error);
    if (message.includes('nothing to commit')) {
      return { success: false, error: 'Nothing to commit' };
    }
    return { success: false, error: message };
  }
}

/**
 * Push to remote
 */
export async function pushChanges(cwd?: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const workDir = cwd || process.cwd();
  
  try {
    const { stdout, stderr } = await execAsync('git push', { cwd: workDir });
    return { success: true, output: stdout + stderr };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Pull from remote
 */
export async function pullChanges(cwd?: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const workDir = cwd || process.cwd();
  
  try {
    const { stdout, stderr } = await execAsync('git pull', { cwd: workDir });
    return { success: true, output: stdout + stderr };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Create a new branch
 */
export async function createBranch(name: string, checkout = true, cwd?: string): Promise<{ success: boolean; error?: string }> {
  const workDir = cwd || process.cwd();
  
  try {
    const checkoutFlag = checkout ? '-b' : '';
    await execAsync(`git checkout ${checkoutFlag} "${name}"`, { cwd: workDir });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Get recent commit history
 */
export async function getCommitLog(limit = 10, cwd?: string): Promise<Array<{
  hash: string;
  message: string;
  author: string;
  date: string;
}>> {
  const workDir = cwd || process.cwd();
  
  try {
    const { stdout } = await execAsync(
      `git log --oneline --format="%h|%s|%an|%ad" --date=short -n ${limit}`,
      { cwd: workDir }
    );

    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, message, author, date };
    });
  } catch (error) {
    throw new Error(`Failed to get commit log: ${error}`);
  }
}

/**
 * Get files modified in a specific commit
 */
export async function getCommitDiff(commitHash: string, cwd?: string): Promise<GitDiff[]> {
  const workDir = cwd || process.cwd();
  
  try {
    const { stdout } = await execAsync(
      `git show --unified=3 --format="" ${commitHash}`,
      { cwd: workDir }
    );

    // Parse the diff output similar to getGitDiff
    const diffs: GitDiff[] = [];
    const fileBlocks = stdout.split(/^diff --git/);

    for (const block of fileBlocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;

      const file = headerMatch[2];
      const hunks: string[] = [];
      let additions = 0;
      let deletions = 0;

      let currentHunk: string[] = [];
      let inHunk = false;

      for (const line of lines.slice(1)) {
        if (line.startsWith('@@')) {
          if (currentHunk.length > 0) {
            hunks.push(currentHunk.join('\n'));
          }
          currentHunk = [line];
          inHunk = true;
        } else if (inHunk) {
          currentHunk.push(line);
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }

      if (currentHunk.length > 0) {
        hunks.push(currentHunk.join('\n'));
      }

      diffs.push({ file, hunks, additions, deletions });
    }

    return diffs;
  } catch (error) {
    throw new Error(`Failed to get commit diff: ${error}`);
  }
}

/**
 * Auto-commit with conventional message
 */
export async function autoCommit(
  files?: string[],
  userMessage?: string,
  cwd?: string
): Promise<{ success: boolean; hash?: string; message?: string; error?: string }> {
  const workDir = cwd || process.cwd();
  
  // Get status and diffs
  const status = await getGitStatus(workDir);
  
  if (status.isClean) {
    return { success: false, error: 'Nothing to commit - working tree is clean' };
  }

  // Determine files to stage
  const filesToStage = files || [...status.staged, ...status.modified, ...status.untracked];
  
  if (filesToStage.length === 0) {
    return { success: false, error: 'No files to commit' };
  }

  // Stage files
  await stageFiles(filesToStage, workDir);

  // Get diff for message generation
  const diffs = await getStagedDiff(workDir);
  
  // Generate commit message
  const message = await generateConventionalCommitMessage(diffs, userMessage);

  // Commit
  const result = await commitChanges(message, workDir);
  
  if (result.success) {
    return { success: true, hash: result.hash, message };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Git integration class for orchestrator
 */
export class GitIntegration {
  private config: GitConfig;
  private repoRoot: string | null;

  constructor(config: GitConfig = {}) {
    this.config = { ...DEFAULT_GIT_CONFIG, ...config };
    this.repoRoot = null;
  }

  async initialize(cwd?: string): Promise<boolean> {
    const workDir = cwd || process.cwd();
    const isRepo = await isGitRepo(workDir);
    
    if (!isRepo) {
      return false;
    }

    this.repoRoot = await getRepoRoot(workDir);
    return true;
  }

  getStatus(): Promise<GitStatus> {
    return getGitStatus(this.repoRoot || undefined);
  }

  getDiff(files?: string[]): Promise<GitDiff[]> {
    return getGitDiff(files, this.repoRoot || undefined);
  }

  getStagedDiff(): Promise<GitDiff[]> {
    return getStagedDiff(this.repoRoot || undefined);
  }

  async commit(userMessage?: string): Promise<{ success: boolean; hash?: string; message?: string; error?: string }> {
    if (!this.config.allowedOperations?.includes('commit')) {
      return { success: false, error: 'Commit operation not allowed' };
    }

    return autoCommit(undefined, userMessage, this.repoRoot || undefined);
  }

  async push(): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!this.config.allowedOperations?.includes('push')) {
      return { success: false, error: 'Push operation not allowed' };
    }

    return pushChanges(this.repoRoot || undefined);
  }

  async pull(): Promise<{ success: boolean; output?: string; error?: string }> {
    if (!this.config.allowedOperations?.includes('pull')) {
      return { success: false, error: 'Pull operation not allowed' };
    }

    return pullChanges(this.repoRoot || undefined);
  }

  getLog(limit?: number): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
    return getCommitLog(limit, this.repoRoot || undefined);
  }

  isOperationAllowed(operation: GitOperation): boolean {
    return this.config.allowedOperations?.includes(operation) ?? false;
  }

  getConfig(): GitConfig {
    return { ...this.config };
  }
}

export default GitIntegration;
