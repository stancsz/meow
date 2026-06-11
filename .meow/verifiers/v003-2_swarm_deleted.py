#!/usr/bin/env python3
"""v003-2: src/swarm/ and quantum files deleted from main.

Claim: src/swarm/ directory is gone and src/agent/quantum_* files are gone.
These are W2 deletions from MIGRATION.md §2.
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve()
    for _ in range(3):
        root = root.parent

    # src/swarm/ should be gone
    swarm = root / "src" / "swarm"
    if swarm.exists():
        print(f"FAIL: src/swarm/ still exists (contains {len(list(swarm.iterdir()))} items)")
        return 1

    # quantum_* files in src/agent/ should be gone
    agent = root / "src" / "agent"
    if agent.exists():
        quantum = list(agent.glob("quantum_*"))
        if quantum:
            print(f"FAIL: quantum files still in src/agent/: {[f.name for f in quantum]}")
            return 1

    print("PASS: src/swarm/ and quantum files deleted from main")
    return 0


if __name__ == "__main__":
    sys.exit(main())
