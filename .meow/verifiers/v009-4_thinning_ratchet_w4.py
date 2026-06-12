#!/usr/bin/env python3
"""v009-4: thinning ratchet holds after W4.

Claim: current src/ LOC < baseline (4747).
W4 should reduce LOC further.
"""
import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    baseline = root / ".meow" / "baseline.json"
    if not baseline.exists():
        print("SKIP: baseline.json not found")
        return 2
    data = json.loads(baseline.read_text(encoding="utf-8"))
    baseline_loc = data.get("non_core_loc", 0)
    r = subprocess.run(
        ["bash", "-c", "find src/ -name '*.ts' -o -name '*.js' 2>/dev/null | xargs wc -l 2>/dev/null | tail -1"],
        cwd=str(root), capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("SKIP: could not count src/ LOC")
        return 2
    try:
        current = int(r.stdout.strip().split()[0])
    except (ValueError, IndexError):
        print(f"FAIL: could not parse LOC")
        return 1
    if current > baseline_loc:
        print(f"FAIL: thinning ratchet REVERSED: src/ {current} > baseline {baseline_loc}")
        return 1
    print(f"PASS: thinning holds — current {current} <= baseline {baseline_loc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())