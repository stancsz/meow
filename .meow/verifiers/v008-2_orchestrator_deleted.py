#!/usr/bin/env python3
"""v008-2: src/orchestrator/, src/kernel/, src/cli/ deleted from main.

Claim: W3 of MIGRATION.md: delete src/orchestrator/, src/kernel/, src/cli/ (TUI/REPL).
Expected: ~11,000 LOC removed.
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    dirs = ["orchestrator", "kernel", "cli"]
    missing = []
    for d in dirs:
        p = root / "src" / d
        if p.exists():
            print(f"FAIL: src/{d}/ still exists")
            missing.append(d)
    if missing:
        return 1
    print("PASS: src/orchestrator/, src/kernel/, src/cli/ deleted from main")
    return 0


if __name__ == "__main__":
    sys.exit(main())