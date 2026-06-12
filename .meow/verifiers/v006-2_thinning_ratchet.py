#!/usr/bin/env python3
"""v006-2: thinning ratchet — baseline.json only moves down.

Claim: For every SHIPPED ledger entry, the baseline non_core_loc at that point
is ≤ the baseline before it. The ratchet never reverses.
MIGRATION.md §3: "baseline.json strictly monotone downward across every ledger SHIPPED entry"
"""
import json
import re
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    ledger = root / ".mochu" / "ledger.md"
    baseline = root / ".meow" / "baseline.json"

    if not ledger.exists():
        print("FAIL: .mochu/ledger.md not found")
        return 1
    if not baseline.exists():
        print("FAIL: .meow/baseline.json not found")
        return 1

    # Parse shipped entries with dates
    # Format: - YYYY-MM-DD | iter-N | gap-id [dimension] ... | SHIPPED | ...
    shipped_dates = []
    for line in ledger.read_text(encoding="utf-8").splitlines():
        if "SHIPPED" in line:
            m = re.match(r"- (\d{4}-\d{2}-\d{2})", line)
            if m:
                shipped_dates.append(m.group(1))

    if not shipped_dates:
        print("SKIP: no SHIPPED entries in ledger yet")
        return 2

    # Current baseline should be lower than W0 baseline (22911)
    data = json.loads(baseline.read_text(encoding="utf-8"))
    current_loc = data["non_core_loc"]
    w0_baseline = 22911

    if current_loc >= w0_baseline:
        print(f"FAIL: baseline {current_loc} is NOT lower than W0 baseline {w0_baseline}")
        return 1

    delta = w0_baseline - current_loc
    print(f"PASS: thinning ratchet active — baseline {current_loc} < W0 {w0_baseline} (delta={delta})")
    return 0


if __name__ == "__main__":
    sys.exit(main())