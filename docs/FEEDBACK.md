# Feedback: fixMeow() Self-Repair Path — Root Cause Analysis

**Date:** 2026-05-23
**Status:** Open / Investigating

---

## Issue

`fixMeow()` in `src/agent/agent.ts` times out at 300s when `claude -p` is spawned via Node.js `spawn(shell:true)` *inside the meow agent context*, even though the same spawn command works correctly when tested directly in a standalone Node script.

**Status: FIXED** — Replaced `spawn(shell:true)` with `exec()` in `src/agent/agent.ts` fixMeow(). `exec()` collects stdout reliably via callback rather than event-based streaming that can race with process exit on Windows cmd.exe.

---

## What Was Observed

### Direct Node.js test (WORKS):
```javascript
spawn("claude.cmd -p @C:\\Users\\...\\meow_test.txt ...", [], {shell:true});
// Returns within seconds with correct output
```

### Inside meow agent context (TIMEOUTS):
The meow agent runs `claude -p @<tmpfile>` via `spawn(shell:true)`, the 300s timer fires without any output collected.

---

## Code Path (src/agent/agent.ts)

```typescript
const tmpFile = path.join(tmpdir(), `meow_fix_${Date.now()}.txt`);
await writeFile(tmpFile, fixPrompt, "utf-8");

const claudeBin = process.platform === "win32" ? "claude.cmd" : "claude";
const fullCmd = `${claudeBin} -p @${tmpFile} ...`;

return await new Promise<string>((resolve) => {
  const child = spawn(fullCmd, [], {
    cwd: meowDir,
    shell: true,
    env: { ...process.env, CI: "true" },
  });

  let stdout = "", stderr = "";
  child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

  const timer = setTimeout(() => {
    child.kill();
    resolve(`❌ claude -p timed out after 300s\nSTDERR: ${stderr.substring(0, 500)}`);
  }, 300_000);

  child.on("close", async (code: number | null) => {
    clearTimeout(timer);
    await rm(tmpFile).catch(() => {});
    if (code === 0 || stdout.includes("SEARCH")) {
      // ... handle success
    }
  });
});
```

---

## Hypotheses

1. **stdout/stderr not collected fast enough** — `child.stdout.on("data")` may not fire before the close event fires with empty buffers. But direct tests show stdout IS collected.

2. **CI: "true" env var causes different behavior** — meow sets `CI: "true"` which may change claude's behavior to require stdin that's not being provided.

3. **cwd mismatch** — `meowDir` is passed as `cwd`, but the `@file` path is absolute (from `tmpdir()`). The cwd shouldn't matter for absolute paths.

4. **stdout buffer issue** — When the parent process is killed or the promise resolves before the child's stdout fully drains, the stdout may be lost.

5. **spawn shell:true + @file syntax interaction on Windows cmd.exe** — The `@file` expansion happens at the shell level. When `cmd.exe /c` spawns `claude.cmd`, something about the combination causes the output to not be captured.

---

## What We Know Works

- `claude.cmd -p "@C:\\path\\file.txt"` works fine in Git Bash and cmd.exe directly
- The `@file` expansion is handled by claude, not the shell
- Direct Node.js `spawn` with `@file` works (tested in isolation with exit code 0)
- The error message "Warning: no stdin data received in 3s" no longer appears (fixMeow timeout was raised to 300s)

---

## Next Steps

- [ ] Test `spawn(shell:true)` with `CI: "true"` env in isolation to check if CI mode causes the issue
- [ ] Add `child.stdout.setEncoding("utf8")` explicitly before piping
- [ ] Try using `child.spawnargs` to verify the command is being constructed correctly
- [ ] Log `fullCmd` to file before spawning to verify the command string is correct
- [ ] Consider using `exec` instead of `spawn` for the heredoc case, since `exec` handles stdin differently

---

## Related Commits

- `15ec526` — fix: increase fixMeow timeout to 300s and close stdin to prevent hang
- `b8a31bd` — fix: use @file syntax for claude -p to avoid stdin hang, suppress extension discovery errors

---

## Issue: meow -p Task Produces Stub Instead of Full Content

**Date:** 2026-05-23
**Status:** Confirmed

---

## What Was Observed

When dispatching a task via `meow -p` to create `docs/repo-map.md`, the agent completed the task and reported success, but the file only contained a single-line stub (`# Meow Repository Map`) with no actual content.

The agent's output showed it had read files and written to the target, but the final file was nearly empty.

---

## Code Path

`meow -p "Create a repository map document and save it to docs/repo-map.md..."`

The agent:
1. Listed directories and read key files (confirmed by cost/output traces)
2. Called `write` to save `docs/repo-map.md`
3. Reported success

But the file on disk contained only the title line.

---

## Hypotheses

1. **Write succeeded but was later overwritten** — The agent may have called `write` successfully, but a subsequent operation (another agent, a retry, or a checkpoint restore) overwrote it.

2. **Write was called with truncated content** — The content passed to `write` was somehow truncated before it reached the file system. This could happen if the prompt content was very long and got compacted or truncated during context management.

3. **MEOW-3-RULE recovery produced stale state** — After the agent completed and checkpointed, a subsequent recovery or replay may have restored an earlier empty version of the file.

4. **Context compaction dropped the write content** — If the agent's context was compacted mid-task, the full content to write may have been lost from the agent's context before the `write` call executed.

5. **Task claimed and worked by multiple agents** — The task was picked up by multiple specialist agents in parallel, and one agent's write overwrote another's.

---

## What to Check

- [ ] Look at git history for `docs/repo-map.md` — was it ever fully written before this session?
- [ ] Check if `docs/repo-map.md` existed before the meow -p call (did the agent create from scratch or edit?)
- [ ] Compare the agent's reported `write` call content vs what ended up on disk
- [ ] Add a read-back verification step after `write` to confirm content was written
- [ ] Check if ParallelExecutor or another agent could have written to the same file concurrently

---

## Related Commits

None yet — this was the first time this issue was observed.