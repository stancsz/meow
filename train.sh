#!/bin/bash
# train.sh — Direct Gap-Closing Loop
#
# Directly implements gaps by modifying meow source code.
# Unlike cook.sh (which delegates to evolve.ts for the OODA loop),
# this script provides direct, iterative gap closing.
#
# Each iteration:
#   1. Run gaps.test.ts — find what's missing
#   2. Claude Code implements the gap in meow/src/
#   3. Run gap-impl.test.ts — verify the implementation
#   4. Dogfood with meow CLI
#   5. Update docs (CLAUDE.md, TODO.md)
#   6. Commit meow/ changes
#
# Usage: ./train.sh
#        ./train.sh --once    # Single iteration
#        ./train.sh --status  # Show gap status

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ITERATION=1
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

ensure_trash() {
  mkdir -p .trash
}

cleanup_trash() {
  ensure_trash
  while IFS= read -r file; do
    if git check-ignore -q "$file" 2>/dev/null; then
      continue
    fi
    case "$file" in
      CLAUDE.md|TODO.md|README.md|package.json|tsconfig.json|cook.sh|train.sh|bun.lock|package-lock.json|.env|.env.example)
        continue
        ;;
    esac
    case "$file" in
      meow|meowclaw|docs|dogfood|node_modules|packages|scripts|.github|.claude|.meow)
        continue
        ;;
    esac
    [[ "$file" == .trash ]] && continue
    echo "  🚮 Trashing: $file"
    mv "$file" ".trash/$(basename "$file")-${TIMESTAMP}"
  done < <(git status --porcelain | grep "^??" | awk '{print $2}')
}

# Ensure we're on evolve branch
if ! git show-ref --verify --quiet refs/heads/evolve; then
  echo "Creating 'evolve' branch..."
  git checkout -b evolve
else
  git checkout evolve
fi

echo "=============================================="
echo "MEOW GAP CLOSE LOOP"
echo "=============================================="

# Handle flags
case "${1:-}" in
  --status)
    echo "Running gap status check..."
    cd meow && bun test tests/gaps.test.ts 2>&1 | tail -30
    exit 0
    ;;
  --once)
    ONCE=true
    ;;
  *)
    ONCE=false
    ;;
esac

while true; do
  echo ""
  echo "=============================================="
  echo "ITERATION $ITERATION ($TIMESTAMP)"
  echo "=============================================="
  echo ""

  # Step 1: Run gaps.test.ts to find what's missing
  echo "[1/6] Running gap analysis..."
  GAP_OUTPUT=$(cd meow && bun test tests/gaps.test.ts 2>&1 || true)
  echo "$GAP_OUTPUT" | tail -30
  mkdir -p dogfood/tests
  echo "$GAP_OUTPUT" > "dogfood/tests/gap-analysis-${ITERATION}-${TIMESTAMP}.txt"
  echo ""

  # Extract gap IDs that are failing
  FAILING_GAPS=$(echo "$GAP_OUTPUT" | grep -oE 'GAP-[A-Z]+-[0-9]+' | sort -u)
  if [[ -z "$FAILING_GAPS" ]]; then
    echo "No failing gaps found. All gaps may be closed!"
    if [[ "$ONCE" == "true" ]]; then
      exit 0
    fi
    echo "Waiting 60s before re-checking..."
    sleep 60
    continue
  fi

  # Pick the first failing gap
  GAP_ID=$(echo "$FAILING_GAPS" | head -1)
  echo "Selected gap: $GAP_ID"
  echo ""

  # Step 2: Claude Code implements the gap in meow/src/ (NOT just gap-impl.test.ts)
  echo "[2/6] Implementing $GAP_ID..."
  IMPLEMENTATION_PROMPT="You are closing gap $GAP_ID in the meow CLI project.

The gap test output shows $GAP_ID is failing.
Read meow/tests/gaps.test.ts to understand what $GAP_ID requires.
Read meow/tests/gap-impl.test.ts to understand the test format.

IMPORTANT: Implement the ACTUAL FEATURE, not just a test.
- If GAP requires a new skill: create meow/src/skills/<name>.ts
- If GAP requires a new sidecar: create meow/src/sidecars/<name>.ts
- If GAP requires modifying core: edit meow/src/core/<name>.ts
- Write tests in meow/tests/gap-impl.test.ts

Steps:
1. Read meow/tests/gaps.test.ts to find $GAP_ID description
2. Read relevant source files in meow/src/
3. Implement the feature in the appropriate meow/src/ directory
4. Add tests to meow/tests/gap-impl.test.ts
5. Run: cd meow && bun test tests/gap-impl.test.ts
6. Dogfood: cd meow && bun run cli/index.ts --dangerous 'help'
7. Report what you implemented and the file paths"

  claude --dangerously-skip-permissions "$IMPLEMENTATION_PROMPT" 2>&1 | tee "dogfood/logs/implementation-${GAP_ID}-${TIMESTAMP}.txt" | tail -60
  echo ""

  # Step 3: Verify the implementation
  echo "[3/6] Verifying $GAP_ID implementation..."
  cd meow && bun test tests/gap-impl.test.ts 2>&1 | tee "dogfood/tests/verification-${GAP_ID}-${TIMESTAMP}.txt" | tail -20
  cd ..
  echo ""

  # Step 4: Dogfood with meow CLI
  echo "[4/6] Dogfooding with meow CLI..."
  DOGFOOD_RESULT=$(cd meow && bun run cli/index.ts --dangerous "help" 2>&1 || true)
  echo "$DOGFOOD_RESULT" | tail -20
  echo "$DOGFOOD_RESULT" > "dogfood/tests/dogfood-${GAP_ID}-${TIMESTAMP}.txt"
  if echo "$DOGFOOD_RESULT" | grep -qi "error\|could not"; then
    echo "WARNING: Dogfood may have issues, but continuing..."
  fi
  echo ""

  # Step 5: Update docs
  echo "[5/6] Updating docs..."
  DOC_PROMPT="Update meow/TODO.md and meow/CLAUDE.md to reflect the $GAP_ID implementation:
- Mark $GAP_ID as implemented in TODO.md
- Add a brief dogfood note in CLAUDE.md under RECENT CHANGES
Be concise - 2-3 lines."
  claude --dangerously-skip-permissions "$DOC_PROMPT" 2>&1 | tee "dogfood/logs/docs-${GAP_ID}-${TIMESTAMP}.txt" | tail -10
  echo ""

  # Step 6: Cleanup and commit
  echo "[6/6] Cleanup and commit..."
  cleanup_trash

  if [[ -n "$(git status --short meow/)" ]]; then
    git add meow/
    git commit -m "fix($GAP_ID): implement $GAP_ID

Iteration: $ITERATION
Dogfood: verified via meow CLI

Co-Authored-By: Claude <noreply@anthropic.com>"
    echo "✅ Committed $GAP_ID to 'evolve' branch."
  else
    echo "No changes to commit in meow/."
  fi
  echo ""

  echo "Iteration $ITERATION complete for $GAP_ID!"
  echo "Logs: dogfood/logs/implementation-${GAP_ID}-${TIMESTAMP}.txt"
  echo ""

  ((ITERATION++))

  if [[ "$ONCE" == "true" ]]; then
    exit 0
  fi

  # Brief pause between iterations
  sleep 2
done
