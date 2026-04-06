---
name: print-mode
repo: https://github.com/anthropics/claude-code
docPath: bugs/windows-print-crash.md
why: The --print mode crashes on Windows with UV assertion failures when using stdin pipes. Without working --print, batch and script modes are broken.
minimalSlice: "Fix the stdin pipe handling - use file input redirection instead of echo/pipes, or skip stdin entirely and use --input-file flag"
fit: sidecar
complexity: 3
status: pending
---

# Fix: --print Mode Crash on Windows

**Problem:** When using `echo "prompt" | claude --print` on Windows, the process crashes with:
```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

This affects:
- `echo "prompt" | claude --print`
- `claude --print < file.txt`
- Any stdin pipe usage

**Root Cause:** Windows async.c UV_HANDLE_CLOSING assertion when stdin pipe closes during async operations.

**Minimal Slice:**
1. Use file input redirection instead of echo/pipe: `claude -p < prompt.txt`
2. Or use prompt as argument: `claude -p "prompt text"`
3. Or use --input-file flag if available

**Test:**
```bash
echo "Say hello" | timeout 30 claude --dangerously-skip-permissions -p
# Should output "hello" without crash
```
