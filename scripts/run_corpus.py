#!/usr/bin/env python3
"""run_corpus.py — the ratchet. Runs EVERY verifier in .meow/verifiers/.

All green or exit nonzero. Verifiers are v*.py (run with this interpreter)
or v*.sh (run with bash). A verifier passes iff it exits 0.
Past wins are protected: this is always the full corpus, never a subset.
"""
import subprocess
import sys
from pathlib import Path

VERIFIERS = Path(__file__).resolve().parent.parent / ".meow" / "verifiers"


def main() -> int:
    files = sorted(list(VERIFIERS.glob("v*.py")) + list(VERIFIERS.glob("v*.sh")))
    if not files:
        print("CORPUS EMPTY: no verifiers found — nothing can ship against an empty ratchet")
        return 2
    failed = []
    for f in files:
        cmd = [sys.executable, str(f)] if f.suffix == ".py" else ["bash", str(f)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        status = "PASS" if r.returncode == 0 else "FAIL"
        print(f"[{status}] {f.name}")
        if r.returncode != 0:
            failed.append(f.name)
            tail = (r.stdout + r.stderr).strip().splitlines()[-5:]
            for ln in tail:
                print(f"    {ln}")
    print(f"\ncorpus: {len(files) - len(failed)}/{len(files)} green")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
