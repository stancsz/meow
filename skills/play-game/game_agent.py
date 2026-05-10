#!/usr/bin/env python3
"""
Play Game - A human-like game playing agent.

Learns games through observation, trial/error, and memory.
Not perfect automation - learns, makes mistakes, adapts.
"""

import os
import sys
import json
import time
import random
import asyncio
import argparse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple
from datetime import datetime

import base64

# Load .env
ENV_PATH = Path(__file__).parent.parent.parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())


# ─── Memory / State Representations ────────────────────────────────────────

@dataclass
class UIElement:
    type: str           # button, bar, icon, slot, text
    x: float; y: float  # 0.0-1.0 relative
    label: str
    value: str = ""

@dataclass
class GameState:
    """What the agent sees and understands about the current game state."""
    timestamp: float
    raw_image_path: str = ""

    # Parsed UI
    ui_elements: List[UIElement] = field(default_factory=list)

    # Numeric state (if detectable)
    health: int = -1
    mana: int = -1
    ammo: int = -1
    score: int = -1

    # High-level state
    game_phase: str = "unknown"  # menu, combat, exploration, cutscene
    objective: str = ""
    enemies_visible: List[str] = field(default_factory=list)

    # Raw VLM description
    description: str = ""

    def __repr__(self):
        return f"GameState(phase={self.game_phase}, health={self.health}, enemies={len(self.enemies_visible)})"

@dataclass
class MemoryEntry:
    """A remembered experience."""
    state_signature: str      # hash of key state features
    state_description: str   # human-readable description
    action: str
    outcome: str              # success, failure, unexpected
    result_state: str
    timestamp: float
    times_successful: int = 1
    times_failed: int = 0

    @property
    def success_rate(self) -> float:
        total = self.times_successful + self.times_failed
        return self.times_successful / total if total > 0 else 0.5

class Memory:
    """Agent's memory of past experiences."""

    def __init__(self, game_name: str = "unknown"):
        self.game_name = game_name
        self.entries: List[MemoryEntry] = []
        self.discovered_mechanics: List[str] = []
        self.memory_dir = Path("tmp/game_memory")
        self.memory_dir.mkdir(exist_ok=True)

    def add(self, state: GameState, action: str, outcome: str, result_desc: str):
        sig = self._state_signature(state)
        entry = MemoryEntry(
            state_signature=sig,
            state_description=result_desc or state.description,
            action=action,
            outcome=outcome,
            result_state=result_desc,
            timestamp=time.time()
        )

        # Merge with existing similar entry
        existing = self._find_similar(sig)
        if existing:
            if outcome == "success":
                existing.times_successful += 1
            else:
                existing.times_failed += 1
        else:
            self.entries.append(entry)

        # Save to disk periodically
        if len(self.entries) % 10 == 0:
            self.save()

    def _state_signature(self, state: GameState) -> str:
        """Create a hash representing this type of state."""
        key_features = f"{state.game_phase}:{state.health}:{len(state.enemies_visible)}"
        return str(abs(hash(key_features)) % 1000000)

    def _find_similar(self, sig: str) -> Optional[MemoryEntry]:
        for e in self.entries:
            if e.state_signature == sig:
                return e
        return None

    def find_similar_state(self, state: GameState) -> Optional[MemoryEntry]:
        sig = self._state_signature(state)
        return self._find_similar(sig)

    def get_recommended_action(self, state: GameState) -> Optional[str]:
        """Get action that worked before in similar state."""
        entry = self.find_similar_state(state)
        if entry and entry.success_rate > 0.5:
            return entry.action
        return None

    def add_mechanic(self, mechanic: str):
        if mechanic not in self.discovered_mechanics:
            self.discovered_mechanics.append(mechanic)

    def save(self):
        data = {
            "game_name": self.game_name,
            "entries": [asdict(e) for e in self.entries],
            "mechanics": self.discovered_mechanics
        }
        path = self.memory_dir / f"{self.game_name}.json"
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def load(self):
        path = self.memory_dir / f"{self.game_name}.json"
        if path.exists():
            with open(path) as f:
                data = json.load(f)
                self.game_name = data.get("game_name", self.game_name)
                self.entries = [MemoryEntry(**e) for e in data.get("entries", [])]
                self.discovered_mechanics = data.get("mechanics", [])


# ─── VLM Integration ────────────────────────────────────────────────────────

async def understand_image(image_path: str, prompt: str) -> str:
    """Call MiniMax understand_image and return text response."""
    try:
        from mcp.client.stdio import stdio_client, StdioServerParameters
        from mcp import ClientSession

        with open(image_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("utf-8")

        server_params = StdioServerParameters(
            command="uvx",
            args=["minimax-coding-plan-mcp", "-y"],
            env={
                "MINIMAX_API_KEY": os.environ.get("MINIMAX_API_KEY", ""),
                "MINIMAX_API_HOST": os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io"),
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
    """Parse (0.0, 0.0) coordinate patterns from text."""
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


# ─── Game Agent ─────────────────────────────────────────────────────────────

class GameAgent:
    """
    A game-playing agent that learns like a human.
    Observe → Think → Act → Learn → repeat
    """

    def __init__(self, game_name: str = "game", screen_size: Tuple[int, int] = (2560, 1080)):
        self.game_name = game_name
        self.screen_size = screen_size
        self.memory = Memory(game_name)
        self.memory.load()

        self.running = False
        self.current_state: Optional[GameState] = None

        # Config
        self.human_delay_range = (0.1, 0.5)  # 100-500ms reaction time
        self.exploration_rate = 0.2  # 20% chance to try something new

    def human_delay(self):
        """Simulate human reaction time."""
        return random.uniform(*self.human_delay_range)

    def human_click_offset(self, x: float, y: float) -> Tuple[int, int]:
        """Add slight offset to simulate imperfect human clicking."""
        offset_x = random.randint(-3, 3)
        offset_y = random.randint(-3, 3)
        abs_x, abs_y = to_screen_coords(x, y, *self.screen_size)
        return (abs_x + offset_x, abs_y + offset_y)

    async def observe(self, screenshot_path: str) -> GameState:
        """Analyze the current game state."""
        state = GameState(timestamp=time.time(), raw_image_path=screenshot_path)

        # VLM analysis prompt
        prompt = """Describe this game screenshot in detail:
- What game phase is this? (menu, combat, exploration, cutscene)
- What UI elements are visible? (health, mana, ability bar, minimap, etc.)
- What is the current objective or goal?
- Are any enemies visible? Describe them.
- What resources are shown? (health, mana, ammo, etc.)

Be specific about positions using coordinates 0.0-1.0."""

        description = await understand_image(screenshot_path, prompt)
        state.description = description

        # Parse coordinates from description
        coords = parse_coordinates(description)

        # Simple UI parsing from text
        state.game_phase = self._detect_phase(description)
        state.health = self._parse_health(description)
        state.enemies_visible = self._parse_enemies(description)
        state.objective = self._parse_objective(description)

        self.current_state = state
        return state

    def _detect_phase(self, text: str) -> str:
        text_lower = text.lower()
        if any(w in text_lower for w in ["main menu", "pause menu", "settings"]):
            return "menu"
        elif any(w in text_lower for w in ["combat", "battle", "fight", "attack"]):
            return "combat"
        elif any(w in text_lower for w in ["cutscene", "dialogue", "conversation"]):
            return "cutscene"
        return "exploration"

    def _parse_health(self, text: str) -> int:
        import re
        m = re.search(r'(?:health|hp)[\s:]*(\d+)/(\d+)', text, re.I)
        if m:
            return int(m.group(1)) * 100 // int(m.group(2)) if int(m.group(2)) > 0 else -1
        m = re.search(r'(?:health|hp)[\s:]*(\d+)%?', text, re.I)
        if m:
            return int(m.group(1))
        return -1

    def _parse_enemies(self, text: str) -> List[str]:
        enemies = []
        keywords = ["enemy", "hostile", "target", "monster", "opponent"]
        # Very simple - just detect if enemies mentioned
        if any(k in text.lower() for k in keywords):
            enemies = ["detected"]  # placeholder
        return enemies

    def _parse_objective(self, text: str) -> str:
        import re
        m = re.search(r'objective[:\s]+(.+?)(?:\.|$)', text, re.I)
        if m:
            return m.group(1).strip()
        return ""

    def decide(self, state: GameState) -> str:
        """Decide what to do based on state + memory."""
        # Check memory for similar situation
        recommended = self.memory.get_recommended_action(state)

        if recommended and random.random() > self.exploration_rate:
            return recommended

        # Exploration - try something new
        return self._exploration_action(state)

    def _exploration_action(self, state: GameState) -> str:
        """Generate a random/exploratory action."""
        actions = ["attack", "move_forward", "use_ability_1", "use_ability_2", "jump", "defend"]

        if state.health > 0:
            if state.health < 30:
                actions.append("heal")
            actions.append("explore")

        return random.choice(actions)

    async def act(self, action: str) -> bool:
        """Execute an action with human-like timing."""
        await asyncio.sleep(self.human_delay())

        # Execute based on action type
        if action == "attack":
            self._click_combat()
        elif action == "move_forward":
            self._press_key("w")
        elif action.startswith("use_ability"):
            num = action.split("_")[-1]
            self._press_key(num)
        elif action == "heal":
            self._press_key("r")
        elif action == "jump":
            self._press_key("space")
        elif action == "defend":
            self._press_key("shift")

        return True

    def _click_combat(self):
        """Click at combat location (center-right where enemies appear)."""
        x, y = self.human_click_offset(0.65, 0.5)
        self._run_cmd(f'python computer_tool.py click {x} {y}')

    def _press_key(self, key: str):
        self._run_cmd(f'python computer_tool.py press {key}')

    def _run_cmd(self, cmd: str):
        import subprocess
        subprocess.run(cmd, shell=True)

    def learn_from_action(self, action: str, success: bool):
        """Update memory based on action outcome."""
        if self.current_state:
            outcome = "success" if success else "failure"
            self.memory.add(self.current_state, action, outcome, self.current_state.description)

    def add_mechanic(self, mechanic: str):
        self.memory.add_mechanic(mechanic)

    async def play_loop(self, screenshot_fn=None, max_iterations: int = 100):
        """Main game loop."""
        self.running = True
        iteration = 0

        while self.running and iteration < max_iterations:
            try:
                # 1. Observe
                if screenshot_fn:
                    img_path = screenshot_fn()
                else:
                    img_path = await self._take_screenshot()

                state = await self.observe(img_path)
                print(f"[{iteration}] State: {state.game_phase}, Health: {state.health}")

                # 2. Decide
                action = self.decide(state)
                print(f"    Action: {action}")

                # 3. Act
                await self.act(action)

                # 4. Learn (simple - just observe if something changed)
                await asyncio.sleep(0.5)  # wait for game response

                # 5. Verify (did something change?)
                # TODO: more sophisticated outcome detection

                iteration += 1

            except Exception as e:
                print(f"Error in loop: {e}")
                await asyncio.sleep(1)

        self.memory.save()
        print(f"Session complete. {iteration} iterations.")

    async def _take_screenshot(self) -> str:
        """Take screenshot using computer_tool.py."""
        import subprocess
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = f"tmp/screenshot_{timestamp}.png"
        subprocess.run(
            f'python skills/computer-use/scripts/computer_tool.py screenshot -o {path} --resize 800 450',
            shell=True
        )
        return path


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Play Game - Human-like game agent")
    parser.add_argument("game", help="Game name for memory", nargs="?", default="game")
    parser.add_argument("--iterations", "-n", type=int, default=100)
    parser.add_argument("--mode", "-m", choices=["loop", "step", "observe"], default="loop")

    args = parser.parse_args()

    agent = GameAgent(game_name=args.game)

    if args.mode == "observe":
        # Just observe and describe once
        print("Taking screenshot...")
        path = asyncio.run(agent._take_screenshot())
        state = asyncio.run(agent.observe(path))
        print("\n=== Game State ===")
        print(f"Phase: {state.game_phase}")
        print(f"Health: {state.health}")
        print(f"Enemies: {state.enemies_visible}")
        print(f"Objective: {state.objective}")
        print("\n=== Description ===")
        print(state.description)

    elif args.mode == "step":
        # Step through manually
        print("Taking screenshot...")
        path = asyncio.run(agent._take_screenshot())
        state = asyncio.run(agent.observe(path))
        print(f"\nState: {state}")

        action = input("Action (or 'q' to quit): ")
        if action != 'q':
            asyncio.run(agent.act(action))

    else:
        # Auto loop
        print(f"Starting game loop for '{args.game}'...")
        asyncio.run(agent.play_loop(max_iterations=args.iterations))


if __name__ == "__main__":
    main()