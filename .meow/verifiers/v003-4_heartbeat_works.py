#!/usr/bin/env python3
"""v003-4: heartbeat still works after W2 deletions.

Claim: after src/swarm/ and quantum deps are removed, meow birth still succeeds.
The core must survive W2 — nothing is deleted before the new path is proven.
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    # For .meow/verifiers/ files: 4 levels up to repo root
    root = Path(__file__).resolve()
    for _ in range(3):
        root = root.parent

    meow = root / "bin" / "meow.ts"

    # Check bun available
    r = subprocess.run(["bun", "--version"], capture_output=True)
    if r.returncode != 0:
        print("SKIP: bun not available")
        return 2

    # meow birth should still work
    r = subprocess.run(
        ["bun", str(meow), "birth"],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        print(f"FAIL: meow birth broken after W2 deletions (exit {r.returncode})")
        print(f"  stderr: {r.stderr[:200]}")
        return 1

    output = r.stdout
    if len(output) < 100:
        print(f"FAIL: meow birth output too short ({len(output)} chars)")
        return 1
    if "[heartbeat] birth:" not in output:
        print("FAIL: no heartbeat birth log")
        return 1

    print(f"PASS: heartbeat works after W2 deletions ({len(output)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
