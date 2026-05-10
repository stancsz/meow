#!/usr/bin/env python3
"""
Game Vision - Research video games via screen analysis.

Uses MiniMax VLM + OCR to understand how a game works:
- Learn UI elements and their meanings
- Understand game state and objectives
- Analyze controls and keybindings
- Research mechanics from screenshots

For execution/automation, use computer_tool.py instead.
"""

import os
import sys
import base64
import json
import argparse
from pathlib import Path

try:
    from mcp.client.stdio import stdio_client, StdioServerParameters
    from mcp import ClientSession
except ImportError:
    print("Error: mcp not found. Install: pip install mcp")
    sys.exit(1)


# Load .env if exists
ENV_PATH = Path(__file__).parent.parent.parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_API_HOST = os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io")


def encode_image(image_path: str) -> str:
    """Load image and encode to base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def understand_image(image_path: str, prompt: str) -> dict:
    """Call MiniMax understand_image tool with screenshot."""
    server_params = StdioServerParameters(
        command="uvx",
        args=["minimax-coding-plan-mcp", "-y"],
        env={
            "MINIMAX_API_KEY": MINIMAX_API_KEY,
            "MINIMAX_API_HOST": MINIMAX_API_HOST,
        },
    )

    img_data = encode_image(image_path)

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("understand_image", {
                "image_source": f"data:image/png;base64,{img_data}",
                "prompt": prompt,
            })
            return result


def parse_coordinates(text: str) -> list[tuple[float, float]]:
    """Parse coordinates from MiniMax response. Looks for (0.5, 0.85) patterns."""
    import re
    coords = []
    pattern = r'[\((]?\s*(\d+\.?\d*)\s*[,\s]+(\d+\.?\d*)\s*[\))]?'
    matches = re.findall(pattern, text)
    for m in matches:
        try:
            x, y = float(m[0]), float(m[1])
            if 0 <= x <= 1 and 0 <= y <= 1:
                coords.append((x, y))
        except ValueError:
            pass
    return coords


def screen_coords(rel_x: float, rel_y: float, screen_w: int = 2560, screen_h: int = 1080) -> tuple[int, int]:
    """Convert relative (0.0-1.0) to absolute screen coordinates."""
    return (int(rel_x * screen_w), int(rel_y * screen_h))


# Research prompts for different analysis modes

PROMPTS = {
    "ui": """Extract all visible UI elements. For each provide:
- Position: (x, y) as 0.0-1.0
- Type: button, bar, icon, text, slot, menu
- Current value/status
- Function/purpose

Focus on: ability bars, health/mana, inventory, menus, quest trackers.
Return as structured list.""",

    "state": """Describe the current game state:
- What is the current objective/goal?
- What resources are visible (health, mana, ammo, currency)?
- What enemies/threats are present?
- What actions are available to the player?

Be specific about positions of key elements.""",

    "controls": """Analyze visible controls/keybindings:
- What buttons/keybindings are shown?
- What does each control do?
- What is the current keybind for each action?

Look at: ability bars, UI menus, tutorial prompts, control hints.""",

    "mechanics": """What game mechanics are visible in this screenshot?
- What systems are active (combat, crafting, dialogue)?
- How do the UI elements relate to each other?
- What can the player learn/explore here?

Focus on: menus, ability bars, inventory, quest trackers, tutorials.""",

    "strategic": """Analyze this game state for strategic decision making:
1. What threats/opportunities are visible?
2. What is the optimal next action?
3. What resources would be needed?
4. What could go wrong?

Think like an experienced player of this game.""",
}


async def analyze_game(image_path: str, mode: str = "state", custom_prompt: str = None) -> dict:
    """Analyze screenshot for game research."""
    prompt = custom_prompt or PROMPTS.get(mode, PROMPTS["state"])

    print(f"Analyzing: {image_path}")
    print(f"Mode: {mode}")

    try:
        result = await understand_image(image_path, prompt)

        if hasattr(result, 'content'):
            content = result.content
        elif isinstance(result, dict):
            content = result
        else:
            content = str(result)

        response_text = content[0].text if isinstance(content, list) else str(content)
        coords = parse_coordinates(response_text)

        print("\n=== Analysis ===")
        print(response_text[:500] + "..." if len(response_text) > 500 else response_text)

        if coords:
            print(f"\n=== Coordinates ({len(coords)} found) ===")
            for i, (x, y) in enumerate(coords[:10]):  # Limit to 10
                abs_x, abs_y = screen_coords(x, y)
                print(f"  {i+1}. ({x:.3f}, {y:.3f}) → screen ({abs_x}, {abs_y})")

        return {
            "response": response_text,
            "coordinates": coords,
            "mode": mode,
        }

    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}


def main():
    parser = argparse.ArgumentParser(
        description="Game Vision - Research video games via screen analysis",
        epilog="""
Modes:
  ui         - Extract all UI elements with positions
  state      - Describe current game state and objectives
  controls   - Analyze keybindings and controls
  mechanics  - Learn game mechanics from screenshot
  strategic  - Strategic decision making analysis

Examples:
  python game_vision.py ui screenshot.png
  python game_vision.py state screenshot.png
  python game_vision.py controls screenshot.png
  python game_vision.py screenshot.png "What does this ability do?"
        """
    )
    parser.add_argument("image", help="Path to screenshot")
    parser.add_argument("prompt", nargs="*", help="Custom prompt (optional)")
    parser.add_argument("--mode", "-m", choices=list(PROMPTS.keys()), default="state")

    args = parser.parse_args()

    if not args.image:
        parser.print_help()
        sys.exit(1)

    import asyncio

    custom = " ".join(args.prompt) if args.prompt else None
    mode = args.mode

    result = asyncio.run(analyze_game(args.image, mode, custom))
    print(f"\nResult: {json.dumps(result, indent=2)[:500]}")


if __name__ == "__main__":
    main()