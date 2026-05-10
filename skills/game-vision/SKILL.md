---
origin: local
name: game-vision
description: Research video games - learn UI elements, mechanics, controls, and strategies via VLM + OCR analysis
---

# Game Vision Skill

Research video games via screen analysis. Use VLM + OCR to understand how a game works.

**For execution/automation (click, type, screenshot), use `computer-use` skill instead.**

## Game Research Workflow

```
Screenshot (via computer-use) → VLM Analysis (here) → Game Understanding
```

### 1. Capture Screen
Use `computer_use` skill:
```bash
python computer_tool.py screenshot --resize 800 450
```

### 2. Analyze with VLM
```bash
python game_vision.py ui screenshot.png        # extract UI elements
python game_vision.py state screenshot.png     # game state + objectives
python game_vision.py controls screenshot.png  # keybindings
python game_vision.py mechanics screenshot.png  # game systems
python game_vision.py strategic screenshot.png  # strategic decisions
```

Or call directly in Python:
```python
from game_vision import analyze_game

result = await analyze_game("screenshot.png", mode="state")
# Returns: {"response": "...", "coordinates": [(0.5, 0.3), ...], "mode": "state"}
```

## Prompts

### UI Extraction
```
List all visible UI elements with:
- Position (0.0-1.0 relative)
- Type (button, bar, icon, slot, menu)
- Current value/status
- Function/purpose

Focus: ability bars, health/mana, inventory, menus, quest trackers.
```

### Game State
```
Describe current game state:
- Current objective/goal
- Visible resources (health, mana, ammo, currency)
- Enemies/threats present
- Available player actions
```

### Controls Learning
```
What keybindings/controls are visible?
What does each control do?
Look at: ability bars, UI menus, tutorial prompts, control hints.
```

### Mechanics Learning
```
What game mechanics/systems are active?
How do UI elements relate to each other?
What can the player learn/explore?

Focus on: menus, ability bars, inventory, quest trackers, tutorials.
```

## OCR for Text

Extract in-game text (item names, dialog, instructions):
```python
import easyocr
reader = easyocr.Reader(['en', 'ch_sim'])
texts = reader.readtext(image)
```

## OpenCV Analysis

```python
import cv2

# Find UI via color segmentation
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
health = cv2.inRange(hsv, (0, 255, 255), (10, 255, 255))

# Contour detection for buttons/cards
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Template matching for known UI
result = cv2.matchTemplate(img, template, cv2.TM_CCOEFF_NORMED)
```

## Dependencies

```bash
pip install easyocr pytesseract opencv-python Pillow mcp
```