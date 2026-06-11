#!/usr/bin/env python3
"""v010-1: src/ deleted from main.

Claim: W5 of MIGRATION.md: src/ is EMPTY. The entire src/ directory is gone.
The heartbeat (bin/meow.ts) has zero imports from src/.
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
    src = root / "src"
    if src.exists():
        items = list(src.iterdir())
        print(f"FAIL: src/ still exists ({len(items)} items)")
        return 1
    print("PASS: src/ deleted from main (W5 complete)")
    return 0


if __name__ == "__main__":
    sys.exit(main())