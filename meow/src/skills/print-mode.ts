/**
 * print-mode.ts
 * # Fix: --print Mode Crash on Windows

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
 *
 * Harvested from: https://github.com/anthropics/claude-code
 * Why: The --print mode crashes on Windows with UV assertion failures when using stdin pipes. Without working --print, batch and script modes are broken.
 * Minimal slice: Fix the stdin pipe handling - use file input redirection instead of echo/pipes, or skip stdin entirely and use --input-file flag
 */

import { type Skill } from "./loader.ts";

export const print_mode: Skill = {
  name: "print-mode",
  description: "# Fix: --print Mode Crash on Windows

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
```",
  async execute(context) {
    // TODO: Implement print-mode capability from https://github.com/anthropics/claude-code
    // Fix the stdin pipe handling - use file input redirection instead of echo/pipes, or skip stdin entirely and use --input-file flag
    return { success: true, message: "print-mode capability" };
  },
};
