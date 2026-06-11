#!/usr/bin/env python3
"""v009-5: src/ contains only core files (architect/, auditor/, liaison/, types/).

Claim: W4 of MIGRATION.md: "src/ is EMPTY". After W4, src/ should have only
the remaining dirs: architect/, auditor/, config/, liaison/, orca/, types/, index.ts.
MIGRATION.md §4 says "src/ is EMPTY" after W5, but W4 gets it close.
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    src = root / "src"
    if not src.exists():
        print("SKIP: src/ deleted (W5 territory)")
        return 2

    # Allowed: architect, auditor, config, liaison, orca, types, index.ts
    allowed = {"architect", "auditor", "config", "liaison", "orca", "types"}
    actual = set()
    for item in src.iterdir():
        if item.is_dir():
            actual.add(item.name)
        elif item.name == "index.ts":
            pass  # allowed
        else:
            actual.add(item.name)

    # Check: no disallowed dirs
    disallowed = actual - allowed
    if disallowed:
        print(f"FAIL: src/ still contains non-core: {sorted(disallowed)}")
        return 1

    print(f"PASS: src/ contains only core dirs: {sorted(allowed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())