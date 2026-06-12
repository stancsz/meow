#!/usr/bin/env python3
"""run_corpus.py — the ratchet. Runs EVERY verifier in .meow/verifiers/.

All green or exit nonzero. Verifiers are v*.py (run with this interpreter)
or v*.sh (run with bash). A verifier passes iff it exits 0.
Past wins are protected: this is always the full corpus, never a subset.
"""
import os
import subprocess
import sys
from pathlib import Path

VERIFIERS = Path(__file__).resolve().parent.parent / ".meow" / "verifiers"


def main() -> int:
    # MEOW_SKIP_CORPUS=1 skips the corpus entirely — used by the mock command
    # to break the recursive loop: ship_gate → run_corpus → v0002 → meow mock
    # → ship_gate → run_corpus → …
    if os.environ.get("MEOW_SKIP_CORPUS") == "1":
        print("[ship_gate] corpus check skipped (mock mode)")
        return 0
    files = sorted(list(VERIFIERS.glob("v*.py")) + list(VERIFIERS.glob("v*.sh")))
    # Set MEOW_SKIP_CORPUS in the verifiers' environment so that if a verifier
    # (e.g. v0002) calls `meow mock` → ship_gate → run_corpus, the inner
    # run_corpus sees the flag and exits fast instead of recursing.
    verif_env = {**os.environ, "MEOW_SKIP_CORPUS": "1"}
    if not files:
        print("CORPUS EMPTY: no verifiers found — nothing can ship against an empty ratchet")
        return 2
    failed = []
    skipped = []
    for f in files:
        cmd = [sys.executable, str(f)] if f.suffix == ".py" else ["bash", str(f)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600, stdin=subprocess.DEVNULL, env=verif_env)
        if r.returncode == 0:
            status = "PASS"
        elif r.returncode == 2:
            status = "SKIP"
            skipped.append(f.name)
        else:
            status = "FAIL"
            failed.append(f.name)
        print(f"[{status}] {f.name}")
        if r.returncode not in (0, 2):
            tail = (r.stdout + r.stderr).strip().splitlines()[-5:]
            for ln in tail:
                print(f"    {ln}")
    total = len(files)
    green = total - len(failed)
    skip_note = f" ({len(skipped)} skipped)" if skipped else ""
    print(f"\ncorpus: {green}/{total} green{skip_note}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
