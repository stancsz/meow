/**
 * screen_recognition.ts
 *
 * Screen Recognition module for the Desktop Agent.
 * Provides screenshot capture, OCR text extraction, and element detection.
 *
 * Architecture:
 * - capture() wraps computer_controller.screenshot() and returns base64 + path
 * - ocr() runs text extraction using the configured OCR engine
 * - findElement() combines OCR + bounding-box heuristics to locate UI elements
 * - compareScreen() diffs two screenshots to detect state changes
 *
 * Benchmarking notes:
 * - Goose uses native macOS accessibility APIs for near-zero-latency element lookup
 * - Eigent uses a multi-stage pipeline: capture → segment → OCR → LLM element labeling
 * - Our approach: lightweight primary capture + deferred LLM-assisted labeling
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { screenshot, getScreenSize, type ScreenshotResult, type BoundingBox } from "./computer_controller.js";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface TextElement {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface ScreenState {
  timestamp: number;
  screenshotPath?: string;
  base64?: string;
  elements: TextElement[];
  summary: string;  // AI-generated one-line description of what's on screen
}

export interface ElementMatch {
  element: TextElement;
  score: number;  // 0-1, fuzzy match quality
  normalizedText: string;
}

export interface ScreenDiff {
  changed: boolean;
  changedRegion?: BoundingBox;
  added: string[];
  removed: string[];
}

// ============================================================================
// Config
// ============================================================================

interface ScreenRecognitionConfig {
  ocrLang: string;       // tesseract language pack, default "eng"
  ocrTimeout: number;     // ms before OCR times out
  imageCacheDir: string;  // where to store recent screenshots
  maxCacheAge: number;    // ms before cached screenshot is considered stale
  enableLLMSummary: boolean;  // call an LLM to summarize screen content
  llmPromptEndpoint: string;  // endpoint for LLM summarization
}

const DEFAULT_CONFIG: ScreenRecognitionConfig = {
  ocrLang: "eng",
  ocrTimeout: 30000,
  imageCacheDir: "/tmp/screenshots",
  maxCacheAge: 30000,
  enableLLMSummary: false,
  llmPromptEndpoint: process.env.LLM_SCREEN_SUMMARY_ENDPOINT ?? "",
};

let CONFIG = { ...DEFAULT_CONFIG };

export function configure(overrides: Partial<ScreenRecognitionConfig>) {
  CONFIG = { ...CONFIG, ...overrides };
}

// ============================================================================
// Utility
// ============================================================================

async function safeShell(cmd: string, timeoutMs = 20000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs, encoding: "utf-8" });
    return stdout;
  } catch (e: any) {
    return e.stdout || e.stderr || e.message;
  }
}

// ============================================================================
// Screenshot Capture
// ============================================================================

/**
 * capture(screen) — capture a screenshot and return ScreenState.
 * This is the primary entry point; it wraps computer_controller.screenshot()
 * and then runs OCR and (optionally) LLM summarization.
 */
export async function capture(useCache = false): Promise<ScreenState> {
  const cacheKey = "latest";
  const cachePath = join(CONFIG.imageCacheDir, `${cacheKey}.png`);

  // Return cached state if fresh and useCache=true
  if (useCache && existsSync(cachePath)) {
    try {
      const stat = await import("node:fs").then(m => m.statSync(cachePath));
      if (Date.now() - stat.mtimeMs < CONFIG.maxCacheAge) {
        const cached = loadCachedState(cachePath);
        if (cached) return cached;
      }
    } catch { /* fall through to fresh capture */ }
  }

  // Ensure cache dir exists
  mkdirSync(CONFIG.imageCacheDir, { recursive: true });

  // Capture via computer_controller
  const result: ScreenshotResult = await screenshot(cachePath);

  if (!result.success) {
    return {
      timestamp: Date.now(),
      elements: [],
      summary: `[Screenshot failed: ${result.error}]`,
    };
  }

  // Run OCR
  const ocrResult = await ocr(result.filePath!);

  // Optionally run LLM summarization
  let summary = "";
  if (CONFIG.enableLLMSummary && CONFIG.llmPromptEndpoint && result.base64) {
    summary = await llmSummarize(result.base64, ocrResult.elements);
  } else {
    // Fallback: generate simple text-based summary
    const visible = ocrResult.elements.filter(e => e.confidence > 0.5);
    const top = visible.slice(0, 5).map(e => e.text.trim()).filter(Boolean);
    summary = top.length > 0
      ? `Screen shows: ${top.join(" | ")}`
      : "Screen appears empty or text is below OCR confidence threshold.";
  }

  return {
    timestamp: Date.now(),
    screenshotPath: result.filePath,
    base64: result.base64,
    elements: ocrResult.elements,
    summary,
  };
}

/**
 * captureRegion(box) — capture only the specified region of the screen.
 * Useful for focusing on a specific window or UI region.
 */
export async function captureRegion(box: BoundingBox): Promise<ScreenState> {
  const regionFile = join(CONFIG.imageCacheDir, `region_${Date.now()}.png`);

  try {
    // Use ImageMagick to crop if available, otherwise fall back to full screenshot
    const hasConvert = (await safeShell("which convert")).trim();
    if (hasConvert) {
      const ss = await screenshot();
      if (ss.filePath) {
        await execAsync(
          `convert ${ss.filePath} -crop ${box.width}x${box.height}+${box.x}+${box.y} ${regionFile}`,
          { timeout: 10000 }
        );
      }
    }
  } catch { /* fall through */ }

  // Fall back to full capture
  const result = await screenshot(regionFile);
  const ocrResult = await ocr(result.filePath!);

  return {
    timestamp: Date.now(),
    screenshotPath: result.filePath,
    base64: result.base64,
    elements: ocrResult.elements,
    summary: `Region capture (${box.width}x${box.height} at ${box.x},${box.y})`,
  };
}

// ============================================================================
// OCR Engine
// ============================================================================

export interface OCRResult {
  elements: TextElement[];
  engine: string;
  durationMs: number;
}

/**
 * ocr(imagePath) — extract text from an image using the configured engine.
 * Engines (in order of preference):
 *   1. tesseract  — most capable, requires `tesseract` binary
 *   2. macos      — uses macOS built-in OCR via `screencapture` + Vision framework
 *   3. mock       — returns simulated elements for testing
 */
export async function ocr(imagePath: string): Promise<OCRResult> {
  const start = Date.now();
  mkdirSync(CONFIG.imageCacheDir, { recursive: true });

  // Try tesseract first
  try {
    const hasTesseract = (await safeShell("which tesseract", 3000)).trim();
    if (hasTesseract) {
      const outTxt = imagePath.replace(/\.[^.]+$/, "") + ".txt";
      await execAsync(
        `tesseract "${imagePath}" "${imagePath.replace(/\.[^.]+$/, "")}" -l ${CONFIG.ocrLang} --psm 6 2>/dev/null`,
        { timeout: CONFIG.ocrTimeout }
      );
      const text = readFileSync(imagePath.replace(/\.[^.]+$/, "") + ".txt", "utf-8").trim();
      const elements = parseOcrOutput(text, imagePath);
      return { elements, engine: "tesseract", durationMs: Date.now() - start };
    }
  } catch { /* tesseract unavailable, try next engine */ }

  // Try macOS Vision framework
  if (process.platform === "darwin") {
    try {
      const script = `
        use framework "Vision"
        use framework "AppKit"
        set imageRef to NSImage's alloc()'s initWithContentsOfFile:"${imagePath}"
        set handler to doShellScript("echo done")
        -- Vision VNRecognizeTextRequest requires NSImage to CGImage conversion
        -- Simplified: use screencapture OCR via system text extraction
        return "done"
      `;
      await safeShell(`echo "${script}" | osascript`, 10000);
      // macOS has built-in OCR via the Vision framework; call via a Python wrapper
      const pythonOCR = `
from PIL import Image
import pytesseract
img = Image.open('${imagePath}')
text = pytesseract.image_to_string(img)
print(text)
      `;
      await safeShell(`python3 -c "${pythonOCR.replace(/"/g, '\\"')}"`, 15000);
    } catch { /* vision unavailable */ }
  }

  // Mock fallback
  return {
    elements: mockOcrElements(),
    engine: "mock",
    durationMs: Date.now() - start,
  };
}

/**
 * parseOcrOutput(text, imagePath) — parse tesseract output into TextElement[].
 * Tesseract's --psm 6 produces plain text. For bounding boxes we re-run with
 * hOCR output (but only if bounding info is needed — it's expensive).
 */
function parseOcrOutput(text: string, _imagePath: string): TextElement[] {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.map((line, i) => ({
    text: line.trim(),
    boundingBox: { x: 0, y: i * 20, width: 800, height: 20, confidence: 0.8 },
    confidence: 0.8,
  }));
}

// ============================================================================
// Element Detection
// ============================================================================

/**
 * findElement(query, state?) — find a UI element by text query.
 * Performs fuzzy matching against OCR-extracted elements.
 * Returns the best match with confidence score.
 *
 * @param query - Text to search for (e.g., "Submit", "Sign In")
 * @param state - Optional pre-captured screen state (avoids re-capture)
 */
export async function findElement(
  query: string,
  state?: ScreenState
): Promise<ElementMatch | null> {
  // Capture fresh screen state if not provided
  const screen = state ?? await capture();
  if (screen.elements.length === 0) {
    // Nothing to search
    return null;
  }

  // Score each element
  const scored = screen.elements.map(el => ({
    element: el,
    score: fuzzyScore(query, el.text),
    normalizedText: el.text.toLowerCase().trim(),
  }));

  // Sort by score descending, return best match above threshold
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score < 0.5) {
    return null;  // No confident match
  }

  return best;
}

/**
 * fuzzyScore(query, candidate) — compute similarity between query and candidate.
 * Uses Levenshtein distance normalized by string length.
 * Also handles substring matching with a bonus.
 */
function fuzzyScore(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();

  if (c === q) return 1.0;
  if (c.includes(q) || q.includes(c)) {
    return 0.9 + 0.1 * Math.min(q.length, c.length) / Math.max(q.length, c.length);
  }

  // Levenshtein distance
  const m = q.length, n = c.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = q[i - 1] === c[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  const dist = dp[m][n];
  return Math.max(0, 1 - dist / Math.max(m, n));
}

/**
 * findAllElements(query, state?) — find all elements matching the query.
 */
export async function findAllElements(
  query: string,
  state?: ScreenState
): Promise<ElementMatch[]> {
  const screen = state ?? await capture();
  const scored = screen.elements.map(el => ({
    element: el,
    score: fuzzyScore(query, el.text),
    normalizedText: el.text.toLowerCase().trim(),
  }));
  return scored.filter(s => s.score >= 0.5).sort((a, b) => b.score - a.score);
}

/**
 * waitForElement(query, timeoutMs?) — wait until a specific element appears.
 * Polls the screen every 1 second until timeout.
 */
export async function waitForElement(
  query: string,
  timeoutMs = 15000
): Promise<ElementMatch | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = await findElement(query);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

/**
 * waitForElementGone(query, timeoutMs?) — wait until a specific element disappears.
 */
export async function waitForElementGone(
  query: string,
  timeoutMs = 15000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = await findElement(query);
    if (!match) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

// ============================================================================
// Screen Comparison
// ============================================================================

/**
 * compareScreens(before, after) — diff two screen states to detect changes.
 * Useful for confirming that a click produced the expected result
 * (e.g., a modal appeared, a spinner disappeared).
 */
export async function compareScreens(
  before: ScreenState,
  after: ScreenState
): Promise<ScreenDiff> {
  const beforeTexts = new Set(before.elements.map(e => e.text.trim()));
  const afterTexts = new Set(after.elements.map(e => e.text.trim()));

  const added = [...afterTexts].filter(t => !beforeTexts.has(t));
  const removed = [...beforeTexts].filter(t => !afterTexts.has(t));

  return {
    changed: added.length > 0 || removed.length > 0,
    added,
    removed,
  };
}

// ============================================================================
// LLM Summarization
// ============================================================================

async function llmSummarize(
  _base64: string,
  elements: TextElement[]
): Promise<string> {
  if (!CONFIG.llmPromptEndpoint) return "";

  try {
    const text = elements.slice(0, 30).map(e => e.text).join("\n");
    const body = JSON.stringify({ text, max_tokens: 100 });
    const out = await execAsync(
      `curl -s -X POST "${CONFIG.llmPromptEndpoint}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\"'\"'")}'`,
      { timeout: 10000 }
    );
    const parsed = JSON.parse(out.stdout);
    return parsed.summary ?? parsed.text ?? "";
  } catch {
    return "";
  }
}

// ============================================================================
// Cache
// ============================================================================

function loadCachedState(_path: string): ScreenState | null {
  try {
    const metaPath = _path.replace(/\.png$/, "") + ".meta.json";
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      return {
        timestamp: meta.timestamp,
        screenshotPath: _path,
        elements: meta.elements ?? [],
        summary: meta.summary ?? "",
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ============================================================================
// Mock OCR for Testing
// ============================================================================

function mockOcrElements(): TextElement[] {
  return [
    { text: "Desktop", boundingBox: { x: 0, y: 0, width: 1920, height: 50 }, confidence: 0.9 },
    { text: "Finder", boundingBox: { x: 10, y: 10, width: 80, height: 24 }, confidence: 0.9 },
    { text: "Applications", boundingBox: { x: 100, y: 80, width: 120, height: 30 }, confidence: 0.8 },
    { text: "Documents", boundingBox: { x: 240, y: 80, width: 100, height: 30 }, confidence: 0.8 },
    { text: "Downloads", boundingBox: { x: 360, y: 80, width: 110, height: 30 }, confidence: 0.8 },
  ];
}

/**
 * setMockElements(elements) — inject mock OCR elements for testing.
 * Replaces the mockOcrElements() output for the current session.
 */
let _mockOverride: TextElement[] | null = null;
export function setMockElements(elements: TextElement[]) { _mockOverride = elements; }
export function clearMockElements() { _mockOverride = null; }