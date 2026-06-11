#!/usr/bin/env python3
"""ship_gate.py — the mechanical ship gate. No model output overrides a FAIL.

Checks, in order:
  1. Full verifier corpus green (run_corpus.py).
  2. Verifier tamper: working tree must not modify .meow/verifiers/ unless
     MEOW_VERIFIER_TASK=1 (a strategist-authored verifier task). Additions are
     always allowed (append-mostly).
  3. Secrets scan over changed files.
  4. Stub-write check: changed text files must not be title-only stubs
     (the FEEDBACK.md lesson as code, not prayer).
Exit 0 = SHIP. Exit nonzero = HOLD with named evidence.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRET_PATTERNS = [
    r"sk-[A-Za-z0-9_-]{20,}",
    r"AKIA[0-9A-Z]{16}",
    r"ghp_[A-Za-z0-9]{36}",
    r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]",
]
TEXT_EXT = {".md", ".txt", ".py", ".ts", ".js", ".sh", ".json", ".yaml", ".yml"}


def git(*args) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, stdin=subprocess.DEVNULL).stdout


def changed_files():
    out = git("status", "--porcelain")
    files = []
    for ln in out.splitlines():
        st, path = ln[:2], ln[3:].strip().strip('"')
        files.append((st.strip(), path))
    return files


def main() -> int:
    errors = []

    # 1. Corpus (skip when invoked from `meow mock` to avoid recursive loop:
    # mock → ship_gate → run_corpus → v0002 → meow mock → …)
    if os.environ.get("MEOW_SKIP_CORPUS") == "1":
        print("[ship_gate] corpus check skipped (mock mode)")
    else:
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / "run_corpus.py")],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL)
        print(r.stdout, end="")
        if r.returncode != 0:
            errors.append("corpus not green")

    changes = changed_files()

    # 2. Verifier tamper (modifications/deletions; additions are fine)
    if os.environ.get("MEOW_VERIFIER_TASK") != "1":
        for st, path in changes:
            if ".meow/verifiers/" in path.replace("\\", "/") and st not in ("??", "A"):
                errors.append(f"verifier modified outside a verifier task: {path}")

    # 3. Secrets
    for st, path in changes:
        p = ROOT / path
        if p.suffix in TEXT_EXT and p.is_file():
            try:
                body = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for pat in SECRET_PATTERNS:
                if re.search(pat, body):
                    errors.append(f"possible secret in {path} (pattern {pat[:24]}…)")
                    break

    # 4. Stub writes
    for st, path in changes:
        p = ROOT / path
        if p.suffix == ".md" and p.is_file():
            lines = [ln for ln in p.read_text(encoding="utf-8",
                     errors="ignore").splitlines() if ln.strip()]
            if 0 < len(lines) < 3:
                errors.append(f"stub write: {path} has {len(lines)} non-empty line(s)")

    if errors:
        print("\nHOLD:")
        for e in errors:
            print(f"  FAIL: {e}")
        return 1
    print("\nSHIP: all gates green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
