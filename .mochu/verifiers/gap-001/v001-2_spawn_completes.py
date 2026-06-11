#!/usr/bin/env python3
"""v001-2: meow spawn completes (mocked).

Claim: `meow -p` spawns a claude session without crash.
Note: This is a smoke test — it checks spawn mechanics, not task completion.
A real task test requires ANTHROPIC_API_KEY.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
MEOW = ROOT / "bin" / "meow.ts"


def main() -> int:
    # Skip if bun not available
    r = subprocess.run(["bun", "--version"], capture_output=True)
    if r.returncode != 0:
        print("SKIP: bun not available")
        return 2

    # Check if claude is available
    claude_cmd = "claude.cmd" if sys.platform == "win32" else "claude"
    r = subprocess.run([claude_cmd, "--version"], capture_output=True)
    if r.returncode != 0:
        print(f"SKIP: {claude_cmd} not available")
        return 2

    # Skip if no API key (spawn will fail gracefully, but this tests mechanics)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("SKIP: ANTHROPIC_API_KEY not set")

    # Run meow -p with a simple echo task
    # This will likely fail due to API auth, but tests the spawn mechanism
    r = subprocess.run(
        ["bun", str(MEOW), "-p", "echo test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )

    # Check spawn didn't crash (exit code 0 = success, 1 = task failed, 3 = budget/schedule halt)
    # Any code < 10 indicates spawn mechanics worked; 127/128+ would indicate exec failure
    if r.returncode >= 10:
        print(f"FAIL: spawn crashed with code {r.returncode}")
        print(f"  stderr: {r.stderr[:500]}")
        return 1

    # Check output contains expected heartbeat log lines
    output = r.stdout + r.stderr
    if "[heartbeat] birth:" not in output:
        print("FAIL: no heartbeat birth log")
        return 1

    print(f"PASS: spawn mechanics work (exit code {r.returncode})")
    return 0


if __name__ == "__main__":
    sys.exit(main())