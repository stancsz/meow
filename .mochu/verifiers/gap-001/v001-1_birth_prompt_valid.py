#!/usr/bin/env python3
"""v001-1: meow birth produces valid birth prompt.

Claim: `meow birth` outputs a non-empty, structured birth prompt.
"""
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

    # Run meow birth (dry run - no spawn)
    r = subprocess.run(
        ["bun", str(MEOW), "birth"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=30,
    )

    # Birth should succeed
    if r.returncode != 0:
        print(f"FAIL: meow birth exited {r.returncode}")
        print(f"  stdout: {r.stdout[:200]}")
        print(f"  stderr: {r.stderr[:200]}")
        return 1

    output = r.stdout
    # Birth prompt should have content
    if len(output) < 100:
        print(f"FAIL: birth prompt too short ({len(output)} chars)")
        return 1

    # Birth prompt should contain expected sections
    required = ["# You are meow", "## Role this life", "## Motive", "## Exit contract"]
    missing = [s for s in required if s not in output]
    if missing:
        print(f"FAIL: birth prompt missing sections: {missing}")
        return 1

    print(f"PASS: birth prompt valid ({len(output)} chars, {len(required)} sections)")
    return 0


if __name__ == "__main__":
    sys.exit(main())