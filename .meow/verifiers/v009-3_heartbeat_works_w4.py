#!/usr/bin/env python3
"""v009-3: heartbeat works after W4 deletions.

Claim: after W4 perimeter deletions, meow birth still succeeds.
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
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
        print(f"FAIL: meow birth broken after W4 (exit {r.returncode})")
        print(f"  stderr: {r.stderr[:200]}")
        return 1
    output = r.stdout
    if len(output) < 100 or "[heartbeat] birth:" not in output:
        print("FAIL: no valid birth output")
        return 1
    print(f"PASS: heartbeat works after W4 ({len(output)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())