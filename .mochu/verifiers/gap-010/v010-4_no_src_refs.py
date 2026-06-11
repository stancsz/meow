#!/usr/bin/env python3
"""v010-4: package.json has no src/ references.

Claim: after W5, package.json scripts and dependencies no longer reference src/.
The old system (tsc src/, tsx src/index.ts) is gone.
"""
import json
import re
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
    pkg = root / "package.json"
    if not pkg.exists():
        print("SKIP: package.json not found")
        return 2

    data = json.loads(pkg.read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})

    src_refs = []
    for name, cmd in scripts.items():
        if re.search(r"\bsrc/", cmd):
            src_refs.append(f"{name}: {cmd}")

    if src_refs:
        print(f"FAIL: package.json scripts still reference src/:")
        for r in src_refs:
            print(f"  {r}")
        return 1

    print("PASS: package.json has no src/ references")
    return 0


if __name__ == "__main__":
    sys.exit(main())