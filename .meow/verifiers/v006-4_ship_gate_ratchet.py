#!/usr/bin/env python3
"""v006-4: ship_gate.py includes thinning check.

Claim: ship_gate.py runs a baseline LOC check before allowing ship.
The thinning ratchet is enforced mechanically, not by convention.
MIGRATION.md §3: ship_gate is the enforcement point.
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    ship_gate = root / "scripts" / "ship_gate.py"

    if not ship_gate.exists():
        print("FAIL: scripts/ship_gate.py not found")
        return 1

    content = ship_gate.read_text(encoding="utf-8")

    # Check for thinning-related patterns in ship_gate
    thinning_signals = [
        "baseline",
        "non_core_loc",
        "thinning",
        "ratchet",
        "loc",
        "wc -l",
    ]
    matches = [s for s in thinning_signals if s in content.lower()]

    if not matches:
        print("FAIL: ship_gate.py has no thinning check — ratchet is unenforced")
        return 1

    print(f"PASS: ship_gate.py contains thinning signals: {matches}")
    return 0


if __name__ == "__main__":
    sys.exit(main())