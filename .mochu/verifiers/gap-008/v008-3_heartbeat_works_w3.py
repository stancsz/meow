#!/usr/bin/env python3
"""v008-3: heartbeat works after W3 deletions.

Claim: after W3 deletions (src/agent/, orchestrator/, kernel/, cli/), meow birth still succeeds.
The heartbeat must survive W3 — it has no deps on legacy.
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
    meow = root / "bin" / "meow.ts"

    r = subprocess.run(["bun", "--version"], capture_output=True)
    if r.returncode != 0:
        print("SKIP: bun not available")
        return 2

    r = subprocess.run(
        ["bun", str(meow), "birth"],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        print(f"FAIL: meow birth broken after W3 deletions (exit {r.returncode})")
        print(f"  stderr: {r.stderr[:200]}")
        return 1
    output = r.stdout
    if len(output) < 100:
        print(f"FAIL: birth output too short ({len(output)} chars)")
        return 1
    if "[heartbeat] birth:" not in output:
        print("FAIL: no heartbeat birth log")
        return 1
    print(f"PASS: heartbeat works after W3 deletions ({len(output)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())