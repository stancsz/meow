#!/usr/bin/env python3
"""v008-4: thinning ratchet holds after W3.

Claim: current src/ LOC < baseline.json non_core_loc (15,928).
W3 should significantly reduce LOC — ratchet must hold.
"""
import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
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
        print(f"FAIL: could not parse LOC from: {r.stdout!r}")
        return 1

    if current > baseline_loc:
        print(f"FAIL: thinning ratchet REVERSED: src/ {current} LOC > baseline {baseline_loc}")
        return 1

    delta = baseline_loc - current
    pct = (delta / baseline_loc) * 100 if baseline_loc else 0
    print(f"PASS: thinning holds — current {current} <= baseline {baseline_loc} (delta={delta}, {pct:.1f}% removed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())