#!/usr/bin/env python3
"""v009-1: src/extensions/, src/mcp/, src/eval/ deleted from main.

Claim: W4 of MIGRATION.md: delete src/extensions/, src/mcp/, src/eval/.
These are peripheral modules not needed by the core heartbeat.
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    dirs = ["extensions", "mcp", "eval"]
    found = []
    for d in dirs:
        p = root / "src" / d
        if p.exists():
            found.append(d)
    if found:
        print(f"FAIL: src/{', '.join(found)}/ still exist(s)")
        return 1
    print("PASS: src/extensions/, src/mcp/, src/eval/ deleted from main")
    return 0


if __name__ == "__main__":
    sys.exit(main())