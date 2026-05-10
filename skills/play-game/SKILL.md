---
origin: local
name: play-game
description: Learn and play video games like a human - observe, think, act, and learn from experience
---

# Play Game Skill

An AI agent that learns and plays video games like a human. Not perfect automation - it learns, makes mistakes, adapts, and develops intuition.

## Philosophy

**Human-like learning:**
- Watch the screen like a human would
- Learn game mechanics through trial and error
- Build intuition from visual patterns
- Make decisions based on incomplete information
- Learn from failures, not just successes
- Has natural reaction times (not instant robot)

**Not a bot - an agent that learns:**
- Exploration: try things to see what happens
- Memory: remember what worked/didn't work
- Intuition: recognize patterns from past states
- Adaptation: adjust when things change
- Recovery: detect mistakes and correct them

## Architecture

```
┌─────────────────────────────────────────────┐
│              Game Agent                      │
│                                              │
│  ┌─────────┐    ┌──────────┐    ┌────────┐ │
│  │ Observe │ →  │  Think   │ →  │  Act   │ │
│  │(screenshot│  │(decide)  │    │(execute│ │
│  │ + VLM)  │    │          │    │        │ │
│  └────┬────┘    └────┬─────┘    └────┬───┘ │
│       ↑             │               │      │
│       └─────────────┴───────────────┘      │
│                    ↑                        │
│               ┌────┴────┐                    │
│               │  Learn  │                    │
│               │(memory) │                    │
│               └─────────┘                    │
└─────────────────────────────────────────────┘
```

## The Loop

### 1. OBSERVE
```python
# Capture screen
screenshot() → img

# Analyze with VLM - understand current state
analyze_game_state(img) → game_state

# Also use OpenCV for fast checks
check_health_bar_color()  # quick color check
find_enemies_by_template()  # template matching
```

### 2. THINK
```python
# Based on observed state + memory, decide what to do
decide_action(game_state, memory) → action

# Types of thinking:
# - Recognition: "This is the same situation as before"
# - Prediction: "If I do X, Y will happen"
# - Planning: "I need to get to state Z first"
# - Intuition: "Feels right to do this"
```

### 3. ACT
```python
# Execute the decided action
execute_action(action)  # click, keypress, etc.

# Human-like timing:
wait(human_delay())  # 100-500ms natural delay
```

### 4. LEARN
```python
# Observe what happened after the action
# Success? Failure? Unexpected outcome?
learn_from_result(action, outcome, new_state)

# Update memory:
# - "When in state X, action Y works"
# - "Action Z doesn't work in situation W"
# - "This enemy pattern means danger"
```

## State Representation

Games are complex - we need to represent state in a way the agent can reason about:

```python
class GameState:
    screenshot: Image          # raw visual
    ui_elements: List[UI]      # parsed from VLM
    health: int                # 0-100
    resources: Dict             # mana, ammo, gold, etc.
    enemies: List[Enemy]        # position, type, threat
    objective: str              # current goal
    game_phase: str            # menu, combat, exploration, etc.
    timestamp: float           # when captured

class Memory:
    # "When I was in state similar to this..."
    # "Action X worked before in situation Y"
    # "Enemies of type Z tend to do this..."
    past_states: List[State]
    successful_actions: Dict[StatePattern, Action]
    failed_actions: Dict[StatePattern, Action]
    discovered_mechanics: List[str]  # learned game rules
```

## Decision Making

### Simple Heuristic Mode
```python
# Rule-based for fast games
if health < 30% and cooldown_ready("heal"):
    return "heal"
if enemy_close() and can_attack():
    return "attack"
```

### VLM Reasoning Mode
```python
# Think step by step for complex decisions
prompt = f"""
Current state: {game_state.description}
Objective: {game_state.objective}
What is the best action and why?
Consider: available resources, enemy positions, cooldowns.
"""
response = vlm.analyze(prompt)
return parse_action(response)
```

### Memory-Guided Mode
```python
# Use past experience
similar = memory.find_similar_state(current_state)
if similar and similar.success_rate > 0.7:
    return similar.recommended_action
else:
    return explore()  # try something new
```

## Learning Mechanisms

### 1. Trial and Error
```python
# Try something and see what happens
action = random_exploration_action()
execute(action)
wait_for_result()
outcome = observe_result()
learn(action, outcome)
```

### 2. Observation Learning
```python
# Watch and learn from game state changes
before = observe_state()
execute(action)
after = observe_state()
learn_pattern(action, before → after)
```

### 3. Failure Recovery
```python
# Detect when something went wrong
expected = predict_outcome(action)
actual = observe_outcome()
if actual != expected:
    learn_correction(action, expected → actual)
    # Try to fix it or back off
```

## Human-like Behaviors

### Natural Delays
```python
# Not instant - humans have reaction time
import random
def human_delay():
    return random.uniform(0.1, 0.5)  # 100-500ms
```

### Imperfect Execution
```python
# Humans don't click perfectly
def human_click(x, y):
    offset_x = random.randint(-5, 5)
    offset_y = random.randint(-5, 5)
    click(x + offset_x, y + offset_y)
```

### Movement Patterns
```python
# Humans move in curves, not straight lines
def human_move_to(target):
    # Bezier curve movement with slight wobble
    path = bezier_curve(current_pos, target, wobble=10)
    for point in path:
        move_to(point)
        sleep(0.05)
```

### Pause to Think
```python
# Humans sometimes pause before decisions
if complex_situation():
    wait(random.uniform(0.5, 2.0))  # think time
```

## Game Type Strategies

### Action Games (Warframe, Overwatch, Enlisted)
- Fast reaction loop
- Enemy detection via color/template
- Ability rotation based on cooldowns
- Dodge/roll based on enemy tells
- Multi-frame capture for animation

### Card Games (Yu-Gi-Oh, Hearthstone)
- Read cards via OCR
- Evaluate board state
- Calculate possible moves
- Watch for opponent patterns
- Manage resources carefully

### RTS Games
- Parse minimap for unit positions
- Multi-unit control via hotkeys
- Resource management
- Build order strategies
- Scout and map awareness

### RPGs (exploration, quests)
- Read dialogue via OCR
- Navigate menus
- Quest tracking
- Inventory management
- NPC interaction patterns

## Memory Persistence

Save learned knowledge to disk for reuse:

```python
def save_memory(memory, game_name):
    with open(f"memory/{game_name}.json", "w") as f:
        json.dump(memory.serialize(), f)

def load_memory(game_name):
    with open(f"memory/{game_name}.json", "r") as f:
        return Memory.deserialize(json.load(f))
```

## Usage Example

```python
from game_agent import GameAgent

agent = GameAgent(game_name="warframe")

# Start playing
await agent.play()

# Or step-by-step control
while agent.running:
    state = await agent.observe()
    action = agent.decide(state)
    await agent.act(action)
    agent.learn_from_action()
```

## Dependencies

```bash
pip install opencv-python easyocr Pillow pyautogui pyperclip mcp numpy
```