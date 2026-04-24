import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// agent-harness/computer/screen_recognition.ts
import { exec as exec2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join as join2 } from "node:path";

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
function recordAttempt(action, success, error) {
  recentAttempts.push({ action, timestamp: Date.now(), success, error });
  while (recentAttempts.length > 20)
    recentAttempts.shift();
}
var SIMULATED = process.env.SIMULATE_DESKTOP === "1";
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

// agent-harness/computer/screen_recognition.ts
var execAsync2 = promisify2(exec2);
var DEFAULT_CONFIG2 = {
  ocrLang: "eng",
  ocrTimeout: 30000,
  imageCacheDir: "/tmp/screenshots",
  maxCacheAge: 30000,
  enableLLMSummary: false,
  llmPromptEndpoint: process.env.LLM_SCREEN_SUMMARY_ENDPOINT ?? ""
};
var CONFIG2 = { ...DEFAULT_CONFIG2 };
function configure(overrides) {
  CONFIG2 = { ...CONFIG2, ...overrides };
}
async function safeShell2(cmd, timeoutMs = 20000) {
  try {
    const { stdout } = await execAsync2(cmd, { timeout: timeoutMs, encoding: "utf-8" });
    return stdout;
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}
async function capture(useCache = false) {
  const cacheKey = "latest";
  const cachePath = join2(CONFIG2.imageCacheDir, `${cacheKey}.png`);
  if (useCache && existsSync(cachePath)) {
    try {
      const stat = await import("node:fs").then((m) => m.statSync(cachePath));
      if (Date.now() - stat.mtimeMs < CONFIG2.maxCacheAge) {
        const cached = loadCachedState(cachePath);
        if (cached)
          return cached;
      }
    } catch {}
  }
  mkdirSync(CONFIG2.imageCacheDir, { recursive: true });
  const result = await screenshot(cachePath);
  if (!result.success) {
    return {
      timestamp: Date.now(),
      elements: [],
      summary: `[Screenshot failed: ${result.error}]`
    };
  }
  const ocrResult = await ocr(result.filePath);
  let summary = "";
  if (CONFIG2.enableLLMSummary && CONFIG2.llmPromptEndpoint && result.base64) {
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
async function captureRegion(box) {
  const regionFile = join2(CONFIG2.imageCacheDir, `region_${Date.now()}.png`);
  try {
    const hasConvert = (await safeShell2("which convert")).trim();
    if (hasConvert) {
      const ss = await screenshot();
      if (ss.filePath) {
        await execAsync2(`convert ${ss.filePath} -crop ${box.width}x${box.height}+${box.x}+${box.y} ${regionFile}`, { timeout: 1e4 });
      }
    }
  } catch {}
  const result = await screenshot(regionFile);
  const ocrResult = await ocr(result.filePath);
  return {
    timestamp: Date.now(),
    screenshotPath: result.filePath,
    base64: result.base64,
    elements: ocrResult.elements,
    summary: `Region capture (${box.width}x${box.height} at ${box.x},${box.y})`
  };
}
async function ocr(imagePath) {
  const start = Date.now();
  mkdirSync(CONFIG2.imageCacheDir, { recursive: true });
  try {
    const hasTesseract = (await safeShell2("which tesseract", 3000)).trim();
    if (hasTesseract) {
      const base = imagePath.replace(/\.[^.]+$/, "");
      await execAsync2(`tesseract "${imagePath}" "${base}" -l ${CONFIG2.ocrLang} --psm 6 hocr 2>/dev/null`, { timeout: CONFIG2.ocrTimeout });
      const hocrPath = base + ".hocr";
      if (existsSync(hocrPath)) {
        const hocrText = readFileSync(hocrPath, "utf-8");
        const elements2 = parseHocrOutput(hocrText, imagePath);
        if (elements2.length > 0) {
          return { elements: elements2, engine: "tesseract-hocr", durationMs: Date.now() - start };
        }
      }
      await execAsync2(`tesseract "${imagePath}" "${base}" -l ${CONFIG2.ocrLang} --psm 6 2>/dev/null`, { timeout: CONFIG2.ocrTimeout });
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
      const out = await safeShell2(`python3 -c "${pythonScript}"`, 20000);
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
    const out = await safeShell2(`identify -format "%w %h" "${imagePath}" 2>/dev/null || file "${imagePath}"`, 5000);
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
async function findAllElements(query, state) {
  const screen = state ?? await capture();
  const scored = screen.elements.map((el) => ({
    element: el,
    score: fuzzyScore(query, el.text),
    normalizedText: el.text.toLowerCase().trim()
  }));
  return scored.filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score);
}
async function waitForElement(query, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = await findElement(query);
    if (match)
      return match;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}
async function waitForElementGone(query, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = await findElement(query);
    if (!match)
      return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
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
  if (!CONFIG2.llmPromptEndpoint)
    return "";
  try {
    const text = elements.slice(0, 30).map((e) => e.text).join(`
`);
    const body = JSON.stringify({ text, max_tokens: 100 });
    const out = await execAsync2(`curl -s -X POST "${CONFIG2.llmPromptEndpoint}" -H "Content-Type: application/json" -d '${body.replace(/'/g, `'"'"'`)}'`, { timeout: 1e4 });
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
function setMockElements(elements) {
  _mockOverride = elements;
}
function clearMockElements() {
  _mockOverride = null;
}
export {
  waitForElementGone,
  waitForElement,
  setMockElements,
  ocr,
  findElement,
  findAllElements,
  configure,
  compareScreens,
  clearMockElements,
  captureRegion,
  capture
};
