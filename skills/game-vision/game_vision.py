#!/usr/bin/env python3
"""
Game Vision - Research video games via screen analysis with Token Maxxing.

Uses MiniMax VLM + OCR to understand how a game works with token optimization.
"""

import os
import sys
import base64
import json
import argparse
from pathlib import Path
from typing import List, Tuple

# ─── Import Token Maxxing ──────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent / "token-max"))
from token_max import (
    SemanticCache, compress_context, compress_prompt,
    TokenTracker, count_tokens, count_messages_tokens
)

# ─── Load .env ─────────────────────────────────────────────────────────────────
ENV_PATH = Path(__file__).parent.parent.parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_API_HOST = os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io")


# ─── Token-Optimized Image Analysis ─────────────────────────────────────────────

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def understand_image(image_path: str, prompt: str) -> dict:
    """Call MiniMax understand_image with token optimization."""
    try:
        from mcp.client.stdio import stdio_client, StdioServerParameters
        from mcp import ClientSession

        with open(image_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("utf-8")

        server_params = StdioServerParameters(
            command="uvx",
            args=["minimax-coding-plan-mcp", "-y"],
            env={
                "MINIMAX_API_KEY": MINIMAX_API_KEY,
                "MINIMAX_API_HOST": MINIMAX_API_HOST,
            },
        )

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool("understand_image", {
                    "image_source": f"data:image/png;base64,{img_data}",
                    "prompt": prompt,
                })
                if hasattr(result, 'content'):
                    return result.content[0].text if isinstance(result.content, list) else str(result.content)
                return str(result)
    except Exception as e:
        return f"Error: {e}"


def parse_coordinates(text: str) -> List[Tuple[float, float]]:
    """Parse coordinates from MiniMax response."""
    import re
    coords = []
    pattern = r'[\((]?\s*(\d+\.?\d*)\s*[,\s]+(\d+\.?\d*)\s*[\))]?'
    for m in re.findall(pattern, text):
        try:
            x, y = float(m[0]), float(m[1])
            if 0 <= x <= 1 and 0 <= y <= 1:
                coords.append((x, y))
        except ValueError:
            pass
    return coords


def to_screen_coords(rel_x: float, rel_y: float, w: int = 2560, h: int = 1080) -> Tuple[int, int]:
    return (int(rel_x * w), int(rel_y * h))


# ─── Game Vision with Caching ──────────────────────────────────────────────────

class GameVisionCache:
    """Cache game analysis results to avoid re-analyzing same screenshots."""

    def __init__(self):
        self.cache = SemanticCache(threshold=0.9)
        self.tracker = TokenTracker()

    def get_cached_analysis(self, image_hash: str) -> Optional[str]:
        """Get cached analysis for this image hash."""
        return self.cache.get(image_hash)

    def cache_analysis(self, image_hash: str, analysis: str):
        """Cache analysis result."""
        self.cache.set(image_hash, analysis)

    def get_stats(self) -> dict:
        return self.cache.get_stats()


# ─── Optimized Prompts ─────────────────────────────────────────────────────────

PROMPTS = {
    "ui": compress_prompt("""Extract all visible UI elements. For each:
- Position (0.0-1.0)
- Type: button, bar, icon, text, slot, menu
- Current value/status
- Function/purpose

Focus: ability bars, health/mana, inventory, menus, quest trackers.
Return as structured list."""),

    "state": compress_prompt("""Describe current game state:
- Current objective/goal
- Resources visible (health, mana, ammo, currency)
- Enemies/threats present
- Available player actions

Be specific about positions of key elements."""),

    "controls": compress_prompt("""Analyze visible controls/keybindings:
- What buttons/keybindings are shown?
- What does each control do?
- What is the current keybind for each action?

Look at: ability bars, UI menus, tutorial prompts, control hints."""),

    "mechanics": compress_prompt("""What game mechanics are visible?
- What systems are active (combat, crafting, dialogue)?
- How do UI elements relate to each other?
- What can the player learn/explore here?

Focus on: menus, ability bars, inventory, quest trackers, tutorials."""),

    "strategic": compress_prompt("""Analyze this game state for strategic decision making:
1. What threats/opportunities are visible?
2. What is the optimal next action?
3. What resources would be needed?
4. What could go wrong?

Think like an experienced player of this game."""),
}


async def analyze_game(
    image_path: str,
    mode: str = "state",
    custom_prompt: str = None,
    use_cache: bool = True,
    cache: GameVisionCache = None
) -> dict:
    """Analyze screenshot with token optimization."""
    # Create hash of image for cache key
    import hashlib
    with open(image_path, "rb") as f:
        image_hash = hashlib.md5(f.read()).hexdigest()[:16]

    # Check cache if enabled
    if use_cache and cache:
        cached = cache.get_cached_analysis(image_hash)
        if cached:
            # Return cached with cache hit flag
            return {"response": cached, "cached": True, "mode": mode}

    # Get prompt (compressed)
    prompt = custom_prompt or PROMPTS.get(mode, PROMPTS["state"])

    # Track input tokens
    input_tokens = count_tokens(prompt)

    print(f"Analyzing: {image_path}")
    print(f"Mode: {mode} | Prompt tokens: {input_tokens}")

    try:
        response = await understand_image(image_path, prompt)

        # Track output tokens
        output_tokens = count_tokens(response)

        if cache:
            cache.cache_analysis(image_hash, response)
            cache.tracker.after(input_tokens, output_tokens)

        coords = parse_coordinates(response)

        print(f"\n=== Analysis (tokens: {input_tokens}+{output_tokens}={input_tokens+output_tokens}) ===")
        print(response[:500] + "..." if len(response) > 500 else response)

        if coords:
            print(f"\nCoordinates ({len(coords)} found):")
            for i, (x, y) in enumerate(coords[:10]):
                abs_x, abs_y = to_screen_coords(x, y)
                print(f"  {i+1}. ({x:.3f}, {y:.3f}) → screen ({abs_x}, {abs_y})")

        return {
            "response": response,
            "coordinates": coords,
            "mode": mode,
            "cached": False,
            "tokens_used": input_tokens + output_tokens
        }

    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Game Vision - Token-optimized game analysis")
    parser.add_argument("image", help="Path to screenshot")
    parser.add_argument("prompt", nargs="*", help="Custom prompt (optional)")
    parser.add_argument("--mode", "-m", choices=list(PROMPTS.keys()), default="state")
    parser.add_argument("--no-cache", "-nc", action="store_true", help="Disable cache")
    parser.add_argument("--stats", "-s", action="store_true", help="Show cache stats")

    args = parser.parse_args()

    import asyncio

    cache = GameVisionCache() if not args.no_cache else None
    custom = " ".join(args.prompt) if args.prompt else None

    result = asyncio.run(analyze_game(args.image, args.mode, custom, use_cache=cache is not None, cache=cache))

    if args.stats and cache:
        print("\n=== Cache Stats ===")
        print(json.dumps(cache.get_stats(), indent=2))


if __name__ == "__main__":
    main()