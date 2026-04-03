#!/bin/bash
# train.sh — Self-improving agent loop via Claude Code CLI
#
# Legacy OODA loop that directly invokes Claude Code CLI for each step.
# For the evolved version, use: ./cook.sh (which delegates to evolve.ts)
#
# Each iteration:
#   1. Run gaps test
#   2. Pick highest leverage gap
#   3. Implement fix via Claude Code
#   4. Verify dogfood
#   5. Update docs
#   6. Cleanup trash (move stray files to .trash/)
#   7. Commit
#   8. Repeat
#
# Usage: ./train.sh
#
# Output goes to dogfood/logs/ and dogfood/tests/ (git-ignored)

set -e

ITERATION=1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ensure_trash() {
  mkdir -p .trash
}

# Cleanup function: find and trash stray/untracked files that don't belong
cleanup_trash() {
  echo "[6.5] Checking for stray files to trash..."
  ensure_trash

  # Get all untracked files and directories (excluding gitignored)
  while IFS= read -r file; do
    # Skip gitignored files
    if git check-ignore -q "$file" 2>/dev/null; then
      continue
    fi

    # Skip intentional root files
    case "$file" in
      CLAUDE.md|TODO.md|README.md|package.json|tsconfig.json|cook.sh|train.sh| bun.lock|package-lock.json|.env|.env.example)
        continue
        ;;
    esac

    # Skip intentional directories
    case "$file" in
      meow|meowclaw|docs|dogfood|node_modules|packages|scripts|.github)
        continue
        ;;
    esac

    # Skip .trash itself
    [[ "$file" == .trash ]] && continue

    echo "  🚮 Moving to .trash: $file"
    mv "$file" ".trash/$(basename "$file")-$(date +%Y%m%d-%H%M%S)"
  done < <(git status --porcelain | grep "^??" | awk '{print $2}')
}

# Create dogfood output directories
mkdir -p dogfood/logs dogfood/tests

# Ensure we're on cook branch
if ! git show-ref --verify --quiet refs/heads/cook; then
  echo "Creating 'cook' branch..."
  git checkout -b cook
else
  git checkout cook
fi

echo "=============================================="
echo "MEOW GAP CLOSE LOOP (via Claude Code)"
echo "=============================================="
echo ""

# Check API key exists
if [[ -z "$ANTHROPIC_API_KEY" && ! -f ".env" ]]; then
  echo "WARNING: No ANTHROPIC_API_KEY in environment"
fi

while true; do
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  echo ""
  echo "=============================================="
  echo "ITERATION $ITERATION"
  echo "=============================================="
  echo ""

  # Step 1: Run gaps test to see current state
  echo "[1/7] Running gap analysis..."
  GAP_OUTPUT=$(cd meow && bun test tests/gaps.test.ts 2>&1 || true)
  echo "$GAP_OUTPUT" | tail -20
  echo "$GAP_OUTPUT" > "dogfood/tests/gap-analysis-${ITERATION}-${TIMESTAMP}.txt"
  echo ""

  # Step 2: Use Claude Code to pick highest leverage gap
  echo "[2/7] Claude Code analyzing and deciding on highest leverage gap..."
  GAP_ANALYSIS_FILE="dogfood/tests/gap-analysis-${ITERATION}-${TIMESTAMP}.txt"
  claude --dangerously-skip-permissions "Analyze the test output in $GAP_ANALYSIS_FILE. Pick the ONE highest leverage gap to fix. Consider: impact (blocks user?), effort (complex?), dependencies. Reply with just GAP-ID and reason." 2>&1 | tee "dogfood/logs/gap-selection-${ITERATION}-${TIMESTAMP}.txt" | tail -5
  echo ""

  # Step 3: Claude Code implements the fix, writes tests, dogfoods
  echo "[3/7] Claude Code implementing fix..."
  claude --dangerously-skip-permissions "Implement the fix for the gap identified. Read the gap analysis at $GAP_ANALYSIS_FILE for context. Write a test in meow/tests/gap-impl.test.ts, implement the code, run the test, and dogfood with: bun run meow/cli/index.ts --dangerous \"test the feature you just implemented\". Report pass/fail." 2>&1 | tee "dogfood/logs/implementation-${ITERATION}-${TIMESTAMP}.txt" | tail -50
  echo ""

  # Step 4: Verify iteration works (live dogfood test)
  echo "[4/7] Verifying iteration works (live dogfood)..."
  DOGFOOD_RESULT=$(cd meow && bun run cli/index.ts --dangerous "run gap-impl.test.ts and report pass/fail" 2>&1 || true)
  echo "$DOGFOOD_RESULT" | tee "dogfood/tests/dogfood-verification-${ITERATION}-${TIMESTAMP}.txt" | tail -20
  if echo "$DOGFOOD_RESULT" | grep -qi "fail\|error\|✗"; then
    echo "ERROR: Dogfood verification failed!"
    echo "Reverting changes..."
    git checkout -- meow/
    echo "Changes reverted. Will retry next iteration."
    ((ITERATION++))
    sleep 1
    continue
  fi
  echo "Dogfood verification passed."
  echo ""

  # Step 5: Claude Code updates docs
  echo "[5/7] Claude Code updating TODO.md and CLAUDE.md..."
  claude --dangerously-skip-permissions "Edit meow/TODO.md and meow/CLAUDE.md to reflect the changes you just made. Mark completed items, add dogfood notes. Be brief - 2-3 lines per change." 2>&1 | tee "dogfood/logs/doc-update-${ITERATION}-${TIMESTAMP}.txt" | tail -20
  echo ""

  # Step 6: Cleanup trash before commit
  echo "[6/7] Cleaning up stray files..."
  cleanup_trash
  echo ""

  # Step 7: Commit if there are changes
  echo "[7/7] Committing changes to cook branch..."
  if [[ -n "$(git status --short meow/)" ]]; then
    git add meow/
    git commit -m "fix: $(date +%Y-%m-%d) - iteration $ITERATION

Co-Authored-By: Claude <noreply@anthropic.com>"
    echo "Committed to 'cook' branch."
  else
    echo "No changes to commit."
  fi
  echo ""

  echo "Iteration $ITERATION complete!"
  echo "Logs: dogfood/logs/implementation-${ITERATION}-${TIMESTAMP}.txt"
  echo "Tests: dogfood/tests/dogfood-verification-${ITERATION}-${TIMESTAMP}.txt"
  ((ITERATION++))

  # Brief pause
  sleep 1
done
