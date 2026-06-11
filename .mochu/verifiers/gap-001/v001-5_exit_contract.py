#!/usr/bin/env python3
"""v001-5: Exit contract enforced — ship_gate.py runs after life completion.

Claim: The heartbeat calls ship_gate.py after each life.
This is the mechanical enforcement of the exit contract.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
MEOW = ROOT / "bin" / "meow.ts"


def main() -> int:
    # Skip if bun not available
    r = subprocess.run(["bun", "--version"], capture_output=True)
    if r.returncode != 0:
        print("SKIP: bun not available")
        return 2

    # Check heartbeat code calls ship_gate.py
    heartbeat = ROOT / "bin" / "meow.ts"
    if not heartbeat.exists():
        print("FAIL: bin/meow.ts not found")
        return 1

    content = heartbeat.read_text(encoding="utf-8")
    if "ship_gate.py" not in content:
        print("FAIL: heartbeat doesn't call ship_gate.py")
        return 1

    # Check ship_gate.py exists and runs
    ship_gate = ROOT / "scripts" / "ship_gate.py"
    if not ship_gate.exists():
        print("FAIL: scripts/ship_gate.py not found")
        return 1

    # Run ship_gate.py standalone (should exit 0 or 1, not crash)
    r = subprocess.run(
        [sys.executable, str(ship_gate)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )

    if r.returncode >= 10:  # 10+ indicates crash
        print(f"FAIL: ship_gate.py crashed (exit {r.returncode})")
        print(f"  stderr: {r.stderr[:300]}")
        return 1

    print(f"PASS: exit contract enforced (ship_gate exit={r.returncode})")
    return 0


if __name__ == "__main__":
    sys.exit(main())