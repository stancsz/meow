#!/usr/bin/env python3
"""schedule.py — the loop's brainstem. Reads .meow/ state, emits next `role:phase`.

The schedule is data, not vibes (nine-lives.md §4.4, yugong §7).
Exit 0 with "role:phase" on stdout. Exit 3 = HALT (with reason on stdout).
"""
import re
import sys
from pathlib import Path

MEOW = Path(__file__).resolve().parent.parent / ".meow"


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def task_statuses():
    """Tasks are .meow/tasks/<id>.md with a `status: <s>` line.
    Statuses: open | building | awaiting-verdict | done | parked"""
    out = {}
    for f in sorted((MEOW / "tasks").glob("*.md")):
        m = re.search(r"^status:\s*(\S+)", read(f), re.M)
        out[f.stem] = m.group(1) if m else "open"
    return out


def main() -> int:
    if not (MEOW / "PROBLEM.md").exists():
        print("HALT: no .meow/PROBLEM.md — run `meow init` first")
        return 3

    # 0. Unprocessed human answers come before everything.
    if re.search(r"^\s*-\s*\[x\]", read(MEOW / "INBOX.md"), re.M):
        print("strategist:integrate")
        return 0

    tasks = task_statuses()
    verdicts = {f.stem for f in (MEOW / "verdicts").glob("*.md")}

    # 1. Verdict exists but task not closed → strategist reviews / learns.
    for tid, st in tasks.items():
        if tid in verdicts and st not in ("done", "parked"):
            print("strategist:learn")
            return 0

    # 2. A spec'd task with premortem → builder.
    for tid, st in tasks.items():
        if st == "building" or (st == "open" and (MEOW / "premortems" / f"{tid}.md").exists()):
            print("builder:execute")
            return 0

    # 3. Diff awaiting verdict → verifier (fresh context).
    if any(st == "awaiting-verdict" for st in tasks.values()):
        print("verifier:verify")
        return 0

    # 4. Ratchet trigger: 3 consecutive SHIPPED lines at ledger tail.
    tail = [ln for ln in read(MEOW / "ledger.md").splitlines() if ln.strip().startswith("- ")][-3:]
    if len(tail) == 3 and all("SHIPPED" in ln for ln in tail):
        print("strategist:ratchet")
        return 0

    # 5. Nothing ready → strategist frames/selects/premortems the next task.
    print("strategist:frame-select-premortem")
    return 0


if __name__ == "__main__":
    sys.exit(main())
