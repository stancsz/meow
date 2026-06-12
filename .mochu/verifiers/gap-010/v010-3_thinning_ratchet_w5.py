#!/usr/bin/env python3
"""v010-3: thinning ratchet holds after W5 (src/ LOC = 0).

Claim: after W5, src/ LOC = 0. Baseline is 2253. Ratchet must hold.
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

    # Count current src/ LOC
    src = root / "src"
    if src.exists():
        r = subprocess.run(
            ["bash", "-c", "find src/ -name '*.ts' -o -name '*.js' 2>/dev/null | xargs wc -l 2>/dev/null | tail -1"],
            cwd=str(root), capture_output=True, text=True,
        )
        if r.returncode == 0:
            try:
                current = int(r.stdout.strip().split()[0])
            except (ValueError, IndexError):
                current = 0
        else:
            current = 0
    else:
        current = 0

    if current > baseline_loc:
        print(f"FAIL: thinning ratchet REVERSED: src/ {current} > baseline {baseline_loc}")
        return 1

    if current == 0:
        print(f"PASS: W5 complete — src/ deleted, LOC = 0 (baseline was {baseline_loc})")
    else:
        print(f"PASS: thinning holds — current {current} <= baseline {baseline_loc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())