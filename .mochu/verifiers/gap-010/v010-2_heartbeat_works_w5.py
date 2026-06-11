#!/usr/bin/env python3
"""v010-2: heartbeat works after W5 (src/ deleted).

Claim: after src/ is deleted, meow birth still succeeds.
bin/meow.ts has zero imports from src/ — heartbeat is fully self-contained.
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
        print(f"FAIL: meow birth broken after W5 (exit {r.returncode})")
        print(f"  stderr: {r.stderr[:200]}")
        return 1
    output = r.stdout
    if len(output) < 100 or "[heartbeat] birth:" not in output:
        print("FAIL: no valid birth output")
        return 1
    print(f"PASS: heartbeat works after W5 ({len(output)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())