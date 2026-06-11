#!/usr/bin/env python3
"""v003-3: legacy deps stripped from package.json.

Claim: quantum-circuit, blessed, blessed-contrib, ws are removed from package.json.
These are W2 deletions from MIGRATION.md §2. Expected: -4 deps.
"""
import json
import sys
from pathlib import Path


def main() -> int:
    # For .meow/verifiers/ files: 4 levels up to repo root
    # For .mochu/verifiers/gap-XXX/ files: 4 levels up to repo root
    root = Path(__file__).resolve()
    for _ in range(3):
        root = root.parent

    pkg = root / "package.json"
    if not pkg.exists():
        print("FAIL: package.json not found")
        return 1

    data = json.loads(pkg.read_text(encoding="utf-8"))
    legacy_deps = {"quantum-circuit", "blessed", "blessed-contrib", "ws"}

    deps = set(data.get("dependencies", {}).keys())
    dev_deps = set(data.get("devDependencies", {}).keys())
    all_deps = deps | dev_deps

    found = legacy_deps & all_deps
    if found:
        print(f"FAIL: legacy deps still in package.json: {sorted(found)}")
        return 1

    print("PASS: legacy deps (quantum-circuit, blessed, blessed-contrib, ws) removed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
