#!/usr/bin/env python3
"""select_gap.py — mechanical gap ranking (nine-lives.md §4.5 SELECT).

gaps.md entry format (one per line):
  - [rank] title — cites: <PROBLEM.md line it serves> — effort: S|M|L

Rules enforced here, not in prose:
  * an entry without `cites:` is INVALID — work must trace to the outcome
  * ordinal rank, never invented numbers (rank is position; ties broken by effort)
  * needs ≥5 candidates or it tells the strategist to go scout (candidate quorum)
Prints the ranked list and the selected top gap.
"""
import re
import sys
from pathlib import Path

GAPS = Path(__file__).resolve().parent.parent / ".meow" / "gaps.md"
EFFORT_ORDER = {"S": 0, "M": 1, "L": 2}


def main() -> int:
    try:
        body = GAPS.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("INVALID: no gaps.md")
        return 1

    entries, invalid = [], []
    for ln in body.splitlines():
        m = re.match(r"^\s*-\s*\[(\d+)\]\s*(.+)$", ln)
        if not m:
            continue
        rank, rest = int(m.group(1)), m.group(2)
        if "cites:" not in rest:
            invalid.append(rest.strip())
            continue
        em = re.search(r"effort:\s*([SML])", rest)
        effort = EFFORT_ORDER.get(em.group(1) if em else "M", 1)
        entries.append((rank, effort, rest.strip()))

    for bad in invalid:
        print(f"INVALID (no cites:): {bad}")
    if len(entries) < 5:
        print(f"QUORUM NOT MET: {len(entries)} candidates (<5) — go scout before selecting")
        return 2

    entries.sort(key=lambda t: (t[0], t[1]))
    print("ranked:")
    for rank, _, rest in entries:
        print(f"  [{rank}] {rest}")
    print(f"\nSELECTED: {entries[0][2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
