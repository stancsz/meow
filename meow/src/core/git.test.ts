/**
 * Tests for Git Integration Module
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

describe('Git Integration', () => {
  const testDir = join(tmpdir(), `simpleclaw-git-test-${Date.now()}`);
  
  beforeAll(async () => {
    // Create test directory and initialize git repo
    await mkdir(testDir, { recursive: true });
    await execAsync('git init', { cwd: testDir });
    await execAsync('git config user.email "test@example.com"', { cwd: testDir });
    await execAsync('git config user.name "Test User"', { cwd: testDir });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should detect git repository', async () => {
    const { isGitRepo, getRepoRoot } = await import('./git');
    
    expect(await isGitRepo(testDir)).toBe(true);
    expect(await isGitRepo('/nonexistent')).toBe(false);
    
    const repoRoot = await getRepoRoot(testDir);
    expect(repoRoot).toBe(testDir);
  });

  test('should get clean git status', async () => {
    const { getGitStatus } = await import('./git');
    
    const status = await getGitStatus(testDir);
    expect(status.branch).toBe('master'); // or 'main' depending on git version
    expect(status.isClean).toBe(true);
    expect(status.staged).toHaveLength(0);
    expect(status.modified).toHaveLength(0);
  });

  test('should detect modified files', async () => {
    const { getGitStatus, getGitDiff } = await import('./git');
    
    // Create and modify a file
    await writeFile(join(testDir, 'test.txt'), 'Hello World');
    
    const status = await getGitStatus(testDir);
    expect(status.isClean).toBe(false);
    expect(status.modified).toContain('test.txt');
    
    const diffs = await getGitDiff(undefined, testDir);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs[0].file).toBe('test.txt');
  });

  test('should generate conventional commit message', async () => {
    const { generateConventionalCommitMessage } = await import('./git');
    
    const diffs = [{
      file: 'src/test.ts',
      hunks: [],
      additions: 10,
      deletions: 2,
    }];
    
    const message = await generateConventionalCommitMessage(diffs);
    expect(message).toContain('feat');
  });

  test('should stage and commit files', async () => {
    const { stageFiles, commitChanges, getGitStatus } = await import('./git');
    
    // Create a new file
    await writeFile(join(testDir, 'newfile.txt'), 'New content');
    
    const status = await getGitStatus(testDir);
    expect(status.untracked).toContain('newfile.txt');
    
    // Stage
    await stageFiles(['newfile.txt'], testDir);
    
    const stagedStatus = await getGitStatus(testDir);
    expect(stagedStatus.staged).toContain('newfile.txt');
    
    // Commit
    const result = await commitChanges('feat: add newfile', testDir);
    expect(result.success).toBe(true);
    expect(result.hash).toBeDefined();
    
    const afterCommitStatus = await getGitStatus(testDir);
    expect(afterCommitStatus.isClean).toBe(true);
  });

  test('should get commit log', async () => {
    const { getCommitLog } = await import('./git');
    
    const log = await getCommitLog(10, testDir);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].hash).toBeDefined();
    expect(log[0].message).toBeDefined();
    expect(log[0].author).toBeDefined();
  });
});
