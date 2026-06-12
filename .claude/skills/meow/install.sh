#!/bin/bash
# Install meow skill globally — run from repo root after clone
set -e

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.claude/skills/meow"

mkdir -p "$(dirname "$TARGET")"
rm -rf "$TARGET"
cp -r "$SKILL_DIR" "$TARGET"

echo "[install] meow skill → $TARGET"
echo "[install] done — try: node ~/.claude/skills/meow/driver.mjs status"
