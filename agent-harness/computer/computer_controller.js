import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// agent-harness/computer/computer_controller.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
var execAsync = promisify(exec);
var PLATFORM = process.platform;
var DEFAULT_CONFIG = {
  screenshotDir: "/tmp/screenshots",
  screenshotFormat: "png",
  ocrEngine: "mock",
  mouseSpeed: 50,
  confidenceThreshold: 0.85,
  hitlEnabled: true
};
var CONFIG = { ...DEFAULT_CONFIG };
function configure(overrides) {
  CONFIG = { ...CONFIG, ...overrides };
}
function getConfig() {
  return { ...CONFIG };
}
async function shell(cmd, timeoutMs = 15000) {
  return execAsync(cmd, { timeout: timeoutMs, encoding: "utf-8" });
}
async function safeShell(cmd, timeoutMs = 15000) {
  try {
    const { stdout } = await shell(cmd, timeoutMs);
    return stdout;
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}
async function platformClick(x, y, button = "left") {
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
async function platformDoubleClick(x, y) {
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
async function platformType(text) {
  const esc = (s) => s.replace(/"/g, "\\\"");
  if (PLATFORM === "darwin") {
    return shell(`osascript -e 'tell application "System Events" to keystroke "${esc(text)}"'`);
  }
  if (PLATFORM === "linux") {
    return shell(`xdotool type --delay 30 "${text.replace(/"/g, "\\\"")}"`);
  }
  if (PLATFORM === "win32") {
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text.replace(/[{}+~^()]/g, (c) => "{" + c + "}")}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}
async function platformKeyCombo(keys) {
  const k = keys.map((x) => {
    const map = {
      cmd: "command down",
      super: "command down",
      ctrl: "control down",
      control: "control down",
      alt: "option down",
      option: "option down",
      shift: "shift down",
      enter: "return",
      return: "return",
      tab: "tab",
      escape: "escape",
      esc: "escape",
      delete: "delete",
      backspace: "erase char",
      up: "key code 126",
      down: "key code 125",
      left: "key code 123",
      right: "key code 124"
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
    const winKeys = keys.map((k2) => "^" + k2).join("");
    return shell(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${winKeys}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM}`);
}
async function platformScreenshot(filePath) {
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
async function getScreenSize() {
  if (PLATFORM === "darwin") {
    const out = await shell(`osascript -e 'tell application "System Events" to get size of window 1 of process "Finder"'`);
    return { width: 1920, height: 1080 };
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
var recentAttempts = [];
var MAX_RETRY = 2;
function recordAttempt(action, success, error) {
  recentAttempts.push({ action, timestamp: Date.now(), success, error });
  while (recentAttempts.length > 20)
    recentAttempts.shift();
}
function shouldRetry(action) {
  const same = recentAttempts.filter((a) => a.action === action);
  if (same.length === 0)
    return true;
  const failures = same.filter((a) => !a.success).length;
  return failures < MAX_RETRY;
}
function describeFailure(action) {
  const same = recentAttempts.filter((a) => a.action === action && !a.success);
  if (same.length === 0)
    return "Unknown error";
  return same[same.length - 1].error ?? "Failed";
}
var SIMULATED = process.env.SIMULATE_DESKTOP === "1";
function setSimulated(v) {
  SIMULATED = v;
}
function isSimulated() {
  return SIMULATED;
}
async function simulatedClick(x, y) {
  console.log(`[computer:sim] click(${x}, ${y})`);
  await safeShell(`echo "[sim:click] x=${x} y=${y}" >> /tmp/computer_sim_log.txt`);
  return {
    success: true,
    message: `[simulated] clicked at (${x}, ${y})`,
    target: { x, y, width: 0, height: 0 }
  };
}
async function simulatedType(text) {
  console.log(`[computer:sim] type("${text.slice(0, 20)}${text.length > 20 ? "..." : ""}")`);
  await safeShell(`echo "[sim:type] text=${text}" >> /tmp/computer_sim_log.txt`);
  return { success: true, message: `[simulated] typed: ${text}`, keystrokes: text };
}
async function simulatedScreenshot() {
  const outFile = join(CONFIG.screenshotDir, `sim_${Date.now()}.png`);
  await safeShell(`mkdir -p ${CONFIG.screenshotDir}`);
  try {
    const { writeFileSync } = await import("node:fs");
    const minimalPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAAAAABhMmhJAAAADklEQVQI12NgGAWjAAMAABwAAWjmK4kAAAAASUVORK5CYII=", "base64");
    writeFileSync(outFile, minimalPng);
    return {
      success: true,
      filePath: outFile,
      base64: minimalPng.toString("base64"),
      width: 1920,
      height: 1080
    };
  } catch {
    const placeholder = Buffer.from("PLACEHOLDER_SIM_SCREENSHOT").toString("base64");
    return {
      success: true,
      filePath: outFile,
      base64: placeholder,
      width: 1920,
      height: 1080
    };
  }
}
async function click(pointOrBox, retries = MAX_RETRY) {
  const x = "x" in pointOrBox ? pointOrBox.x : pointOrBox.x;
  const y = "y" in pointOrBox ? pointOrBox.y : pointOrBox.y;
  if (SIMULATED)
    return simulatedClick(x, y);
  for (let attempt = 0;attempt <= retries; attempt++) {
    try {
      await platformClick(x, y);
      recordAttempt("click", true);
      return {
        success: true,
        message: `Clicked at (${x}, ${y})`,
        target: { x, y, width: 1, height: 1 }
      };
    } catch (e) {
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
async function doubleClick(pointOrBox) {
  const x = "x" in pointOrBox ? pointOrBox.x : pointOrBox.x;
  const y = "y" in pointOrBox ? pointOrBox.y : pointOrBox.y;
  if (SIMULATED)
    return simulatedClick(x, y);
  try {
    await platformDoubleClick(x, y);
    recordAttempt("doubleClick", true);
    return { success: true, message: `Double-clicked at (${x}, ${y})` };
  } catch (e) {
    recordAttempt("doubleClick", false, e.message);
    return { success: false, message: `Double-click failed: ${e.message}` };
  }
}
async function type(text, retries = MAX_RETRY) {
  if (SIMULATED)
    return simulatedType(text);
  const modifierMatch = text.match(/^\{(.+?)\}\s*(.*)$/);
  if (modifierMatch) {
    const keys = modifierMatch[1].split("+");
    const rest = modifierMatch[2];
    try {
      await platformKeyCombo(keys);
      if (rest)
        await platformType(rest);
      return { success: true, message: `Pressed ${keys.join("+")}${rest ? " then typed: " + rest : ""}` };
    } catch (e) {
      return { success: false, message: `Key combo failed: ${e.message}` };
    }
  }
  for (let attempt = 0;attempt <= retries; attempt++) {
    try {
      await platformType(text);
      recordAttempt("type", true);
      return { success: true, message: `Typed: ${text}`, keystrokes: text };
    } catch (e) {
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
async function pressKey(key) {
  if (SIMULATED) {
    await safeShell(`echo "[sim:key] ${key}" >> /tmp/computer_sim_log.txt`);
    return { success: true, message: `[simulated] pressed ${key}` };
  }
  try {
    await platformKeyCombo([key]);
    return { success: true, message: `Pressed: ${key}` };
  } catch (e) {
    return { success: false, message: `Key press failed: ${e.message}` };
  }
}
async function screenshot(customPath) {
  if (SIMULATED)
    return simulatedScreenshot();
  const fileName = `screenshot_${Date.now()}.${CONFIG.screenshotFormat}`;
  const filePath = customPath ?? join(CONFIG.screenshotDir, fileName);
  try {
    await safeShell(`mkdir -p ${CONFIG.screenshotDir}`);
    await platformScreenshot(filePath);
    const { width, height } = await getScreenSize();
    const base64 = await safeShell(`base64 ${filePath} 2>/dev/null | tr -d '\\n'`);
    return { success: true, filePath, base64, width, height };
  } catch (e) {
    recordAttempt("screenshot", false, e.message);
    return { success: false, error: `Screenshot failed: ${e.message}` };
  }
}
async function moveMouse(x, y) {
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
  } catch (e) {
    return { success: false, error: `Move mouse failed: ${e.message}` };
  }
}
async function openApp(name) {
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
    await safeShell("sleep 1");
    return { success: true, content: `Opened: ${name}` };
  } catch (e) {
    return { success: false, error: `openApp failed: ${e.message}` };
  }
}
async function focusWindow(appName) {
  if (SIMULATED)
    return { success: true, content: `[simulated] focused window: ${appName}` };
  try {
    if (PLATFORM === "darwin") {
      await shell(`osascript -e 'tell application "${appName}" to activate'`);
    } else if (PLATFORM === "linux") {
      await shell(`xdotool search --name "${appName}" windowactivate 2>/dev/null || xdotool search --class "${appName}" windowactivate 2>/dev/null`);
    }
    return { success: true, content: `Focused: ${appName}` };
  } catch (e) {
    return { success: false, error: `focusWindow failed: ${e.message}` };
  }
}
async function closeWindow(appName) {
  if (SIMULATED)
    return { success: true, content: `[simulated] closed window` };
  try {
    await platformKeyCombo(["cmd", "w"]);
    return { success: true, content: `Window closed` };
  } catch (e) {
    return { success: false, error: `closeWindow failed: ${e.message}` };
  }
}
async function drag(from, to) {
  if (SIMULATED) {
    await safeShell(`echo "[sim:drag] ${from.x},${from.y} -> ${to.x},${to.y}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] drag from ${JSON.stringify(from)} to ${JSON.stringify(to)}` };
  }
  try {
    if (PLATFORM === "darwin") {
      const hasCliclick = (await safeShell("which cliclick", 3000)).trim();
      if (hasCliclick) {
        await shell(`cliclick dc:${from.x},${from.y}`);
        await shell(`cliclick dd:${from.x},${from.y} dm:${to.x},${to.y} du:${to.x},${to.y}`);
      } else {
        const pyScript = [
          `import pyautogui`,
          `pyautogui.moveTo(${from.x},${from.y})`,
          `pyautogui.drag(${to.x - from.x},${to.y - from.y},duration=0.5)`
        ].join("; ");
        await shell(`python3 -c "${pyScript.replace(/"/g, "\\\"")}"`);
      }
    } else if (PLATFORM === "linux") {
      const steps = Math.max(5, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 50));
      const dx = (to.x - from.x) / steps;
      const dy = (to.y - from.y) / steps;
      await shell(`xdotool mousemove ${Math.round(from.x)} ${Math.round(from.y)} mousedown 1`);
      for (let i = 1;i <= steps; i++) {
        await shell(`xdotool mousemove ${Math.round(from.x + dx * i)} ${Math.round(from.y + dy * i)}`);
        await safeShell("sleep 0.02");
      }
      await shell("xdotool mouseup 1");
    } else {
      const psScript = [
        `Add-Type -AssemblyName System.Windows.Forms`,
        `[System.Windows.Forms.Cursor]::Position = @{X=${from.x};Y=${from.y}}`,
        `[System.Windows.Forms.Mouse]::Down()`,
        `Start-Sleep -Milliseconds 200`,
        `[System.Windows.Forms.Cursor]::Position = @{X=${to.x};Y=${to.y}}`,
        `Start-Sleep -Milliseconds 200`,
        `[System.Windows.Forms.Mouse]::Up()`
      ].join("; ");
      await shell(`powershell -c "${psScript}"`);
    }
    return { success: true, content: `Dragged from ${JSON.stringify(from)} to ${JSON.stringify(to)}` };
  } catch (e) {
    return { success: false, error: `Drag failed: ${e.message}` };
  }
}
async function scroll(direction, amount = 3) {
  if (SIMULATED) {
    await safeShell(`echo "[sim:scroll] ${direction} ${amount}" >> /tmp/computer_sim_log.txt`);
    return { success: true, content: `[simulated] scrolled ${direction} ${amount}` };
  }
  const dirMap = { up: -1, down: 1, left: -2, right: 2 };
  const btn = dirMap[direction] ?? 1;
  try {
    if (PLATFORM === "linux") {
      await shell(`xdotool click --repeat ${Math.abs(amount)} ${btn > 0 ? 5 : 4}`);
    } else {
      if (direction === "up")
        await platformKeyCombo(["fn", "up"]);
      else if (direction === "down")
        await platformKeyCombo(["fn", "down"]);
      else
        await pressKey(direction);
    }
    return { success: true, content: `Scrolled ${direction} ${amount} steps` };
  } catch (e) {
    return { success: false, error: `Scroll failed: ${e.message}` };
  }
}
async function getA11yTree() {
  if (SIMULATED) {
    return {
      elements: [
        { role: "AXWindow", title: "Finder", boundingBox: { x: 0, y: 0, width: 1920, height: 1080 }, enabled: true },
        { role: "AXButton", title: "Close", boundingBox: { x: 10, y: 10, width: 40, height: 20 }, enabled: true }
      ]
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
      const out = await shell(`osascript -e '${script.replace(/'/g, `'"'"'`)}'`);
      const elements = [];
      for (const line of out.trim().split("||")) {
        const [role, title, value] = line.split("|");
        if (role) {
          elements.push({
            role,
            title: title || undefined,
            value: value || undefined,
            boundingBox: { x: 0, y: 0, width: 100, height: 30 },
            enabled: true
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
  } catch (e) {
    return { elements: [], error: `A11y tree failed: ${e.message}` };
  }
}
var initialized = false;
async function init() {
  if (initialized)
    return;
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
function isReady() {
  return initialized;
}
export {
  type,
  setSimulated,
  scroll,
  screenshot,
  pressKey,
  openApp,
  moveMouse,
  isSimulated,
  isReady,
  init,
  getConfig,
  getA11yTree,
  focusWindow,
  drag,
  doubleClick,
  configure,
  closeWindow,
  click
};
