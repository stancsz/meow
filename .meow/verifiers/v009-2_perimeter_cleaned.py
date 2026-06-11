#!/usr/bin/env python3
"""v009-2: perimeter artifacts cleaned — .husky/, dist-runtime/, scratch/, legacy skills.

Claim: W4 of MIGRATION.md: delete .husky/ (gates replace hooks), dist-runtime/, scratch/,
legacy skills (mano-p, game-vision, play-game, token-max).
"""
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    artifacts = [
        ".husky",
        "dist-runtime",
        "scratch",
    ]
    found = []
    for a in artifacts:
        p = root / a
        if p.exists():
            found.append(a)
    if found:
        print(f"FAIL: {', '.join(found)} still exist(s)")
        return 1

    # Check legacy skills not referenced by current roles
    skills_dir = root / "skills"
    legacy = ["mano-p", "game-vision", "play-game", "token-max"]
    if skills_dir.exists():
        for ls in legacy:
            p = skills_dir / ls
            if p.exists():
                # Check if any current role references it
                role_dir = skills_dir / "meow" / "roles"
                if role_dir.exists():
                    for role in role_dir.glob("*.md"):
                        if ls in role.read_text(encoding="utf-8"):
                            print(f"FAIL: legacy skill {ls} referenced in {role.name}")
                            found.append(ls)
    if found:
        return 1

    print("PASS: perimeter artifacts cleaned (.husky, dist-runtime, scratch)")
    return 0


if __name__ == "__main__":
    sys.exit(main())