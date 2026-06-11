#!/usr/bin/env python3
"""audit_verifiers.py — adequacy linter for the verifier corpus.

Rejects weak suites mechanically:
  * a verifier must contain a failure path (assert / sys.exit / exit 1 / raise)
  * a task's suite must not be rubric-only (heuristic: files named *rubric*
    require at least one classical sibling for the same task id)
  * REGISTRY.md must list every verifier file (no orphan = no silent corpus)
Exit 0 = adequate. Exit 1 = rejected with reasons.
"""
import re
import sys
from pathlib import Path

VDIR = Path(__file__).resolve().parent.parent / ".meow" / "verifiers"
FAIL_MARKERS = re.compile(r"assert |sys\.exit\(|raise |exit 1|exit\(1\)")


def main() -> int:
    errors = []
    files = sorted(list(VDIR.glob("v*.py")) + list(VDIR.glob("v*.sh")))
    if not files:
        print("REJECTED: empty corpus")
        return 1

    registry = ""
    reg_path = VDIR / "REGISTRY.md"
    if reg_path.exists():
        registry = reg_path.read_text(encoding="utf-8")
    else:
        errors.append("missing REGISTRY.md")

    rubric_ids, classical_ids = set(), set()
    for f in files:
        body = f.read_text(encoding="utf-8", errors="ignore")
        if not FAIL_MARKERS.search(body):
            errors.append(f"{f.name}: no failure path — cannot go red, not a verifier")
        if registry and f.name not in registry:
            errors.append(f"{f.name}: not listed in REGISTRY.md")
        tid = f.stem.split("_")[0]
        (rubric_ids if "rubric" in f.name else classical_ids).add(tid)

    for tid in rubric_ids - classical_ids:
        errors.append(f"task {tid}: rubric-only suite — needs a classical backbone")

    if errors:
        print("REJECTED:")
        for e in errors:
            print(f"  ✗ {e}")
        return 1
    print(f"ADEQUATE: {len(files)} verifiers, all with failure paths, all registered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
