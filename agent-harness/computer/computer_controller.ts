/**
 * computer_controller.ts
 *
 * Central controller for the Desktop Agent.
 * Maps Click, Type, Screenshot, OCR tools to system-level inputs.
 *
 * Architecture:
 * - tool() methods are the public API, each maps to a system primitive
 * - execute() dispatches based on action type, with error recovery
 * - Platform detection: macOS (defaults), Linux, Windows
 * - Cross-platform fallback using Scenic / A11y APIs when available
 *
 * Benchmarking references:
 * - Goose (Rust): Rust binary + OS-level input injection for speed
 * - Eigent (Multi-agent): coordination layer + human-in-the-loop gates
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface Point { x: number; y: number; }

export interface BoundingBox {
  x: number; y: number;
  width: number; height: number;
  confidence?: number;
  label?: string;
}

export interface ClickResult {
  success: boolean;
  message: string;
  target?: BoundingBox;
}

export interface TypeResult {
  success: boolean;
  message: string;
  keystrokes?: string;
}

export interface ScreenshotResult {
  success: boolean;
  filePath?: string;
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface OCRResult {
  success: boolean;
  text: string;
  elements: BoundingBox[];
  error?: string;
}

export interface HumanApproval {
  action: string;
  reason: string;
  approved: boolean | null; // null = pending
  timeout: number;
}

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

// ============================================================================
// Platform Detection
// ============================================================================

type Platform = "darwin" | "linux" | "win32";

const PLATFORM = process.platform as Platform;

// ============================================================================
// Configuration
// ============================================================================

interface ComputerControllerConfig {
  screenshotDir: string;
  screenshotFormat: "png" | "jpg";
  ocrEngine: "tesseract" | "macos" | "paddle" | "mock";
  mouseSpeed: number;  // ms between moves (lower = faster)
  confidenceThreshold: number;  // 0–1, minimum confidence to auto-act
  hitlEnabled: boolean;  // human-in-the-loop gates
}

const DEFAULT_CONFIG: ComputerControllerConfig = {
  screenshotDir: "/tmp/screenshots",
  screenshotFormat: "png",
  ocrEngine: "mock",  // overridden at init if tesseract/macos available
  mouseSpeed: 50,
  confidenceThreshold: 0.85,
  hitlEnabled: true,
};

let CONFIG: ComputerControllerConfig = { ...DEFAULT_CONFIG };

export function configure(overrides: Partial<ComputerControllerConfig>) {
  CONFIG = { ...CONFIG, ...overrides };
}

export function getConfig(): ComputerControllerConfig {
  return { ...CONFIG };
}

// ============================================================================
// Utility: Run shell command
// ============================================================================

async function shell(cmd: string, timeoutMs = 15000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { timeout: timeoutMs, encoding: "utf-8" });
}

async function safeShell(cmd: string, timeoutMs = 15000): Promise<string> {
  try {
    const { stdout } = await shell(cmd, timeoutMs);
    return stdout;
  } catch (e: any) {
    return e.stdout || e.stderr || e.message;
  }
}

// ============================================================================
// Platform Primitives
// ============================================================================

/**
 * Click at (x, y) using platform-native input injection.
 * Uses AppleScript on macOS, xdotool on Linux, PowerShell on Windows.
 * For simulated/test mode, uses echo-based mouse scripts.
 */
async function platformClick(x: number, y: number, button: "left" | "right" = "left"): Promise<string> {
  const b = button === "right" ? 3 : 1;
  if (PLATFORM === "darwin") {
    return shell(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`);
  }
  if (PLATFORM === "linux") {
    return shell(`xdotool mousemove ${x} ${y} click ${b}`);
  }
  if (PLATFORM === "win32") {
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = @{X=${x};Y=${y}}; [System.Windows.Forms.Mouse]::PressLeftButton()"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}

/**
 * Double-click at (x, y)
 */
async function platformDoubleClick(x: number, y: number): Promise<string> {
  if (PLATFORM === "darwin") {
    return shell(`osascript -e 'tell application "System Events" to double click at {${x}, ${y}}'`);
  }
  if (PLATFORM === "linux") {
    return shell(`xdotool mousemove ${x} ${y} click --repeat 2 1`);
  }
  if (PLATFORM === "win32") {
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = @{X=${x};Y=${y}}; [System.Windows.Forms.Mouse]::DoubleClick()"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}

/**
 * Type text via platform API.
 * Supports modifier keys (Ctrl, Alt, Cmd, Shift).
 */
async function platformType(text: string): Promise<string> {
  // Escape for AppleScript
  const esc = (s: string) => s.replace(/"/g, '\\"');
  if (PLATFORM === "darwin") {
    return shell(`osascript -e 'tell application "System Events" to keystroke "${esc(text)}"'`);
  }
  if (PLATFORM === "linux") {
    return shell(`xdotool type --delay 30 "${text.replace(/"/g, '\\"')}"`);
  }
  if (PLATFORM === "win32") {
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text.replace(/[{}+~^()]/g, (c) => '{' + c + '}')}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}

/**
 * Press a keyboard shortcut, e.g. "Cmd+v", "Ctrl+Shift+a"
 */
async function platformKeyCombo(keys: string[]): Promise<string> {
  const k = keys.map((x) => {
    const map: Record<string, string> = {
      cmd: "command down", super: "command down",
      ctrl: "control down", control: "control down",
      alt: "option down", option: "option down",
      shift: "shift down",
      enter: "return", return: "return",
      tab: "tab", escape: "escape", esc: "escape",
      delete: "delete", backspace: "erase char",
      up: "key code 126", down: "key code 125",
      left: "key code 123", right: "key code 124",
    };
    return map[x.toLowerCase()] ?? x.toLowerCase();
  }).join(", ");
  if (PLATFORM === "darwin") {
    return shell(`osascript -e 'tell application "System Events" to key down {${k.split(", ").join("}, {")}}; delay 0.05; tell application "System Events" to key up {${k.split(", ").join("}, {")}}'`.replace(/\{, \{/g, "}, {"));
  }
  if (PLATFORM === "linux") {
    const linuxKeys = keys.join("+");
    return shell(`xdotool key ${linuxKeys}`);
  }
  if (PLATFORM === "win32") {
    const winKeys = keys.map((k) => "^" + k).join("");
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${winKeys}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}

/**
 * Capture a screenshot and save to a file.
 * Falls back to `screencapture` (macOS), `gnome-screenshot` / `scrot` (Linux), or `mss` / PowerShell (Windows).
 */
async function platformScreenshot(filePath: string): Promise<string> {
  if (PLATFORM === "darwin") {
    return shell(`screencapture -x -t ${CONFIG.screenshotFormat === "jpg" ? "jpeg" : "png"} ${filePath}`);
  }
  if (PLATFORM === "linux") {
    try {
      return await shell(`scrot ${filePath}`);
    } catch {
      return await shell(`gnome-screenshot -f ${filePath}`);
    }
  }
  if (PLATFORM === "win32") {
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bitmap.Save('${filePath.replace(/\\/g, "\\\\")}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}

/**
 * Get screen dimensions.
 */
async function getScreenSize(): Promise<{ width: number; height: number }> {
  if (PLATFORM === "darwin") {
    const out = await shell(`osascript -e 'tell application "System Events" to get size of window 1 of process "Finder"'`);
    return { width: 1920, height: 1080 };  // fallback
  }
  if (PLATFORM === "linux") {
    try {
      const out = await shell(`xdotool getdisplaygeometry`);
      const [w, h] = out.trim().split(" ");
      return { width: parseInt(w), height: parseInt(h) };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }
  if (PLATFORM === "win32") {
    return { width: 1920, height: 1080 };
  }
  return { width: 1920, height: 1080 };
}

// ============================================================================
// Error Recovery
// ============================================================================

interface Attempt {
  action: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

const recentAttempts: Attempt[] = [];
const MAX_RETRY = 2;

function recordAttempt(action: string, success: boolean, error?: string) {
  recentAttempts.push({ action, timestamp: Date.now(), success, error });
  // Keep only last 20
  while (recentAttempts.length > 20) recentAttempts.shift();
}

function shouldRetry(action: string): boolean {
  const same = recentAttempts.filter((a) => a.action === action);
  if (same.length === 0) return true;
  const failures = same.filter((a) => !a.success).length;
  return failures < MAX_RETRY;
}

function describeFailure(action: string): string {
  const same = recentAttempts.filter((a) => a.action === action && !a.success);
  if (same.length === 0) return "Unknown error";
  return same[same.length - 1].error ?? "Failed";
}

// ============================================================================
// Mock / Simulated Mode (for Docker / no-display environments)
// ============================================================================

let SIMULATED = process.env.SIMULATE_DESKTOP === "1";

export function setSimulated(v: boolean) { SIMULATED = v; }
export function isSimulated(): boolean { return SIMULATED; }

/**
 * Simulate a click without real system input.
 * Returns a mock result with the click coordinates.
 */
async function simulatedClick(x: number, y: number): Promise<ClickResult> {
  console.log(`[computer:sim] click(${x}, ${y})`);
  await safeShell(`echo "[sim:click] x=${x} y=${y}" >> /tmp/computer_sim_log.txt`);
  return {
    success: true,
    message: `[simulated] clicked at (${x}, ${y})`,
    target: { x, y, width: 0, height: 0 },
  };
}

async function simulatedType(text: string): Promise<TypeResult> {
  console.log(`[computer:sim] type("${text.slice(0, 20)}${text.length > 20 ? "..." : ""}")`);
  await safeShell(`echo "[sim:type] text=${text}" >> /tmp/computer_sim_log.txt`);
  return { success: true, message: `[simulated] typed: ${text}`, keystrokes: text };
}

async function simulatedScreenshot(): Promise<ScreenshotResult> {
  const outFile = join(CONFIG.screenshotDir, `sim_${Date.now()}.png`);
  await safeShell(`convert xc:black -size 1920x1080 png:${outFile} 2>/dev/null || dd if=/dev/urandom bs=1 count=1024 of=${outFile} 2>/dev/null; echo "simulated screenshot" > /tmp/last_screenshot.txt`);
  const base64 = await safeShell(`base64 ${outFile} 2>/dev/null | tr -d '\\n'`);
  return {
    success: true,
    filePath: outFile,
    base64,
    width: 1920,
    height: 1080,
  };
}

// ============================================================================
// Public Tool API
// ============================================================================

/**
 * click(point) — click at the specified (x, y).
 * If boundingBox is provided, clicks the center of the box.
 */
export async function click(
  pointOrBox: Point | BoundingBox,
  retries = MAX_RETRY
): Promise<ClickResult> {
  const x = "x" in pointOrBox ? pointOrBox.x : (pointOrBox as Point).x;
  const y = "y" in pointOrBox ? pointOrBox.y : (pointOrBox as Point).y;

  if (SIMULATED) return simulatedClick(x, y);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await platformClick(x, y);
      recordAttempt("click", true);
      return {
        success: true,
        message: `Clicked at (${x}, ${y})`,
        target: { x, y, width: 1, height: 1 },
      };
    } catch (e: any) {
      recordAttempt("click", false, e.message);
      if (attempt < retries && shouldRetry("click")) {
        await safeShell("sleep 0.3");
        continue;
      }
      return { success: false, message: `Click failed: ${e.message}` };
    }
  }
  return { success: false, message: describeFailure("click") };
}

/**
 * doubleClick(pointOrBox) — double-click at the center of the given point or box.
 */
export async function doubleClick(pointOrBox: Point | BoundingBox): Promise<ClickResult> {
  const x = "x" in pointOrBox ? pointOrBox.x : (pointOrBox as Point).x;
  const y = "y" in pointOrBox ? pointOrBox.y : (pointOrBox as Point).y;

  if (SIMULATED) return simulatedClick(x, y);

  try {
    await platformDoubleClick(x, y);
    recordAttempt("doubleClick", true);
    return { success: true, message: `Double-clicked at (${x}, ${y})` };
  } catch (e: any) {
    recordAttempt("doubleClick", false, e.message);
    return { success: false, message: `Double-click failed: ${e.message}` };
  }
}

/**
 * type(text) — type text at the current cursor position.
 * Supports modifier prefixes: {Ctrl+C}, {Cmd+v}, etc.
 */
export async function type(text: string, retries = MAX_RETRY): Promise<TypeResult> {
  if (SIMULATED) return simulatedType(text);

  // Handle modifier sequences
  const modifierMatch = text.match(/^\{(.+?)\}\s*(.*)$/);
  if (modifierMatch) {
    const keys = modifierMatch[1].split("+");
    const rest = modifierMatch[2];
    try {
      await platformKeyCombo(keys);
      if (rest) await platformType(rest);
      return { success: true, message: `Pressed ${keys.join("+")}${rest ? " then typed: " + rest : ""}` };
    } catch (e: any) {
      return { success: false, message: `Key combo failed: ${e.message}` };
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await platformType(text);
      recordAttempt("type", true);
      return { success: true, message: `Typed: ${text}`, keystrokes: text };
    } catch (e: any) {
      recordAttempt("type", false, e.message);
      if (attempt < retries && shouldRetry("type")) {
        await safeShell("sleep 0.2");
        continue;
      }
      return { success: false, message: `Type failed: ${e.message}` };
    }
  }
  return { success: false, message: describeFailure("type") };
}

/**
 * pressKey(key) — press a single key (enter, tab, escape, etc.)
 */
export async function pressKey(key: string): Promise<TypeResult> {
  if (SIMULATED) {
    await safeShell(`echo "[sim:key] ${key}" >> /tmp/computer_sim_log.txt`);
    return { success: true, message: `[simulated] pressed ${key}` };
  }
  try {
    await platformKeyCombo([key]);
    return { success: true, message: `Pressed: ${key}` };
  } catch (e: any) {
    return { success: false, message: `Key press failed: ${e.message}` };
  }
}

/**
 * screenshot() — capture the full screen.
 * Returns path and base64 of the image.
 */
export async function screenshot(customPath?: string): Promise<ScreenshotResult> {
  if (SIMULATED) return simulatedScreenshot();

  const fileName = `screenshot_${Date.now()}.${CONFIG.screenshotFormat}`;
  const filePath = customPath ?? join(CONFIG.screenshotDir, fileName);

  try {
    await safeShell(`mkdir -p ${CONFIG.screenshotDir}`);
    await platformScreenshot(filePath);
    const { width, height } = await getScreenSize();
    const base64 = await safeShell(`base64 ${filePath} 2>/dev/null | tr -d '\\n'`);
    return { success: true, filePath, base64, width, height };
  } catch (e: any) {
    recordAttempt("screenshot", false, e.message);
    return { success: false, error: `Screenshot failed: ${e.message}` };
  }
}

/**
 * moveMouse(x, y) — move mouse pointer to (x, y) without clicking.
 */
export async function moveMouse(x: number, y: number): Promise<ToolResult> {
  if (SIMULATED) {
    await safeShell(`echo "[sim:move] ${x},${y}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] mouse moved to (${x}, ${y})` };
  }
  try {
    if (PLATFORM === "darwin") {
      await shell(`osascript -e 'tell application "System Events" to set the position of the first mouse to {${x}, ${y}}'`);
    } else if (PLATFORM === "linux") {
      await shell(`xdotool mousemove ${x} ${y}`);
    } else {
      await shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = @{X=${x};Y=${y}}"`);
    }
    return { success: true, content: `Mouse moved to (${x}, ${y})` };
  } catch (e: any) {
    return { success: false, error: `Move mouse failed: ${e.message}` };
  }
}

// ============================================================================
// Orchestrated Actions (multi-step, high-level)
// ============================================================================

/**
 * openApp(name) — open an application by name.
 * Uses platform APIs: open -a on macOS, xdg-open on Linux, start on Windows.
 */
export async function openApp(name: string): Promise<ToolResult> {
  if (SIMULATED) {
    await safeShell(`echo "[sim:openApp] ${name}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] opened ${name}` };
  }
  try {
    if (PLATFORM === "darwin") {
      await shell(`open -a "${name}"`);
    } else if (PLATFORM === "linux") {
      await shell(`xdg-open "${name}" 2>/dev/null || gtk-launch "${name}" 2>/dev/null`);
    } else {
      await shell(`powershell -c "Start-Process ${name}"`);
    }
    await safeShell("sleep 1"); // App launch delay
    return { success: true, content: `Opened: ${name}` };
  } catch (e: any) {
    return { success: false, error: `openApp failed: ${e.message}` };
  }
}

/**
 * focusWindow(appName) — focus a window by application name.
 */
export async function focusWindow(appName: string): Promise<ToolResult> {
  if (SIMULATED) return { success: true, content: `[simulated] focused window: ${appName}` };
  try {
    if (PLATFORM === "darwin") {
      await shell(`osascript -e 'tell application "${appName}" to activate'`);
    } else if (PLATFORM === "linux") {
      await shell(`xdotool search --name "${appName}" windowactivate 2>/dev/null || xdotool search --class "${appName}" windowactivate 2>/dev/null`);
    }
    return { success: true, content: `Focused: ${appName}` };
  } catch (e: any) {
    return { success: false, error: `focusWindow failed: ${e.message}` };
  }
}

/**
 * closeWindow(appName) — close the frontmost or named window.
 */
export async function closeWindow(appName?: string): Promise<ToolResult> {
  if (SIMULATED) return { success: true, content: `[simulated] closed window` };
  try {
    await platformKeyCombo(["cmd", "w"]); // Cmd+W is universal for close
    return { success: true, content: `Window closed` };
  } catch (e: any) {
    return { success: false, error: `closeWindow failed: ${e.message}` };
  }
}

/**
 * drag(from, to) — drag from one point to another (mouse down → move → mouse up).
 */
export async function drag(from: Point, to: Point): Promise<ToolResult> {
  if (SIMULATED) {
    await safeShell(`echo "[sim:drag] ${from.x},${from.y} -> ${to.x},${to.y}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] drag from ${JSON.stringify(from)} to ${JSON.stringify(to)}` };
  }
  try {
    if (PLATFORM === "darwin") {
      await shell(`osascript -e 'tell application "System Events" to drag (make new property list file)' 2>/dev/null || true`);
      // Use applescript mouse sequence
      await shell(`osascript -e 'tell application "System Events" to set the position of the first mouse to {${from.x}, ${from.y}}'`);
      await safeShell("sleep 0.1");
      await shell(`osascript -e 'tell application "System Events" to click at {${from.x}, ${from.y}}'`);
      await safeShell(`osascript -e 'tell application "System Events" to set the position of the first mouse to {${to.x}, ${to.y}}'`);
    } else if (PLATFORM === "linux") {
      await shell(`xdotool mousemove ${from.x} ${from.y} mousedown 1 mousemove ${to.x} ${to.y} mouseup 1`);
    } else {
      await shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = @{X=${from.x};Y=${from.y}}; [System.Windows.Forms.Mouse]::Down(); Start-Sleep -Millis 500; [System.Windows.Forms.Cursor]::Position = @{X=${to.x};Y=${to.y}}; [System.Windows.Forms.Mouse]::Up()"`);
    }
    return { success: true, content: `Dragged from ${JSON.stringify(from)} to ${JSON.stringify(to)}` };
  } catch (e: any) {
    return { success: false, error: `Drag failed: ${e.message}` };
  }
}

/**
 * scroll(direction, amount) — scroll the active window.
 * direction: "up" | "down" | "left" | "right"
 * amount: number of scroll steps (negative = up/left)
 */
export async function scroll(direction: "up" | "down" | "left" | "right", amount = 3): Promise<ToolResult> {
  if (SIMULATED) {
    await safeShell(`echo "[sim:scroll] ${direction} ${amount}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] scrolled ${direction} ${amount}` };
  }
  const dirMap: Record<string, number> = { up: -1, down: 1, left: -2, right: 2 };
  const btn = dirMap[direction] ?? 1;
  try {
    if (PLATFORM === "linux") {
      await shell(`xdotool click --repeat ${Math.abs(amount)} ${btn > 0 ? 5 : 4}`);
    } else {
      // macOS / Windows: use Cmd+Arrow or PageUp/PageDown
      if (direction === "up") await platformKeyCombo(["fn", "up"]);
      else if (direction === "down") await platformKeyCombo(["fn", "down"]);
      else await pressKey(direction);
    }
    return { success: true, content: `Scrolled ${direction} ${amount} steps` };
  } catch (e: any) {
    return { success: false, error: `Scroll failed: ${e.message}` };
  }
}

// ============================================================================
// Accessibility / OCR integration stubs
// ============================================================================

export interface A11yElement {
  role: string;
  title?: string;
  value?: string;
  boundingBox: BoundingBox;
  enabled: boolean;
}

/**
 * getA11yTree() — get the accessibility tree of the frontmost window.
 * Returns a flat list of interactive elements with their roles and positions.
 * This is the primary mechanism for element detection (replacing Scenic's tree API).
 */
export async function getA11yTree(): Promise<{ elements: A11yElement[]; error?: string }> {
  if (SIMULATED) {
    return {
      elements: [
        { role: "AXWindow", title: "Finder", boundingBox: { x: 0, y: 0, width: 1920, height: 1080 }, enabled: true },
        { role: "AXButton", title: "Close", boundingBox: { x: 10, y: 10, width: 40, height: 20 }, enabled: true },
      ],
    };
  }
  try {
    if (PLATFORM === "darwin") {
      const script = `
        tell application "System Events"
          set frontApp to first process whose frontmost is true
          set win to first window of frontApp
          set elemList to entire contents of win
          set output to ""
          repeat with elem in elemList
            try
              set r to role of elem
              set t to title of elem
              set v to value of elem
              set output to output & r & "|" & t & "|" & v & "||"
            end try
          end repeat
        end tell
      `;
      const out = await shell(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const elements: A11yElement[] = [];
      for (const line of out.trim().split("||")) {
        const [role, title, value] = line.split("|");
        if (role) {
          elements.push({
            role, title: title || undefined, value: value || undefined,
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },  // position TBD from AXPosition
            enabled: true,
          });
        }
      }
      return { elements };
    }
    if (PLATFORM === "linux") {
      const out = await shell(`xdotool getactivewindow getwindowname 2>/dev/null`);
      return { elements: [{ role: "AXWindow", title: out.trim(), boundingBox: { x: 0, y: 0, width: 1920, height: 1080 }, enabled: true }] };
    }
    return { elements: [], error: "A11y not supported on this platform" };
  } catch (e: any) {
    return { elements: [], error: `A11y tree failed: ${e.message}` };
  }
}

// ============================================================================
// State
// ============================================================================

let initialized = false;

export async function init(): Promise<void> {
  if (initialized) return;

  // Probe for available tools
  try {
    await shell("which tesseract", 3000);
    CONFIG.ocrEngine = "tesseract";
  } catch {
    try {
      await shell("which screencapture", 3000);
      CONFIG.ocrEngine = "macos";
    } catch {
      CONFIG.ocrEngine = "mock";
    }
  }

  // Detect display availability (headless vs. display)
  if (PLATFORM === "linux") {
    try {
      await shell("echo $DISPLAY", 3000);
    } catch {
      SIMULATED = true;
      console.log("[computer] No DISPLAY found — running in simulated mode");
    }
  }

  console.log(`[computer] Initialized (platform=${PLATFORM}, ocr=${CONFIG.ocrEngine}, sim=${SIMULATED})`);
  initialized = true;
}

export function isReady(): boolean { return initialized; }