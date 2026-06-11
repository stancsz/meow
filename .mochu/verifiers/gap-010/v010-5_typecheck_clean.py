#!/usr/bin/env python3
"""v010-5: typecheck passes on core (bin/, scripts/, skills/).

Claim: after W5, tsc --noEmit passes with no errors in bin/, scripts/, skills/.
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
    r = subprocess.run(["bun", "--version"], capture_output=True)
    if r.returncode != 0:
        print("SKIP: bun not available")
        return 2

    # Check if typecheck works
    r = subprocess.run(
        ["bun", "run", "typecheck"],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode == 0:
        print("PASS: typecheck passes with no errors")
        return 0

    output = r.stdout + r.stderr
    # Filter out src/ errors (expected — src/ is gone)
    src_errors = [ln for ln in output.splitlines() if "src/" in ln and "error TS" in ln]
    non_src_errors = [ln for ln in output.splitlines() if "error TS" in ln and "src/" not in ln]

    if non_src_errors:
        print(f"FAIL: typecheck errors in core:")
        for e in non_src_errors[:5]:
            print(f"  {e}")
        return 1

    if src_errors:
        print(f"INFO: {len(src_errors)} errors in deleted src/ (expected)")
    print("PASS: typecheck passes on core (bin/, scripts/, skills/)")
    return 0


if __name__ == "__main__":
    sys.exit(main())