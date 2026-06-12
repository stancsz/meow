#!/usr/bin/env python3
"""v003-1: legacy-swarm branch exists and is pushed.

Claim: git branch legacy-swarm exists (created by W2 of MIGRATION.md).
"""
import subprocess
import sys


def main() -> int:
    r = subprocess.run(
        ["git", "branch", "--list", "legacy-swarm"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print("FAIL: git branch check failed")
        return 1
    output = r.stdout
    if "legacy-swarm" not in output:
        print("FAIL: legacy-swarm branch does not exist")
        return 1
    # Check it has commits (not empty branch)
    r2 = subprocess.run(
        ["git", "rev-parse", "--verify", "legacy-swarm"],
        capture_output=True,
        text=True,
    )
    if r2.returncode != 0:
        print("FAIL: legacy-swarm branch has no commits")
        return 1
    print("PASS: legacy-swarm branch exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())