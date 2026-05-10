---
origin: local
name: computer-use
description: General purpose desktop automation - control mouse, keyboard, and vision to act like a human at a computer
---

# Computer Use Skill

You have a computer screen in front of you. You can see it, move the mouse, type, and press keys - just like a human.

## Design Philosophy

This tool exposes low-level primitives that an AI can combine to accomplish high-level goals. The AI decides what to do and how to combine actions. This is an **adapter** - it translates AI intent into actual computer actions.

## Vision Workflow (CRITICAL)

When you need to interact with the screen:

### Step 1: Take Screenshot (with verification for animations)
```bash
# Single frame - for static screens
python computer_tool.py screenshot --resize 800 450

# Multiple frames - for games/animations (captures changes over time)
python computer_tool.py screenshot --resize 800 450 --frames 4 --delay 0.5

# After important actions, always verify
python computer_tool.py screenshot --resize 800 450 --frames 2 --delay 0.3
```

### Step 2: Read the Image
```
Read: tmp/screenshot_YYYYMMDD_HHMMSS.png
```
**YOU MUST use the Read tool to actually see the image before acting.**

### Step 3: Describe What You See
After reading, describe:
```
"I see a Yu-Gi-Oh game. My hand is at bottom-right (cards visible).
Opponent's field at top, my monster zone in center.
I see a glowing/highlighted card at position (0.78, 0.85) in the image."
```

### Step 4: Act with Proper Timing
```bash
# Wait for animations to complete (games need time!)
# After clicking, always add a delay to let the game respond

python computer_tool.py click 0.78 0.85
# Wait for animation before next action
```

### Step 5: Verify
Take another screenshot and read it to confirm the action worked.

## Coordinate System

**Screen size: 2560x1080** (verify with `info` command)

When using `--resize 800 450`:
- Image is scaled from 2560x1080 to 800x450
- Coordinates 0.0-1.0 work on both (proportional)
- `click 0.5 0.5` = center in both image and screen space

| Format | Example | Description |
|--------|---------|-------------|
| Relative | `click 0.5 0.5` | 50% from left, 50% from top |
| Absolute | `click 1280 540` | Pixel coordinates |

**Coordinate scaling for clicks:**
```
screen_x = click_x * 2560
screen_y = click_y * 1080
```

## Advanced Techniques

### 1. Animation Handling
Games have animations - always capture multiple frames:
```bash
# Capture 4 frames with 0.5s delay between each
python computer_tool.py screenshot --frames 4 --delay 0.5
```

### 2. Action Delays
After clicking, wait for the game to respond:
```bash
python computer_tool.py click 0.5 0.5
# Then wait before next action
```

### 3. Modifier Keys with Clicks
Combine keys with mouse clicks for special actions:
- Shift+click for multi-select
- Ctrl+click for special actions in games
```bash
python computer_tool.py key-down shift
python computer_tool.py click 0.5 0.5
python computer_tool.py key-up shift
```

### 4. Hold Keys for Movement
For games where you need to hold a direction:
```bash
python computer_tool.py key-down w    # hold forward
python computer_tool.py click 0.5 0.5  # click somewhere while holding
python computer_tool.py key-up w      # release
```

### 5. Key Sequences for Timing
Press multiple keys with delays for complex actions:
```bash
python computer_tool.py key-sequence e 0.5 r 0.5 enter
```

### 6. Verify Changes
After clicking, compare screenshots to see what changed:
- 100K+ pixels changed = significant UI change
- Small changes = may have missed target

## Commands

### Vision
```bash
# Take screenshot (auto-named to tmp/)
python computer_tool.py screenshot

# Multi-frame for animations
python computer_tool.py screenshot --frames 4 --delay 0.5

# Downscale for speed (use for vision analysis)
python computer_tool.py screenshot --resize 800 450

# Crop to region
python computer_tool.py screenshot --region 0 0 800 450

python computer_tool.py info                                 # screen + mouse
python computer_tool.py locate-on-screen button.png          # find template
python computer_tool.py pixel-color 0.5 0.5                   # get color
```

### Mouse (accepts relative 0.0-1.0 or absolute)
```bash
python computer_tool.py click 0.8 0.9           # right side, near bottom
python computer_tool.py click 1600 900          # absolute pixel coords
python computer_tool.py click 0.5 0.5 --clicks 3  # triple-click
python computer_tool.py right-click 0.5 0.5      # right-click
python computer_tool.py double-click 0.3 0.4
python computer_tool.py move 0.5 0.5 --duration 0.5
python computer_tool.py drag 0.8 0.9 --duration 1.0
python computer_tool.py scroll -300
```

### Keyboard
```bash
python computer_tool.py type "hello"
python computer_tool.py press enter
python computer_tool.py press escape
python computer_tool.py hotkey ctrl c           # copy
python computer_tool.py hotkey alt tab          # switch window
python computer_tool.py key-down shift          # hold key
python computer_tool.py key-up shift            # release key
python computer_tool.py key-sequence e 0.5 r 0.5 enter  # with delays
```

### Clipboard
```bash
python computer_tool.py get-clipboard
python computer_tool.py set-clipboard "text"
```

## Best Practices

1. **Read images before acting** - Never click without seeing what's on screen
2. **Use multi-frame for games** - `--frames 4 --delay 0.5` to capture animations
3. **Wait for animations** - Add delays after clicking for games to respond
4. **Verify actions** - Take screenshot after clicking to confirm it worked
5. **Describe what you see** - Tell the user what you observe before acting
6. **Use relative coordinates** - `0.5 0.5` is clearer than `1280 540`

## What Humans Can Do (This Tool Enables)

- [x] Move mouse anywhere on screen
- [x] Click (left, right, middle), double-click, triple-click
- [x] Drag and drop
- [x] Type text via keyboard
- [x] Press keys and key combos
- [x] Hold keys (shift, ctrl, alt, WASD for movement)
- [x] Hotkeys (ctrl+c, alt+tab, etc.)
- [x] Scroll (vertical and horizontal)
- [x] See screen via screenshot
- [x] Find images on screen via template matching
- [x] Multi-frame capture for animations
- [x] Read/write clipboard

## Limitations

- pyautogui is slow (~100ms per action) - not for fast FPS gaming
- No audio feedback
- Single monitor (primary screen only)

## Dependencies
```
pip install pyautogui Pillow pyperclip
```