#!/usr/bin/env python3
"""budget.py — survive-first limits, beyond rationalization (nine-lives.md §4.4).

Reads .meow/budget.md (key: value lines). Counts today's ledger entries.
Exit 0 = within budget. Exit 1 = exceeded (reason on stdout; caller halts and
writes INBOX). The heartbeat calls this before every birth.
"""
import datetime
import os
import re
import sys
from pathlib import Path

MEOW = Path(__file__).resolve().parent.parent / ".meow"
DEFAULTS = {"max_lives_per_day": 50, "max_seconds_per_life": 3600}


def limits():
    cfg = dict(DEFAULTS)
    try:
        for ln in (MEOW / "budget.md").read_text(encoding="utf-8").splitlines():
            m = re.match(r"^(\w+):\s*(\d+)", ln.strip())
            if m and m.group(1) in cfg:
                cfg[m.group(1)] = int(m.group(2))
    except FileNotFoundError:
        pass
    return cfg


def lives_today() -> int:
    today = datetime.date.today().isoformat()
    try:
        ledger = (MEOW / "ledger.md").read_text(encoding="utf-8")
    except FileNotFoundError:
        return 0
    return sum(1 for ln in ledger.splitlines() if ln.strip().startswith("- ") and today in ln)


def main() -> int:
    # MEOW_SKIP_BUDGET=1 bypasses budget checks (for verifiers and mocks).
    if os.environ.get("MEOW_SKIP_BUDGET") == "1":
        print("OK: budget check skipped (verifier/mock mode)")
        return 0
    cfg = limits()
    used = lives_today()
    if used >= cfg["max_lives_per_day"]:
        print(f"BUDGET EXCEEDED: {used}/{cfg['max_lives_per_day']} lives today")
        return 1
    print(f"OK: {used}/{cfg['max_lives_per_day']} lives today; "
          f"cap {cfg['max_seconds_per_life']}s/life")
    return 0


if __name__ == "__main__":
    sys.exit(main())
