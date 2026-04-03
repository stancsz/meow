#!/bin/bash
# cook.sh - Use Claude Code to close gaps between Meow and Claude Code
#
# Each iteration:
#   1. Check current gap using tests
#   2. Use CLAUDE CODE (not meow) to pick highest leverage gap
#   3. Claude Code writes test + implements + dogfoods
#   4. Verify iteration works (live dogfood test)
#   5. Claude Code updates TODO.md and CLAUDE.md
#   6. Commit to cook branch (no push)
#   7. Repeat
#
# Usage: ./cook.sh

set -e

ITERATION=1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

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
  echo ""
  echo "=============================================="
  echo "ITERATION $ITERATION"
  echo "=============================================="
  echo ""

  # Step 1: Run gaps test to see current state
  echo "[1/7] Running gap analysis..."
  GAP_OUTPUT=$(cd meow && bun test tests/gaps.test.ts 2>&1 || true)
  echo "$GAP_OUTPUT" | tail -20
  echo ""

  # Step 2: Use Claude Code to pick highest leverage gap
  echo "[2/7] Claude Code analyzing and deciding on highest leverage gap..."
  claude --dangerously-skip-permissions "Analyze the test output above. Pick the ONE highest leverage gap to fix. Consider: impact (blocks user?), effort (complex?), dependencies. Reply with just GAP-ID and reason." 2>&1 | tail -5
  echo ""

  # Step 3: Claude Code implements the fix, writes tests, dogfoods
  echo "[3/7] Claude Code implementing fix..."
  claude --dangerously-skip-permissions "Implement the fix for the gap identified. Write a test in meow/tests/gap-impl.test.ts, implement the code, run the test, and dogfood with: bun run meow/cli/index.ts --dangerous \"test the feature you just implemented\". Report pass/fail." 2>&1 | tail -50
  echo ""

  # Step 4: Verify iteration works (live dogfood test)
  echo "[4/7] Verifying iteration works (live dogfood)..."
  DOGFOOD_RESULT=$(cd meow && bun run cli/index.ts --dangerous "run gap-impl.test.ts and report pass/fail" 2>&1 || true)
  echo "$DOGFOOD_RESULT" | tail -20
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
  claude --dangerously-skip-permissions "Edit meow/TODO.md and meow/CLAUDE.md to reflect the changes you just made. Mark completed items, add dogfood notes. Be brief - 2-3 lines per change." 2>&1 | tail -20
  echo ""

  # Step 6: Commit if there are changes
  echo "[6/7] Committing changes to cook branch..."
  if [[ -n "$(git status --short meow/)" ]]; then
    git add meow/
    git commit -m "fix: $(date +%Y-%m-%d) - iteration $ITERATION

Co-Authored-By: Claude <noreply@anthropic.com>"
    echo "Committed to 'cook' branch."
  else
    echo "No changes to commit."
  fi
  echo ""

  echo "[7/7] Iteration $ITERATION complete!"
  ((ITERATION++))

  # Brief pause
  sleep 1
done