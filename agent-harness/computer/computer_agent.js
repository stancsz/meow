import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// agent-harness/computer/computer_controller.js
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

// agent-harness/computer/screen_recognition.js
import { exec as exec2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join as join2 } from "node:path";
import { exec as exec3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
import { join as join3 } from "node:path";
var execAsync2 = promisify3(exec3);
var PLATFORM2 = process.platform;
var DEFAULT_CONFIG2 = {
  screenshotDir: "/tmp/screenshots",
  screenshotFormat: "png",
  ocrEngine: "mock",
  mouseSpeed: 50,
  confidenceThreshold: 0.85,
  hitlEnabled: true
};
var CONFIG2 = { ...DEFAULT_CONFIG2 };
async function shell2(cmd, timeoutMs = 15000) {
  return execAsync2(cmd, { timeout: timeoutMs, encoding: "utf-8" });
}
async function safeShell2(cmd, timeoutMs = 15000) {
  try {
    const { stdout } = await shell2(cmd, timeoutMs);
    return stdout;
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}
async function platformScreenshot2(filePath) {
  if (PLATFORM2 === "darwin") {
    return shell2(`screencapture -x -t ${CONFIG2.screenshotFormat === "jpg" ? "jpeg" : "png"} ${filePath}`);
  }
  if (PLATFORM2 === "linux") {
    try {
      return await shell2(`scrot ${filePath}`);
    } catch {
      return await shell2(`gnome-screenshot -f ${filePath}`);
    }
  }
  if (PLATFORM2 === "win32") {
    return shell2(`powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bitmap.Save('${filePath.replace(/\\/g, "\\\\")}')"`);
  }
  throw new Error(`Unsupported platform: ${PLATFORM2}`);
}
async function getScreenSize2() {
  if (PLATFORM2 === "darwin") {
    const out = await shell2(`osascript -e 'tell application "System Events" to get size of window 1 of process "Finder"'`);
    return { width: 1920, height: 1080 };
  }
  if (PLATFORM2 === "linux") {
    try {
      const out = await shell2(`xdotool getdisplaygeometry`);
      const [w, h] = out.trim().split(" ");
      return { width: parseInt(w), height: parseInt(h) };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }
  if (PLATFORM2 === "win32") {
    return { width: 1920, height: 1080 };
  }
  return { width: 1920, height: 1080 };
}
var recentAttempts2 = [];
function recordAttempt2(action, success, error) {
  recentAttempts2.push({ action, timestamp: Date.now(), success, error });
  while (recentAttempts2.length > 20)
    recentAttempts2.shift();
}
var SIMULATED2 = process.env.SIMULATE_DESKTOP === "1";
async function simulatedScreenshot2() {
  const outFile = join3(CONFIG2.screenshotDir, `sim_${Date.now()}.png`);
  await safeShell2(`mkdir -p ${CONFIG2.screenshotDir}`);
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
async function screenshot2(customPath) {
  if (SIMULATED2)
    return simulatedScreenshot2();
  const fileName = `screenshot_${Date.now()}.${CONFIG2.screenshotFormat}`;
  const filePath = customPath ?? join3(CONFIG2.screenshotDir, fileName);
  try {
    await safeShell2(`mkdir -p ${CONFIG2.screenshotDir}`);
    await platformScreenshot2(filePath);
    const { width, height } = await getScreenSize2();
    const base64 = await safeShell2(`base64 ${filePath} 2>/dev/null | tr -d '\\n'`);
    return { success: true, filePath, base64, width, height };
  } catch (e) {
    recordAttempt2("screenshot", false, e.message);
    return { success: false, error: `Screenshot failed: ${e.message}` };
  }
}
var execAsync22 = promisify2(exec2);
var DEFAULT_CONFIG22 = {
  ocrLang: "eng",
  ocrTimeout: 30000,
  imageCacheDir: "/tmp/screenshots",
  maxCacheAge: 30000,
  enableLLMSummary: false,
  llmPromptEndpoint: process.env.LLM_SCREEN_SUMMARY_ENDPOINT ?? ""
};
var CONFIG22 = { ...DEFAULT_CONFIG22 };
async function safeShell22(cmd, timeoutMs = 20000) {
  try {
    const { stdout } = await execAsync22(cmd, { timeout: timeoutMs, encoding: "utf-8" });
    return stdout;
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}
async function capture(useCache = false) {
  const cacheKey = "latest";
  const cachePath = join2(CONFIG22.imageCacheDir, `${cacheKey}.png`);
  if (useCache && existsSync(cachePath)) {
    try {
      const stat = await import("node:fs").then((m) => m.statSync(cachePath));
      if (Date.now() - stat.mtimeMs < CONFIG22.maxCacheAge) {
        const cached = loadCachedState(cachePath);
        if (cached)
          return cached;
      }
    } catch {}
  }
  mkdirSync(CONFIG22.imageCacheDir, { recursive: true });
  const result = await screenshot2(cachePath);
  if (!result.success) {
    return {
      timestamp: Date.now(),
      elements: [],
      summary: `[Screenshot failed: ${result.error}]`
    };
  }
  const ocrResult = await ocr(result.filePath);
  let summary = "";
  if (CONFIG22.enableLLMSummary && CONFIG22.llmPromptEndpoint && result.base64) {
    summary = await llmSummarize(result.base64, ocrResult.elements);
  } else {
    const visible = ocrResult.elements.filter((e) => e.confidence > 0.5);
    const top = visible.slice(0, 5).map((e) => e.text.trim()).filter(Boolean);
    summary = top.length > 0 ? `Screen shows: ${top.join(" | ")}` : "Screen appears empty or text is below OCR confidence threshold.";
  }
  return {
    timestamp: Date.now(),
    screenshotPath: result.filePath,
    base64: result.base64,
    elements: ocrResult.elements,
    summary
  };
}
async function ocr(imagePath) {
  const start = Date.now();
  mkdirSync(CONFIG22.imageCacheDir, { recursive: true });
  try {
    const hasTesseract = (await safeShell22("which tesseract", 3000)).trim();
    if (hasTesseract) {
      const base = imagePath.replace(/\.[^.]+$/, "");
      await execAsync22(`tesseract "${imagePath}" "${base}" -l ${CONFIG22.ocrLang} --psm 6 hocr 2>/dev/null`, { timeout: CONFIG22.ocrTimeout });
      const hocrPath = base + ".hocr";
      if (existsSync(hocrPath)) {
        const hocrText = readFileSync(hocrPath, "utf-8");
        const elements2 = parseHocrOutput(hocrText, imagePath);
        if (elements2.length > 0) {
          return { elements: elements2, engine: "tesseract-hocr", durationMs: Date.now() - start };
        }
      }
      await execAsync22(`tesseract "${imagePath}" "${base}" -l ${CONFIG22.ocrLang} --psm 6 2>/dev/null`, { timeout: CONFIG22.ocrTimeout });
      const text = readFileSync(base + ".txt", "utf-8").trim();
      const { width = 1920, height = 1080 } = await getImageDimensions(imagePath);
      const elements = parseOcrOutput(text, imagePath, width, height);
      return { elements, engine: "tesseract-text", durationMs: Date.now() - start };
    }
  } catch (e) {}
  if (process.platform === "darwin") {
    try {
      const pythonScript = [
        `from PIL import Image`,
        `import pytesseract`,
        `img = Image.open('${imagePath.replace(/'/g, `'"'"'`)}')`,
        `text = pytesseract.image_to_string(img)`,
        `print(text)`
      ].join("; ");
      const out = await safeShell22(`python3 -c "${pythonScript}"`, 20000);
      const { width = 1920, height = 1080 } = await getImageDimensions(imagePath);
      return {
        elements: parseOcrOutput(out.trim(), imagePath, width, height),
        engine: "macos-vision",
        durationMs: Date.now() - start
      };
    } catch {}
  }
  return {
    elements: _mockOverride ?? mockOcrElements(),
    engine: "mock",
    durationMs: Date.now() - start
  };
}
function parseHocrOutput(html, imagePath) {
  const elements = [];
  const wordRe = /<span\b[^>]*\btitle="bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^"]*"[^>]*>([^<]+)<\/span>/gi;
  let match;
  while ((match = wordRe.exec(html)) !== null) {
    const x1 = parseInt(match[1], 10);
    const y1 = parseInt(match[2], 10);
    const x2 = parseInt(match[3], 10);
    const y2 = parseInt(match[4], 10);
    const confMatch = match[0].match(/x_wconf\s+(\d+)/i);
    const confidence = confMatch ? parseInt(confMatch[1], 10) / 100 : 0.85;
    const text = decodeHtmlEntities(match[5].trim());
    if (text.length > 0) {
      elements.push({
        text,
        boundingBox: {
          x: x1,
          y: y1,
          width: Math.max(1, x2 - x1),
          height: Math.max(1, y2 - y1),
          confidence
        },
        confidence
      });
    }
  }
  if (elements.length === 0) {
    const lineRe = /<span\b[^>]*\bclass="[^"]*ocr_line[^"]*"[^>]*\btitle="bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    while ((match = lineRe.exec(html)) !== null) {
      const x1 = parseInt(match[1], 10);
      const y1 = parseInt(match[2], 10);
      const x2 = parseInt(match[3], 10);
      const y2 = parseInt(match[4], 10);
      const lineHtml = match[5];
      const text = decodeHtmlEntities(lineHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (text.length > 0) {
        elements.push({
          text,
          boundingBox: {
            x: x1,
            y: y1,
            width: Math.max(1, x2 - x1),
            height: Math.max(1, y2 - y1),
            confidence: 0.8
          },
          confidence: 0.8
        });
      }
    }
  }
  return elements;
}
function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}
async function getImageDimensions(imagePath) {
  try {
    const out = await safeShell22(`identify -format "%w %h" "${imagePath}" 2>/dev/null || file "${imagePath}"`, 5000);
    const parts = out.trim().split(/\s+/);
    if (parts.length >= 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (w > 0 && h > 0)
        return { width: w, height: h };
    }
  } catch {}
  return { width: 1920, height: 1080 };
}
function parseOcrOutput(text, _imagePath, imageWidth = 1920, imageHeight = 1080) {
  const lines = text.split(`
`).filter((l) => l.trim().length > 0);
  if (lines.length === 0)
    return [];
  const lineHeight = Math.max(10, Math.floor(imageHeight / lines.length));
  const padding = 4;
  return lines.map((line, i) => ({
    text: line.trim(),
    boundingBox: {
      x: padding,
      y: i * lineHeight,
      width: imageWidth - padding * 2,
      height: lineHeight,
      confidence: 0.7
    },
    confidence: 0.7
  }));
}
async function findElement(query, state) {
  const screen = state ?? await capture();
  if (screen.elements.length === 0) {
    return null;
  }
  const scored = screen.elements.map((el) => ({
    element: el,
    score: fuzzyScore(query, el.text),
    normalizedText: el.text.toLowerCase().trim()
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score < 0.5) {
    return null;
  }
  return best;
}
function fuzzyScore(query, candidate) {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (c === q)
    return 1;
  if (c.includes(q) || q.includes(c)) {
    return 0.9 + 0.1 * Math.min(q.length, c.length) / Math.max(q.length, c.length);
  }
  const m = q.length, n = c.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1;i <= m; i++) {
    for (let j = 1;j <= n; j++) {
      dp[i][j] = q[i - 1] === c[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  const dist = dp[m][n];
  return Math.max(0, 1 - dist / Math.max(m, n));
}
async function compareScreens(before, after) {
  const beforeTexts = new Set(before.elements.map((e) => e.text.trim()));
  const afterTexts = new Set(after.elements.map((e) => e.text.trim()));
  const added = [...afterTexts].filter((t) => !beforeTexts.has(t));
  const removed = [...beforeTexts].filter((t) => !afterTexts.has(t));
  return {
    changed: added.length > 0 || removed.length > 0,
    added,
    removed
  };
}
async function llmSummarize(_base64, elements) {
  if (!CONFIG22.llmPromptEndpoint)
    return "";
  try {
    const text = elements.slice(0, 30).map((e) => e.text).join(`
`);
    const body = JSON.stringify({ text, max_tokens: 100 });
    const out = await execAsync22(`curl -s -X POST "${CONFIG22.llmPromptEndpoint}" -H "Content-Type: application/json" -d '${body.replace(/'/g, `'"'"'`)}'`, { timeout: 1e4 });
    const parsed = JSON.parse(out.stdout);
    return parsed.summary ?? parsed.text ?? "";
  } catch {
    return "";
  }
}
function loadCachedState(_path) {
  try {
    const metaPath = _path.replace(/\.png$/, "") + ".meta.json";
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      return {
        timestamp: meta.timestamp,
        screenshotPath: _path,
        elements: meta.elements ?? [],
        summary: meta.summary ?? ""
      };
    }
  } catch {}
  return null;
}
function mockOcrElements() {
  return [
    { text: "Desktop", boundingBox: { x: 0, y: 0, width: 1920, height: 50 }, confidence: 0.9 },
    { text: "Finder", boundingBox: { x: 10, y: 10, width: 80, height: 24 }, confidence: 0.9 },
    { text: "Applications", boundingBox: { x: 100, y: 80, width: 120, height: 30 }, confidence: 0.8 },
    { text: "Documents", boundingBox: { x: 240, y: 80, width: 100, height: 30 }, confidence: 0.8 },
    { text: "Downloads", boundingBox: { x: 360, y: 80, width: 110, height: 30 }, confidence: 0.8 }
  ];
}
var _mockOverride = null;

// agent-harness/computer/human_in_the_loop.js
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync, mkdirSync as mkdirSync2 } from "node:fs";
var DEFAULT_CONFIG3 = {
  enabled: true,
  defaultThreshold: "MEDIUM",
  timeoutMs: 60000,
  channel: "stdout",
  autoApproveLowRisk: true
};
var CONFIG3 = { ...DEFAULT_CONFIG3 };
var PENDING_FILE = "/tmp/hitl_pending.json";
var pendingRequest = null;
var resolveApproval = null;
function riskAssessment(action) {
  let score = 0;
  const reasons = [];
  const actionRiskMap = {
    click: 2,
    type: 1,
    screenshot: 0,
    ocr: 0,
    openApp: 1,
    focusWindow: 1,
    scroll: 1,
    delete: 8,
    move: 7,
    rename: 5,
    copy: 3,
    send: 7,
    submit: 5,
    login: 4,
    format: 10,
    shutdown: 10,
    reboot: 9,
    download: 4,
    upload: 5,
    install: 6,
    exec: 6,
    shell: 7
  };
  const base = actionRiskMap[action.tool] ?? 3;
  score += base;
  if (base >= 5)
    reasons.push(`Action type '${action.tool}' is high-risk`);
  if (action.target) {
    const t = action.target.toLowerCase();
    if (/delete|remove|trash|rm\s|drop\s|drop\sdatabase/i.test(t)) {
      score += 3;
      reasons.push("Target involves deletion");
    }
    if (/system|boot|partition|disk|email|bank|password|\.env|credential/i.test(t)) {
      score += 2;
      reasons.push("Sensitive target detected");
    }
    if (/send\semail|post\sto|tweet|submit\sform/i.test(t)) {
      score += 2;
      reasons.push("Irreversible communication action");
    }
    if (/\.(sh|ps1|bash|exe|dmg|app|deb|rpm|msi)/i.test(t)) {
      score += 1;
      reasons.push("Executable file operation");
    }
  }
  if (action.confidence !== undefined && action.confidence < 0.8) {
    const penalty = Math.round((0.8 - action.confidence) * 20);
    score += penalty;
    if (penalty > 0)
      reasons.push(`Low element confidence (${Math.round(action.confidence * 100)}%) adds risk`);
  }
  if (action.details) {
    if (/\brm\s+-rf\b/i.test(action.details)) {
      score += 4;
      reasons.push("Recursive force delete detected");
    }
    if (/sudo|root|admin/i.test(action.details)) {
      score += 1;
      reasons.push("Privileged operation");
    }
  }
  score = Math.min(10, score);
  const level = score >= 8 ? "HIGH" : score >= 5 ? "MEDIUM" : "LOW";
  return { level, score, reasons, suggestion: score >= 5 ? "Consider asking for human approval" : undefined };
}
function requiresApproval(action) {
  if (!CONFIG3.enabled)
    return false;
  const { level } = riskAssessment(action);
  if (CONFIG3.autoApproveLowRisk && level === "LOW")
    return false;
  if (CONFIG3.defaultThreshold === "LOW")
    return true;
  if (CONFIG3.defaultThreshold === "MEDIUM" && level !== "LOW")
    return true;
  if (CONFIG3.defaultThreshold === "HIGH" && level === "HIGH")
    return true;
  return false;
}
async function promptHuman(action) {
  const risk = riskAssessment(action);
  const request = {
    id: Math.random().toString(36).slice(2, 10),
    action,
    risk,
    timestamp: Date.now(),
    resolved: false,
    approved: null
  };
  pendingRequest = request;
  _persistPending(request);
  await _notifyChannel(request);
  return new Promise((resolve) => {
    resolveApproval = resolve;
    const timeout = setTimeout(() => {
      if (!request.resolved) {
        request.resolved = true;
        request.approved = false;
        request.resolvedAt = Date.now();
        _clearPending();
        console.log(`[hitl] ⏱️  Approval timeout after ${CONFIG3.timeoutMs}ms — defaulting to DENY`);
        resolve(false);
      }
    }, CONFIG3.timeoutMs);
    const doResolve = (approved) => {
      clearTimeout(timeout);
      request.resolved = true;
      request.approved = approved;
      request.resolvedAt = Date.now();
      _clearPending();
      resolve(approved);
    };
    resolveApproval = doResolve;
  });
}
function approve(requestId) {
  if (pendingRequest && (!requestId || pendingRequest.id === requestId)) {
    const approved = true;
    if (resolveApproval) {
      resolveApproval(approved);
      resolveApproval = null;
    }
    console.log(`[hitl] ✅ Approved: ${pendingRequest.action.tool} on ${pendingRequest.action.target ?? "unknown"}`);
    return true;
  }
  console.warn(`[hitl] No pending request to approve (id: ${requestId})`);
  return false;
}
function reject(requestId) {
  if (pendingRequest && (!requestId || pendingRequest.id === requestId)) {
    const approved = false;
    if (resolveApproval) {
      resolveApproval(approved);
      resolveApproval = null;
    }
    console.log(`[hitl] ❌ Rejected: ${pendingRequest.action.tool} on ${pendingRequest.action.target ?? "unknown"}`);
    return true;
  }
  console.warn(`[hitl] No pending request to reject (id: ${requestId})`);
  return false;
}
async function _notifyChannel(request) {
  const { tool, target, details } = request.action;
  const { level, score } = request.risk;
  const icon = level === "HIGH" ? "\uD83D\uDD34" : level === "MEDIUM" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
  const msg = [
    `${icon} **Human Approval Required**`,
    `Action: \`${tool}\`${target ? ` targeting \`${target}\`` : ""}`,
    `Risk: ${level} (score ${score}/10)`,
    details ? `Details: ${details}` : "",
    `Timeout: ${Math.round(CONFIG3.timeoutMs / 1000)}s`,
    "",
    `Approve: \`/hitl approve ${request.id}\``,
    `Reject: \`/hitl reject ${request.id}\``
  ].filter(Boolean).join(`
`);
  if (CONFIG3.channel === "stdout") {
    console.log(`
` + msg + `
`);
  } else if (CONFIG3.channel === "http-callback" && CONFIG3.httpCallbackUrl) {
    await _httpNotify(msg, request);
  } else if (CONFIG3.channel === "discord" && CONFIG3.discordChannelId) {
    const notifPath = "/tmp/hitl_notification.json";
    writeFileSync(notifPath, JSON.stringify({ request, message: msg, channelId: CONFIG3.discordChannelId }));
    console.log(`[hitl] Discord notification written to ${notifPath}`);
  }
}
async function _httpNotify(msg, request) {
  try {
    const { exec: exec4 } = await import("node:child_process");
    const { promisify: promisify4 } = await import("node:util");
    const execAsync3 = promisify4(exec4);
    const body = JSON.stringify({
      id: request.id,
      action: request.action,
      risk: request.risk,
      message: msg,
      timestamp: request.timestamp
    });
    await execAsync3(`curl -s -X POST "${CONFIG3.httpCallbackUrl}" -H "Content-Type: application/json" -d '${body.replace(/'/g, `'"'"'`)}'`, { timeout: 1e4 });
    console.log(`[hitl] HTTP callback sent to ${CONFIG3.httpCallbackUrl}`);
  } catch (e) {
    console.warn(`[hitl] HTTP callback failed: ${e.message}`);
  }
}
function _persistPending(request) {
  try {
    mkdirSync2("/tmp", { recursive: true });
    writeFileSync(PENDING_FILE, JSON.stringify(request, null, 2));
  } catch (e) {
    console.warn(`[hitl] Could not persist pending request: ${e.message}`);
  }
}
function _clearPending() {
  pendingRequest = null;
  resolveApproval = null;
  try {
    if (existsSync2(PENDING_FILE)) {
      writeFileSync(PENDING_FILE, JSON.stringify({ cleared: true, at: Date.now() }));
    }
  } catch {}
}
function reset() {
  _clearPending();
  try {
    if (existsSync2(PENDING_FILE))
      writeFileSync(PENDING_FILE, "");
  } catch {}
}
function handleCliCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts[1];
  if (cmd === "approve" || cmd === "yes" || cmd === "y") {
    const ok = approve(arg);
    return ok ? "✅ Request approved." : "❌ No pending request.";
  }
  if (cmd === "reject" || cmd === "no" || cmd === "n") {
    const ok = reject(arg);
    return ok ? "❌ Request rejected." : "❌ No pending request.";
  }
  if (cmd === "status") {
    const p = pendingRequest;
    if (!p)
      return "No pending approval requests.";
    return `Pending: [${p.risk.level}] ${p.action.tool} — ${p.action.target ?? "unknown"} (id: ${p.id})`;
  }
  if (cmd === "reset") {
    reset();
    return "HITL state reset.";
  }
  return `Unknown command: ${cmd}. Use: approve, reject, status, reset`;
}

// agent-harness/computer/computer_agent.ts
var DEFAULT_CONFIG4 = {
  maxSteps: 50,
  maxRetries: 2,
  stepDelayMs: 500,
  verifyAfterEachStep: true,
  stopOnVerificationFailure: true,
  hitlEnabled: true
};

class DesktopAgent {
  config;
  history = [];
  currentStep = 0;
  lastScreenState = null;
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG4, ...config };
  }
  async init() {
    await init();
  }
  isReady() {
    return isReady();
  }
  async execute(task) {
    this.history = [];
    this.currentStep = 0;
    console.log(`[agent] \uD83C\uDFAF Starting task: "${task}"`);
    if (!this.isReady()) {
      await this.init();
    }
    const steps = this._parseTask(task);
    console.log(`[agent] \uD83D\uDCCB Plan: ${steps.length} step(s)`);
    for (const [i, s] of steps.entries()) {
      console.log(`[agent]   ${i + 1}. ${s.description} (${s.tool})`);
    }
    await this._observeScreen();
    const results = [];
    for (let i = 0;i < steps.length && i < this.config.maxSteps; i++) {
      this.currentStep = i;
      const step = steps[i];
      console.log(`[agent] → Step ${i + 1}: ${step.description}`);
      const result = await this._executeStep(step, i);
      results.push(result);
      if (!result.success && (!step.retries || step.retries <= 0)) {
        if (this.config.stopOnVerificationFailure) {
          console.log(`[agent] ⛔ Step failed, stopping.`);
          break;
        }
      }
      if (i < steps.length - 1) {
        await this._sleep(this.config.stepDelayMs);
      }
    }
    const success = results.every((r) => r.success);
    return {
      success,
      steps: results,
      summary: success ? `✅ Completed ${results.length} step(s) successfully.` : `⚠️  ${results.filter((r) => !r.success).length}/${results.length} steps failed.`
    };
  }
  async _executeStep(step, stepIndex) {
    const startTime = Date.now();
    if (step.tool === "findAndClick") {
      return this._resolveFindAndClick(step.args.text, step, stepIndex, startTime);
    }
    const action = {
      tool: step.tool,
      target: step.args.target,
      details: JSON.stringify(step.args),
      screenSummary: this.lastScreenState?.summary
    };
    const risk = riskAssessment(action);
    const needsApproval = this.config.hitlEnabled && requiresApproval(action);
    const icon = risk.level === "HIGH" ? "\uD83D\uDD34" : risk.level === "MEDIUM" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
    console.log(`[agent]   ${icon} Risk: ${risk.level} (${risk.score}/10) — ${risk.reasons.join("; ") || "no factors"}`);
    const beforeState = this.lastScreenState;
    let approved = true;
    if (needsApproval && risk.level !== "LOW") {
      console.log(`[agent]   ⏸️  Waiting for human approval...`);
      approved = await promptHuman(action);
      if (!approved) {
        return this._makeStepResult(step, stepIndex, startTime, action, risk, approved, {
          success: false,
          error: "Human rejected this action"
        });
      }
      console.log(`[agent]   ✅ Human approved — proceeding`);
    }
    let result;
    let execError;
    try {
      result = await this._dispatchAction(step.tool, step.args);
    } catch (e) {
      execError = e.message;
    }
    await this._sleep(300);
    const afterState = await this._observeScreen();
    let verified = false;
    let diff = [];
    if (this.config.verifyAfterEachStep && afterState && beforeState) {
      const diffResult = await compareScreens(beforeState, afterState);
      diff = [...diffResult.added, ...diffResult.removed];
      verified = true;
      console.log(`[agent]   \uD83D\uDD0D Screen diff: ${diff.length > 0 ? diff.slice(0, 3).join(", ") : "no visible change"}`);
    }
    const durationMs = Date.now() - startTime;
    const success = !execError;
    return {
      step: stepIndex + 1,
      description: step.description,
      tool: step.tool,
      action,
      risk,
      approved,
      startTime,
      endTime: Date.now(),
      durationMs,
      success,
      result,
      error: execError,
      verified,
      screenDiff: diff.length > 0 ? diff : undefined
    };
  }
  async _dispatchAction(tool, args) {
    switch (tool) {
      case "click":
        return click(args.target);
      case "doubleClick":
        return doubleClick(args.target);
      case "type":
        return type(args.text);
      case "pressKey":
        return pressKey(args.key);
      case "openApp":
        return openApp(args.name);
      case "focusWindow":
        return focusWindow(args.name);
      case "closeWindow":
        return closeWindow(args.name);
      case "moveMouse":
        return moveMouse(args.x, args.y);
      case "scroll":
        return scroll(args.direction, args.amount);
      case "drag":
        return drag(args.from, args.to);
      case "screenshot":
        return screenshot(args.path);
      case "findAndClick": {
        const text = args.text;
        const match = await findElement(text, this.lastScreenState ?? undefined);
        if (!match)
          throw new Error(`findAndClick: element not found: "${text}"`);
        const target = match.element.boundingBox;
        return click({ x: Math.round(target.x + target.width / 2), y: Math.round(target.y + target.height / 2) });
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }
  async _observeScreen() {
    try {
      this.lastScreenState = await capture();
      return this.lastScreenState;
    } catch (e) {
      console.warn(`[agent] Screen observation failed: ${e.message}`);
      return null;
    }
  }
  _parseTask(task) {
    const steps = [];
    const lower = task.toLowerCase();
    const segments = task.replace(/,\s+then\s+/gi, " | ").replace(/,\s+and\s+/gi, " | ").replace(/\s+then\s+/gi, " | ").replace(/ then /gi, " | ").split(" | ");
    for (const seg of segments) {
      const s = seg.trim();
      if (!s)
        continue;
      const sl = s.toLowerCase();
      const openMatch = s.match(/^(?:open|launch|start)\s+(?:the\s+)?(?:app\s+)?([A-Za-z0-9 \-\.]+?)(?:\s+and|\s+then|\s*,|$)/i);
      if (openMatch) {
        const name = openMatch[1].trim();
        if (name) {
          steps.push({
            description: `Open ${name}`,
            tool: "openApp",
            args: { name }
          });
          continue;
        }
      }
      const typeMatch = s.match(/(?:type|type\s+(?:in|into)\s+)(?:['"“](.+?)['"“]|(\S+))/i);
      if (typeMatch) {
        const text = typeMatch[1] ?? typeMatch[2] ?? "";
        steps.push({ description: `Type: ${text}`, tool: "type", args: { text } });
        continue;
      }
      const keyMatch = s.match(/(?:press|hit)\s+(enter|tab|escape|space|return|backspace)/i);
      if (keyMatch) {
        steps.push({ description: `Press ${keyMatch[1]}`, tool: "pressKey", args: { key: keyMatch[1] } });
        continue;
      }
      if (/scroll\s+(up|down|left|right)/i.test(sl)) {
        const dir = sl.includes("up") ? "up" : sl.includes("down") ? "down" : sl.includes("left") ? "left" : "right";
        const amt = parseInt(s.match(/(\d+)\s+times?/)?.[1] ?? "3");
        steps.push({ description: `Scroll ${dir}`, tool: "scroll", args: { direction: dir, amount: amt } });
        continue;
      }
      const clickMatch = s.match(/click\s+(?:on\s+)?(?:['"“](.+?)['"“]|(\S+))(?:\s+button)?/i);
      if (clickMatch) {
        const targetText = clickMatch[1] ?? clickMatch[2] ?? "";
        steps.push({
          description: `Click: ${targetText}`,
          tool: "findAndClick",
          args: { text: targetText }
        });
        continue;
      }
      if (sl.includes("screenshot") || sl.includes("capture screen") || sl.includes("take a picture")) {
        steps.push({ description: "Take screenshot", tool: "screenshot", args: {} });
        continue;
      }
      if (/close\s+(window|tab)/i.test(sl)) {
        steps.push({ description: "Close window", tool: "closeWindow", args: {} });
        continue;
      }
      if (s.length > 0 && s.length < 200) {
        steps.push({
          description: `Click: ${s}`,
          tool: "findAndClick",
          args: { text: s }
        });
      }
    }
    return steps;
  }
  async _resolveFindAndClick(text, step, stepIndex, startTime) {
    let match = await findElement(text, this.lastScreenState ?? undefined);
    if (!match) {
      await this._observeScreen();
      match = await findElement(text, this.lastScreenState ?? undefined);
    }
    if (!match) {
      return this._makeStepResult(step, stepIndex, startTime, { tool: "findAndClick", target: text }, riskAssessment({ tool: "click", target: text }), true, { success: false, error: `Could not find element: "${text}" on screen` });
    }
    const target = match.element.boundingBox;
    const point = {
      x: Math.round(target.x + target.width / 2),
      y: Math.round(target.y + target.height / 2)
    };
    const action = {
      tool: "click",
      target: text,
      details: JSON.stringify(point),
      screenSummary: this.lastScreenState?.summary,
      confidence: match.score
    };
    const risk = riskAssessment(action);
    const needsApproval = this.config.hitlEnabled && requiresApproval(action);
    if (needsApproval && risk.level !== "LOW") {
      console.log(`[agent]   ⏸️  Waiting for human approval...`);
      const approved = await promptHuman(action);
      if (!approved) {
        return this._makeStepResult(step, stepIndex, startTime, action, risk, false, { success: false, error: "Human rejected" });
      }
      console.log(`[agent]   ✅ Human approved — proceeding`);
    }
    const result = await click(point);
    await this._sleep(300);
    const afterState = await this._observeScreen();
    let diff = [];
    if (this.config.verifyAfterEachStep && afterState && this.lastScreenState) {
      const diffResult = await compareScreens(this.lastScreenState, afterState);
      diff = [...diffResult.added, ...diffResult.removed];
      console.log(`[agent]   \uD83D\uDD0D Screen diff: ${diff.length > 0 ? diff.slice(0, 3).join(", ") : "no visible change"}`);
    }
    return this._makeStepResult(step, stepIndex, startTime, action, risk, true, { ...result, after: afterState, screenDiff: diff });
  }
  async executeMultiApp(task) {
    return this.execute(task);
  }
  getHistory() {
    return [...this.history];
  }
  getLastScreen() {
    return this.lastScreenState;
  }
  _makeStepResult(step, stepIndex, startTime, action, risk, approved, result) {
    const endTime = Date.now();
    const r = result;
    const success = r.success ?? true;
    const sr = {
      step: stepIndex + 1,
      description: step.description,
      tool: step.tool,
      action,
      risk,
      approved,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      success,
      result,
      error: r.error,
      verified: r.after !== undefined
    };
    this.history.push(sr);
    return sr;
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async runCli() {
    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    await this.init();
    const prompt = () => rl.question("desktop-agent> ", async (input) => {
      const cmd = input.trim();
      if (!cmd) {
        prompt();
        return;
      }
      if (cmd === "quit" || cmd === "exit") {
        rl.close();
        return;
      }
      if (cmd === "see") {
        const state = await this._observeScreen();
        console.log(`
Screen: ${state?.summary ?? "unknown"}
`);
        console.log(`Elements (${state?.elements.length ?? 0}):`);
        state?.elements.slice(0, 20).forEach((e) => {
          console.log(`  [${e.boundingBox.x},${e.boundingBox.y}] ${e.text.slice(0, 60)}`);
        });
        prompt();
        return;
      }
      if (cmd.startsWith("hitl ")) {
        console.log(handleCliCommand(cmd.slice(4)));
        prompt();
        return;
      }
      if (cmd === "history") {
        this.history.forEach((h) => {
          const icon = h.success ? "✅" : "❌";
          console.log(`${icon} Step ${h.step}: ${h.description} (${h.durationMs}ms)`);
        });
        prompt();
        return;
      }
      if (cmd === "screenshot") {
        const state = await capture();
        console.log(`Screenshot saved: ${state.screenshotPath}`);
        prompt();
        return;
      }
      if (cmd.startsWith("do ")) {
        const task = cmd.slice(3);
        const result = await this.execute(task);
        console.log(`
${result.summary}
`);
        result.steps.forEach((s) => {
          const icon = s.success ? "✅" : "❌";
          const risk = s.risk.level === "LOW" ? "\uD83D\uDFE2" : s.risk.level === "MEDIUM" ? "\uD83D\uDFE1" : "\uD83D\uDD34";
          console.log(`${icon} ${s.description} [${risk}${s.risk.level}] ${s.durationMs}ms`);
          if (s.error)
            console.log(`   Error: ${s.error}`);
        });
        prompt();
        return;
      }
      console.log(`Unknown command: ${cmd}. Try: do <task>, see, history, hitl, screenshot, quit`);
      prompt();
    });
    console.log("Desktop Agent CLI (type 'quit' to exit)");
    console.log("Commands: do <task>, see, history, hitl, screenshot, quit");
  }
}
var desktopAgent = new DesktopAgent;
async function executeTask(task) {
  return desktopAgent.execute(task);
}
export {
  executeTask,
  desktopAgent,
  DesktopAgent
};
