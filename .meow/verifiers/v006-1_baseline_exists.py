#!/usr/bin/env python3
"""v006-1: baseline.json exists and has valid non_core_loc.

Claim: .meow/baseline.json exists with a positive integer non_core_loc field.
This is the foundation of the thinning ratchet (MIGRATION.md §3).
"""
import json
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    baseline = root / ".meow" / "baseline.json"

    if not baseline.exists():
        print("FAIL: .meow/baseline.json not found")
        return 1

    try:
        data = json.loads(baseline.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"FAIL: baseline.json is not valid JSON: {e}")
        return 1

    if "non_core_loc" not in data:
        print("FAIL: baseline.json missing 'non_core_loc' field")
        return 1

    loc = data["non_core_loc"]
    if not isinstance(loc, int) or loc <= 0:
        print(f"FAIL: non_core_loc is {loc!r}, expected positive integer")
        return 1

    if "recorded" not in data:
        print("FAIL: baseline.json missing 'recorded' timestamp")
        return 1

    print(f"PASS: baseline.json valid (non_core_loc={loc}, recorded={data['recorded']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())