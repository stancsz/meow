#!/usr/bin/env python3
"""v006-3: current src/ LOC count and delta from baseline.

Claim: Measures current src/ LOC and compares to baseline.json non_core_loc.
This gives a live view of thinning progress.
"""
import subprocess
import sys
import json
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    baseline = root / ".meow" / "baseline.json"

    if not baseline.exists():
        print("FAIL: .meow/baseline.json not found")
        return 1

    data = json.loads(baseline.read_text(encoding="utf-8"))
    baseline_loc = data["non_core_loc"]

    # Count current src/ LOC (TypeScript + JavaScript)
    result = subprocess.run(
        ["bash", "-c", "find src/ -name '*.ts' -o -name '*.js' 2>/dev/null | xargs wc -l 2>/dev/null | tail -1"],
        cwd=str(root),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print("SKIP: could not count src/ LOC (bash/find unavailable)")
        return 2

    line = result.stdout.strip()
    if not line:
        print("SKIP: no src/ files found")
        return 2

    try:
        current_loc = int(line.split()[0])
    except (ValueError, IndexError):
        print(f"FAIL: could not parse LOC from: {line!r}")
        return 1

    delta = baseline_loc - current_loc
    pct = (delta / baseline_loc) * 100 if baseline_loc else 0

    print(f"baseline: {baseline_loc} LOC | current: {current_loc} LOC | delta: {delta} ({pct:.1f}% reduction)")

    if current_loc > baseline_loc:
        print(f"FAIL: src/ grew by {current_loc - baseline_loc} LOC — ratchet reversed")
        return 1

    print(f"PASS: LOC within baseline ({current_loc} <= {baseline_loc})")
    return 0


if __name__ == "__main__":
    sys.exit(main())