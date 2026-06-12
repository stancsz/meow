#!/usr/bin/env python3
"""v008-1: src/agent/ deleted from main.

Claim: src/agent/ directory is gone. W3 of MIGRATION.md: delete the agent substrate
(custom LLM client, edit parsers, embeddings, memory, reasoning).
"""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent.parent
    agent = root / "src" / "agent"
    if agent.exists():
        files = list(agent.glob("*.ts"))
        print(f"FAIL: src/agent/ still exists ({len(files)} .ts files)")
        return 1
    print("PASS: src/agent/ deleted from main")
    return 0


if __name__ == "__main__":
    sys.exit(main())