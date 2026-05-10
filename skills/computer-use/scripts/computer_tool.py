#!/usr/bin/env python3
"""
Computer Use Tool - General purpose desktop automation adapter for AI agents.
Exposes pyautogui capabilities so the AI can orchestrate any desktop interaction
the way a human would.
"""

import sys
import os
import argparse
import time
from datetime import datetime

try:
    import pyautogui
except ImportError:
    print("Error: pyautogui not found. Install with: pip install pyautogui")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow not found. Install with: pip install Pillow")
    sys.exit(1)

try:
    import pyperclip
except ImportError:
    pyperclip = None

try:
    from mcp.client.stdio import stdio_client, StdioServerParameters
    from mcp import ClientSession
    import asyncio
    HAS_MCP = True
except ImportError:
    HAS_MCP = False

# Load .env if exists
def load_env():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip())

load_env()
MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY") or os.environ.get("LLM_API_KEY", "")
MINIMAX_API_HOST = os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io")

# pyautogui config
pyautogui.PAUSE = 0
pyautogui.FAILSAFE = True


def screenshot(filename=None, region=None, resize=None, quality=85, frames=1, delay=0.5, compact=False):
    """Capture screen. Optionally crop to region=(left, top, width, height).
    Use resize=(width, height) to downscale image for smaller file size.
    Use quality=1-100 for JPEG/WebP compression (default 85).
    Use compact=True to use high-efficiency compression (WebP/Optimized JPEG) 
    to reduce file size while maintaining resolution.
    Use frames=N to capture multiple screenshots (for animations).
    Use delay=S to wait between frames (default 0.5 seconds).

    Default saves to tmp/screenshot_YYYYMMDD_HHMMSS.webp (compact) or .png (normal)

    Returns: {"path": str, "original_size": (w,h), "resized_to": (w,h)?}
    IMPORTANT: When resize is used, click coordinates should be relative (0.0-1.0)
    because image is scaled down. Multiply by original W/H to get actual screen coords."""
    if filename is None:
        ext = ".webp" if compact else ".png"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"tmp/screenshot_{timestamp}{ext}"
    
    # Ensure filename has an extension if it doesn't
    base, ext = os.path.splitext(filename)
    if not ext:
        ext = ".webp" if compact else ".png"
        filename = base + ext
    else:
        ext = ext.lower()

    os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else "tmp", exist_ok=True)

    paths = []
    for i in range(frames):
        if i > 0:
            time.sleep(delay)

        im = pyautogui.screenshot()
        original_w, original_h = im.size

        if region:
            x, y, w, h = region
            im = im.crop((x, y, x+w, y+h))
            original_w, original_h = w, h

        if resize:
            im = im.resize(resize, Image.LANCZOS)

        base_path = os.path.splitext(filename)[0]
        ext = os.path.splitext(filename)[1]
        frame_filename = f"{base_path}_{i:03d}{ext}" if frames > 1 else filename
        
        save_args = {"optimize": True}
        if ext in ['.jpg', '.jpeg']:
            save_args['quality'] = quality
            im.save(frame_filename, 'JPEG', **save_args)
        elif ext == '.webp':
            save_args['quality'] = quality
            im.save(frame_filename, 'WEBP', **save_args)
        else:
            if compact:
                save_args['compress_level'] = 9
            im.save(frame_filename, 'PNG', **save_args)

        paths.append(os.path.abspath(frame_filename))

    if frames > 1:
        print(f"Captured {frames} frames: {len(paths)} images")

    result = {
        "path": paths[0] if len(paths) == 1 else paths,
        "original_size": (original_w, original_h),
    }
    if resize:
        result["resized_to"] = resize
        print(f"Screenshot: {original_w}x{original_h} -> resized to {resize[0]}x{resize[1]}")
        print(f"Use relative click coords (0.0-1.0) or multiply by {original_w}x{original_h}")
    else:
        print(f"Screenshot: {original_w}x{original_h}")
    print(f"Saved to {os.path.abspath(filename)}")
    return result


def click(x, y, clicks=1, interval=0.0, button='left', duration=0.0, log=True):
    """Click at x,y. Accepts both absolute coords and relative (0.0-1.0).
    If x,y are between 0-1 (or negative), treats as relative to screen size."""
    # Handle relative coordinates
    w, h = pyautogui.size()
    orig_x, orig_y = x, y
    if 0 < x <= 1:
        x = int(x * w)
    if 0 < y <= 1:
        y = int(y * h)
    # Handle negative (from right/bottom)
    if x < 0:
        x = w + x
    if y < 0:
        y = h + y

    if duration > 0:
        pyautogui.moveTo(x, y, duration=duration)
        time.sleep(0.05)
    pyautogui.click(x, y, clicks=clicks, interval=interval, button=button)

    if log:
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{timestamp}] Click {button} {clicks}x at ({x}, {y}) [orig: {orig_x}, {orig_y}]")


def right_click(x=None, y=None):
    """Right-click at x,y (relative 0-1 ok) or current position if None."""
    if x is not None and y is not None:
        w, h = pyautogui.size()
        if 0 < x <= 1: x = int(x * w)
        if 0 < y <= 1: y = int(y * h)
        if x < 0: x = w + x
        if y < 0: y = h + y
        pyautogui.rightClick(x, y)
    else:
        pyautogui.rightClick()
    pos = pyautogui.position()
    print(f"Right-clicked at ({pos.x}, {pos.y})")


def middle_click(x=None, y=None):
    """Middle-click at x,y (relative 0-1 ok) or current position."""
    if x is not None and y is not None:
        w, h = pyautogui.size()
        if 0 < x <= 1: x = int(x * w)
        if 0 < y <= 1: y = int(y * h)
        if x < 0: x = w + x
        if y < 0: y = h + y
        pyautogui.middleClick(x, y)
    else:
        pyautogui.middleClick()
    pos = pyautogui.position()
    print(f"Middle-clicked at ({pos.x}, {pos.y})")


def double_click(x, y):
    """Double-click at x,y (relative 0-1 ok)."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    pyautogui.doubleClick(x, y)
    print(f"Double-clicked at ({x}, {y})")


def triple_click(x, y):
    """Triple-click at x,y (relative 0-1 ok)."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    pyautogui.tripleClick(x, y)
    print(f"Triple-clicked at ({x}, {y})")


def move(x, y, duration=0.2):
    """Move mouse to x,y (relative 0-1 ok)."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    pyautogui.moveTo(x, y, duration=duration)
    print(f"Moved to ({x}, {y})")


def move_rel(delta_x, delta_y, duration=0.2):
    """Move mouse relative to current position."""
    pyautogui.move(delta_x, delta_y, duration=duration)
    pos = pyautogui.position()
    print(f"Moved relative ({delta_x}, {delta_y}), now at ({pos.x}, {pos.y})")


def drag(x, y, duration=0.5, button='left'):
    """Drag from current position to x,y (relative 0-1 ok)."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    pyautogui.drag(x, y, duration=duration, button=button)
    print(f"Dragged to ({x}, {y})")


def drag_rel(delta_x, delta_y, duration=0.5, button='left'):
    """Drag relative from current position."""
    pyautogui.dragRel(delta_x, delta_y, duration=duration, button=button)
    print(f"Dragged relative ({delta_x}, {delta_y})")


def scroll(amount, x=None, y=None):
    """Scroll amount (positive=up, negative=down). Optionally at x,y (relative 0-1 ok)."""
    if x is not None and y is not None:
        w, h = pyautogui.size()
        if 0 < x <= 1: x = int(x * w)
        if 0 < y <= 1: y = int(y * h)
        if x < 0: x = w + x
        if y < 0: y = h + y
    pyautogui.scroll(amount, x=x, y=y)
    print(f"Scrolled {amount}" + (f" at ({x}, {y})" if x and y else ""))


def hscroll(amount, x=None, y=None):
    """Horizontal scroll (positive=right, negative=left)."""
    pyautogui.hscroll(amount, x=x, y=y)
    print(f"H-scrolled {amount}")


def type_text(text, interval=0.01):
    """Type text character by character."""
    pyautogui.write(text, interval=interval)
    print(f"Typed: {text}")


def press(key):
    """Press a single key."""
    pyautogui.press(key)
    print(f"Pressed: {key}")


def key_down(key):
    """Hold a key down."""
    pyautogui.keyDown(key)
    print(f"Key down: {key}")


def key_up(key):
    """Release a held key."""
    pyautogui.keyUp(key)
    print(f"Key up: {key}")


def hold_key(key, duration=1.0):
    """Hold a key down for a specified duration, then release."""
    pyautogui.keyDown(key)
    print(f"Key down: {key} for {duration}s")
    time.sleep(duration)
    pyautogui.keyUp(key)
    print(f"Key up: {key}")


def wait(duration=1.0):
    """Wait/pause for specified seconds (for animations)."""
    time.sleep(duration)
    print(f"Waited {duration}s")


def hotkey(*keys):
    """Press multiple keys simultaneously."""
    pyautogui.hotkey(*keys)
    print(f"Hotkey: {'+'.join(keys)}")


def key_sequence(*keys_and_delays):
    """Press keys in sequence with optional delays (numbers = seconds to wait)."""
    i = 0
    while i < len(keys_and_delays):
        key = keys_and_delays[i]
        if isinstance(key, (int, float)):
            time.sleep(key)
        else:
            pyautogui.press(key)
        i += 1
    print(f"Key sequence completed")


def locate_on_screen(image_path, confidence=0.9):
    """Find image on screen. Returns (x,y) of center or None."""
    try:
        pos = pyautogui.locateOnScreen(image_path, confidence=confidence)
        if pos:
            center = pyautogui.center(pos)
            print(f"Found '{image_path}' at ({center.x}, {center.y})")
            return (center.x, center.y)
        else:
            print(f"'{image_path}' not found")
            return None
    except Exception as e:
        print(f"Error: {e}")
        return None


def locate_all_on_screen(image_path, confidence=0.9):
    """Find all instances of image. Returns list of (x,y)."""
    try:
        positions = list(pyautogui.locateAllOnScreen(image_path, confidence=confidence))
        centers = [pyautogui.center(p) for p in positions]
        coords = [(c.x, c.y) for c in centers]
        print(f"Found {len(positions)}x '{image_path}': {coords}")
        return coords
    except Exception as e:
        print(f"Error: {e}")
        return []


def pixel_color(x, y):
    """Get RGB color of pixel at x,y (relative 0-1 ok)."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    im = pyautogui.screenshot()
    r, g, b = im.getpixel((x, y))
    print(f"RGB({r}, {g}, {b}) at ({x}, {y})")
    return (r, g, b)


def on_screen(x, y):
    """Check if coordinates (relative 0-1 ok) are within screen bounds."""
    w, h = pyautogui.size()
    if 0 < x <= 1: x = int(x * w)
    if 0 < y <= 1: y = int(y * h)
    if x < 0: x = w + x
    if y < 0: y = h + y
    result = 0 <= x < w and 0 <= y < h
    print(f"({x}, {y}) on screen {w}x{h}: {result}")
    return result


def get_clipboard():
    """Get text from clipboard."""
    if pyperclip is None:
        print("Error: pyperclip not installed (pip install pyperclip)")
        return None
    text = pyperclip.paste()
    print(f"Clipboard: {text[:50]}{'...' if len(text) > 50 else ''}")
    return text


def set_clipboard(text):
    """Set clipboard text."""
    if pyperclip is None:
        print("Error: pyperclip not installed (pip install pyperclip)")
        return
    pyperclip.copy(text)
    print(f"Clipboard set: {text[:50]}{'...' if len(text) > 50 else ''}")


def get_info():
    """Get screen size and mouse position."""
    w, h = pyautogui.size()
    x, y = pyautogui.position()
    print(f"Screen: {w}x{h} | Mouse: ({x}, {y})")
    return {"screen": (w, h), "mouse": (x, y)}


# --- Vision Analysis (VLM) Functions ---

def parse_coordinates(text: str) -> list[tuple[float, float]]:
    """Parse coordinates from VLM response. Looks for patterns like (0.5, 0.85) or 0.5, 0.85."""
    import re
    coords = []
    # Match patterns like (0.5, 0.85) or 0.5, 0.85
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


async def understand_image(image_path: str, prompt: str) -> str:
    """Call MiniMax understand_image tool via MCP."""
    if not HAS_MCP:
        return "Error: mcp package not installed. Cannot use VLM analysis."
    
    if not MINIMAX_API_KEY:
        return "Error: MINIMAX_API_KEY not found in environment."

    server_params = StdioServerParameters(
        command="uvx",
        args=["minimax-coding-plan-mcp", "-y"],
        env={
            "MINIMAX_API_KEY": MINIMAX_API_KEY,
            "MINIMAX_API_HOST": MINIMAX_API_HOST,
        },
    )

    abs_image_path = os.path.abspath(image_path)

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("understand_image", {
                "image_source": abs_image_path,
                "prompt": prompt,
            })
            
            # Extract text from result
            if hasattr(result, 'content'):
                return "".join([block.text for block in result.content if hasattr(block, 'text')])
            return str(result)


# Standard Prompts
PROMPTS = {
    "game-state": """Describe the game state in detail. Focus on:
1. What's the main objective/current task?
2. Where are enemies located (give coordinates 0.0-1.0)?
3. What is your health/energy/mana status?
4. What abilities are available?
5. Any items, weapons, or inventory visible?
6. Minimap showing enemy positions?

Return coordinates as: (x, y) where 0.0-1.0 represents left-to-right and top-to-bottom.""",

    "ui": """Extract all clickable UI elements. For each element provide:
- Type: button, card, icon, menu, link, etc.
- Position: coordinates (0.0-1.0) of center
- Label: text on the element or its function

Focus on: action buttons, menu options, cards, inventory slots, skill icons, dialog buttons.""",

    "strategic": """Analyze this screenshot for strategic decision making:
1. What is the current state? (menu, combat, exploration, cutscene)
2. What threats are visible?
3. What opportunities exist?
4. What would be the optimal next action?
5. Give specific coordinates (0.0-1.0) for that action.""",

    "general": "Describe this screenshot in detail. Identify key elements and their relative positions (0.0-1.0)."
}


async def analyze_screenshot(image_path: str, prompt_key_or_text: str = "general"):
    """Analyze screenshot using VLM."""
    prompt = PROMPTS.get(prompt_key_or_text, prompt_key_or_text)
    
    print(f"Analyzing: {image_path}")
    print(f"Prompt: {prompt[:100]}...")

    response = await understand_image(image_path, prompt)
    
    print("\n=== VLM Response ===")
    print(response)
    
    coords = parse_coordinates(response)
    if coords:
        w, h = pyautogui.size()
        print(f"\n=== Parsed Coordinates: {len(coords)} found ===")
        for i, (x, y) in enumerate(coords):
            abs_x, abs_y = int(x * w), int(y * h)
            print(f"  {i+1}. Relative ({x:.3f}, {y:.3f}) -> Screen ({abs_x}, {abs_y})")
    
    return {"response": response, "coordinates": coords}


def main():
    parser = argparse.ArgumentParser(
        description="Computer Use Tool - General desktop automation for AI agents",
        epilog="""
Examples:
  # Vision - screenshots auto-save to tmp/ with timestamps
  python computer_tool.py screenshot
  python computer_tool.py screenshot --resize 800 450
  python computer_tool.py screenshot -o myimg.png --resize 800 450 --quality 60
  python computer_tool.py screenshot --region 0 0 800 450
  python computer_tool.py info

  # Mouse - coordinates can be absolute or relative (0.0-1.0)
  python computer_tool.py click 100 200       # absolute
  python computer_tool.py click 0.5 0.8      # relative to screen center
  python computer_tool.py click -0.1 0.9     # near bottom-right
  python computer_tool.py right-click 500 300
  python computer_tool.py double-click 300 400
  python computer_tool.py move 800 600 --duration 0.5
  python computer_tool.py drag 500 500 --duration 1.0
  python computer_tool.py scroll -300

  # Keyboard
  python computer_tool.py type "Hello World"
  python computer_tool.py press enter
  python computer_tool.py key-down shift
  python computer_tool.py key-up shift
  python computer_tool.py hotkey ctrl c
  python computer_tool.py hotkey ctrl shift z
  python computer_tool.py key-sequence c 0.5 v 0.5 enter

  # Image finding
  python computer_tool.py locate-on-screen button.png
  python computer_tool.py locate-on-screen icon.png --confidence 0.8

  # Clipboard
  python computer_tool.py get-clipboard
  python computer_tool.py set-clipboard "text to copy"

Coordinate System:
  - Absolute: 0 to screen width/height (e.g., 1280, 720)
  - Relative: 0.0 to 1.0 (e.g., 0.5, 0.5 = center)
  - Negative: from right/bottom edge (e.g., -1, -1 = bottom-right)
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Command")

    # screenshot
    p = subparsers.add_parser("screenshot", help="Take screenshot (supports animation frames)")
    p.add_argument("-o", "--output", default=None, help="Output file (default: tmp/screenshot_YYYYMMDD_HHMMSS.png)")
    p.add_argument("--region", nargs=4, type=int, metavar=("LEFT", "TOP", "WIDTH", "HEIGHT"))
    p.add_argument("--resize", nargs=2, type=int, metavar=("WIDTH", "HEIGHT"))
    p.add_argument("--quality", type=int, default=85, help="JPEG/WebP quality 1-100")
    p.add_argument("--compact", action="store_true", help="Use high-efficiency compression (WebP) instead of PNG")
    p.add_argument("--frames", type=int, default=1, help="Number of frames to capture (for animations)")
    p.add_argument("--delay", type=float, default=0.5, help="Delay between frames in seconds")

    # click (now accepts floats for relative coords)
    p = subparsers.add_parser("click", help="Click (accepts absolute or relative coords)")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)
    p.add_argument("--clicks", type=int, default=1)
    p.add_argument("--interval", type=float, default=0.0)
    p.add_argument("--button", default="left", choices=["left", "right", "middle"])
    p.add_argument("--duration", type=float, default=0.0)

    # other mouse commands
    subparsers.add_parser("right-click", help="Right-click (optional x y)")
    subparsers.add_parser("middle-click", help="Middle-click")
    p = subparsers.add_parser("double-click", help="Double-click")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)

    p = subparsers.add_parser("triple-click", help="Triple-click")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)

    # move
    p = subparsers.add_parser("move", help="Move mouse")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)
    p.add_argument("--duration", type=float, default=0.2)

    p = subparsers.add_parser("move-rel", help="Move relative")
    p.add_argument("delta_x", type=int)
    p.add_argument("delta_y", type=int)
    p.add_argument("--duration", type=float, default=0.2)

    # drag
    p = subparsers.add_parser("drag", help="Drag")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)
    p.add_argument("--duration", type=float, default=0.5)
    p.add_argument("--button", default="left")

    p = subparsers.add_parser("drag-rel", help="Drag relative")
    p.add_argument("delta_x", type=int)
    p.add_argument("delta_y", type=int)
    p.add_argument("--duration", type=float, default=0.5)
    p.add_argument("--button", default="left")

    # scroll
    p = subparsers.add_parser("scroll", help="Scroll")
    p.add_argument("amount", type=int)
    p.add_argument("--x", type=float)
    p.add_argument("--y", type=float)

    subparsers.add_parser("hscroll", help="Horizontal scroll").add_argument("amount", type=int)

    # keyboard
    p = subparsers.add_parser("type", help="Type text")
    p.add_argument("text", help="Text to type")
    p.add_argument("--interval", type=float, default=0.01)

    p = subparsers.add_parser("press", help="Press key")
    p.add_argument("key", help="Key name")

    subparsers.add_parser("key-down", help="Hold key").add_argument("key", help="Key name")
    subparsers.add_parser("key-up", help="Release key").add_argument("key", help="Key name")

    p = subparsers.add_parser("hold-key", help="Hold key for duration")
    p.add_argument("key", help="Key name")
    p.add_argument("--duration", type=float, default=1.0, help="Seconds to hold")

    p = subparsers.add_parser("wait", help="Wait/pause")
    p.add_argument("seconds", type=float, default=1.0, help="Seconds to wait")

    p = subparsers.add_parser("hotkey", help="Hotkey combo")
    p.add_argument("keys", nargs="+", help="Keys to press together")

    p = subparsers.add_parser("key-sequence", help="Key sequence")
    p.add_argument("sequence", nargs="+", help="Keys and delays")

    # vision
    p = subparsers.add_parser("locate-on-screen", help="Find image")
    p.add_argument("image", help="Image path")
    p.add_argument("--confidence", type=float, default=0.9)

    p = subparsers.add_parser("locate-all", help="Find all instances")
    p.add_argument("image", help="Image path")
    p.add_argument("--confidence", type=float, default=0.9)

    p = subparsers.add_parser("pixel-color", help="Get pixel color")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)

    p = subparsers.add_parser("on-screen", help="Check bounds")
    p.add_argument("x", type=float)
    p.add_argument("y", type=float)

    # clipboard
    subparsers.add_parser("get-clipboard", help="Get clipboard text")
    p = subparsers.add_parser("set-clipboard", help="Set clipboard text")
    p.add_argument("text", help="Text to copy")

    # info
    subparsers.add_parser("info", help="Screen and mouse info")

    # analyze
    p = subparsers.add_parser("analyze", help="Analyze screenshot using VLM (MiniMax)")
    p.add_argument("image", help="Path to image file")
    p.add_argument("prompt", nargs="?", default="general", help="Prompt key (game-state, ui, strategic, general) or custom text")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == "screenshot":
            resize = tuple(args.resize) if args.resize else None
            screenshot(args.output, args.region, resize, args.quality, args.frames, args.delay, args.compact)
        elif args.command == "analyze":
            asyncio.run(analyze_screenshot(args.image, args.prompt))
        elif args.command == "click":
            click(args.x, args.y, args.clicks, args.interval, args.button, args.duration)
        elif args.command == "right-click":
            right_click(getattr(args, 'x', None), getattr(args, 'y', None))
        elif args.command == "middle-click":
            middle_click(getattr(args, 'x', None), getattr(args, 'y', None))
        elif args.command == "double-click":
            double_click(args.x, args.y)
        elif args.command == "triple-click":
            triple_click(args.x, args.y)
        elif args.command == "move":
            move(args.x, args.y, args.duration)
        elif args.command == "move-rel":
            move_rel(args.delta_x, args.delta_y, args.duration)
        elif args.command == "drag":
            drag(args.x, args.y, args.duration, args.button)
        elif args.command == "drag-rel":
            drag_rel(args.delta_x, args.delta_y, args.duration, args.button)
        elif args.command == "scroll":
            scroll(args.amount, getattr(args, 'x', None), getattr(args, 'y', None))
        elif args.command == "hscroll":
            hscroll(args.amount)
        elif args.command == "type":
            type_text(args.text, args.interval)
        elif args.command == "press":
            press(args.key)
        elif args.command == "key-down":
            key_down(args.key)
        elif args.command == "key-up":
            key_up(args.key)
        elif args.command == "hold-key":
            hold_key(args.key, args.duration)
        elif args.command == "wait":
            wait(args.seconds)
        elif args.command == "hotkey":
            hotkey(*args.keys)
        elif args.command == "key-sequence":
            key_sequence(*args.sequence)
        elif args.command == "locate-on-screen":
            locate_on_screen(args.image, args.confidence)
        elif args.command == "locate-all":
            locate_all_on_screen(args.image, args.confidence)
        elif args.command == "pixel-color":
            pixel_color(args.x, args.y)
        elif args.command == "on-screen":
            on_screen(args.x, args.y)
        elif args.command == "get-clipboard":
            get_clipboard()
        elif args.command == "set-clipboard":
            set_clipboard(args.text)
        elif args.command == "info":
            get_info()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()