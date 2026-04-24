# Desktop Agent — Build Status

**Last updated:** 2026-04-24
**Status:** `computer_controller.ts` is the primary implementation module. All 12 tool primitives are fully implemented and compile. Four high-severity platform bugs remain unfixed; several features are stub-only on specific platforms.

---

## Module Inventory

| Module | File | Status | Notes |
|--------|------|--------|-------|
| Controller | `computer_controller.ts` | 🟡 Partial | 12/12 primitives implemented; 5 platform bugs: macOS key combo malformed AppleScript, Windows click/doubleClick/drag all use non-existent `Mouse` class APIs; `focusWindow` silent no-op on win32; no real A11y positions |
| Screen Recognition | `screen_recognition.ts` | ✅ Functional | Tesseract/macOS/Vision/mock engines, real bbox via hOCR |
| Human-in-the-Loop | `human_in_the_loop.ts` | ✅ Functional | Risk scoring, approval gates, 3 trigger channels |
| Agent Orchestrator | `computer_agent.ts` | ✅ Functional | Plan→Act→Verify loop, HITL integration, CLI |
| Test Script | `test-desktop-nav.sh` | ✅ Functional | 7 test phases, Bun/Node compatible |
| Entry Point | `index.ts` | ✅ Functional | Type + function re-exports |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    computer_agent.ts                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Task     │  │ Observe →    │  │ Human-in-the-Loop  │    │
│  │ Parser   │→ │ Plan → Act   │→ │ Gate (HITL)         │    │
│  │          │  │ → Verify     │  │                    │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
│                     ↓           ↓           ↓                 │
│            ┌────────────────────────────────────┐          │
│            │         computer_controller.ts      │          │
│            │  click | type | screenshot | open  │          │
│            │  Linux (xdotool) | macOS | Win32    │          │
│            └────────────────────────────────────┘          │
│                     ↓           ↓                           │
│            ┌────────────────────────────────────┐          │
│            │       screen_recognition.ts         │          │
│            │  capture | ocr | findElement         │          │
│            └────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implemented Features

### ✅ `computer_controller.ts` — Fully Implemented

#### Core Input Primitives
- **`click(pointOrBox)`** — click at (x, y); accepts `Point` or `BoundingBox`; retries up to `MAX_RETRY` (2); falls back to simulated mode when `SIMULATE_DESKTOP=1`
- **`doubleClick(pointOrBox)`** — double-click at coordinates; no retry loop
- **`type(text)`** — type text at cursor; supports inline modifier prefixes (`{Ctrl+C}`); retries with backoff
- **`pressKey(key)`** — press single key (enter, tab, escape, arrows, etc.); logs to sim log in simulated mode
- **`moveMouse(x, y)`** — move pointer without clicking; platform-native (`osascript` / `xdotool` / PowerShell)

#### Drag and Scroll
- **`drag(from, to)`** — drag from one point to another
  - macOS: `cliclick dc:/dd:/dm:/du:` sequence (anchor-based, two-phase); falls back to Python/PyAutoGUI if `cliclick` not installed
  - Linux: stepwise movement via `xdotool mousemove → mousedown → n×mousemove → mouseup` (avoids pointer teleportation)
  - Windows: PowerShell `System.Windows.Forms.Cursor.Position` + `Mouse::Down()/Up()` + `Start-Sleep` delays
- **`scroll(direction, amount)`** — scroll the active window
  - Linux: `xdotool click --repeat N 5/4`
  - macOS/Windows: `fn+up`/`fn+down` key combos via `platformKeyCombo`

#### Screen Capture
- **`screenshot(customPath?)`** — captures full screen, saves to file, returns `filePath` + `base64` + dimensions; auto-creates output directory
  - macOS: `screencapture -x -t png/jpeg`
  - Linux: `scrot` (primary), `gnome-screenshot` (fallback)
  - Windows: `System.Windows.Forms.Screen.PrimaryScreen.Bitmap.Save`

#### Window and App Management
- **`openApp(name)`** — launch app by name (`open -a` / `xdg-open` / `gtk-launch` / `Start-Process`); includes 1-second launch delay
- **`focusWindow(appName)`** — bring app window to front; macOS uses `activate`; Linux uses `xdotool search --name/--class windowactivate`; **win32 path missing (falls through silently)**
- **`closeWindow(appName?)`** — closes frontmost window via `Cmd+W` (all platforms use same key combo)

#### Accessibility
- **`getA11yTree()`** — returns flat list of `A11yElement` (role, title, value, boundingBox, enabled) for the frontmost window
  - Simulated mode: returns hardcoded Finder window + Close button
  - macOS: AppleScript `entire contents of win` (role/title/value extracted; **boundingBox is stub** `{x:0,y:0,w:100,h:30}` — `AXPosition`/`AXSize` not called)
  - Linux: `xdotool getactivewindow getwindowname` only (**no real element tree**)
  - Windows: not implemented (returns error)

#### Configuration and Lifecycle
- **`configure(overrides)`** / **`getConfig()`** — programmatic config with `Partial<ComputerControllerConfig>`; fields: `screenshotDir`, `screenshotFormat`, `ocrEngine`, `mouseSpeed`, `confidenceThreshold`, `hitlEnabled`
- **`init()`** — auto-detects OCR engine (tesseract → macOS screencapture → mock) and display availability; automatically enables simulated mode on Linux if `$DISPLAY` is unset
- **`setSimulated(v)`** / **`isSimulated()`** — control simulated mode programmatically
- **`isReady()`** — returns `initialized` flag

#### Error Recovery
- Retry loop (`MAX_RETRY = 2`) with `shouldRetry()` and `describeFailure()` helpers
- `recordAttempt()` keeps a sliding window of the last 20 attempts per action
- `safeShell()` suppresses exceptions, returning stdout/stderr string

---

## What's Working (2026-04-24)

- All 12 tool primitives compile and execute: `click`, `doubleClick`, `type`, `pressKey`, `moveMouse`, `screenshot`, `drag`, `scroll`, `openApp`, `closeWindow`, `focusWindow`, `getA11yTree`
- `focusWindow` works on macOS (AppleScript `activate`) and Linux (xdotool `search --name/--class windowactivate`); **silently returns success without action on Windows**
- Simulation mode (`SIMULATE_DESKTOP=1`) enables full logic testing in Docker without a display — all primitives log to `/tmp/computer_sim_log.txt`; `simulatedScreenshot()` generates a valid minimal PNG via pure Node.js
- `init()` auto-detects: tesseract → macOS screencapture → mock; also auto-enables simulated mode on headless Linux (no `$DISPLAY`)
- Linux `drag` uses stepwise mouse movement (avoids pointer teleportation across large distances)
- macOS `drag` uses `cliclick` (anchor-based, reliable) with PyAutoGUI fallback
- Linux `scroll` uses `xdotool click --repeat N` (reliable); macOS/Windows use `fn+up/down` key combos via `platformKeyCombo`
- Error recovery retry loops fire correctly on transient failures (up to 2 retries per action, with `shouldRetry` and `describeFailure` helpers)
- HITL gates (defined in `human_in_the_loop.ts`) can gate `click`/`type` actions based on risk scoring
- `getA11yTree()` on macOS correctly extracts a flat element list via AppleScript `entire contents of win` — bounding boxes are all stubs (`{x:0,y:0,w:100,h:30}`) since `AXPosition`/`AXSize` are never called
- `getA11yTree()` on Linux returns only the window name via `xdotool getactivewindow getwindowname` (no real element tree)
- `getA11yTree()` on Windows returns `{ elements: [], error: "A11y not supported on this platform" }` immediately (falls through all platform branches)
- `closeWindow` uses `Cmd+W` via `platformKeyCombo` on all platforms (universally correct)
- `pressKey` on macOS generates AppleScript with comma-separated `{key1}, {key2}` multi-keydown syntax that AppleScript rejects for key combinations — **macOS key combos silently fail**

---

## Known Gaps

### 🔴 Platform-native bugs (test before production use)

| Issue | Platform | Severity | Details |
|-------|----------|----------|---------|
| `platformKeyCombo` AppleScript produces malformed syntax | macOS | **High** | The generated script uses `{key1}, {key2}` multi-keydown syntax which AppleScript rejects for key combinations. `keystroke` with `using` modifier clause or separate `key down`/`key up` per modifier would work; current output silently fails |
| Windows `drag` uses non-existent `Mouse` class | Windows | **High** | `[System.Windows.Forms.Mouse]::PressLeftButton()` / `Up()` / `Down()` are not real APIs on that class; `mouse_event` (deprecated) or P/Invoke `SetSystemMouse` are alternatives |
| `focusWindow` win32 path falls through silently | Windows | Medium | The `else` branch in `focusWindow` sends no command and returns `success: true` — window focus is unchanged |
| `getScreenSize` macOS always returns 1920×1080 | macOS | Low | AppleScript queries Finder window size (not screen size); no `osascript` screen-size API is called; fallback is always triggered |
| Windows `doubleClick` uses non-existent `Mouse.DoubleClick()` | Windows | **High** | `[System.Windows.Forms.Mouse]::DoubleClick()` is not a real API; the `doubleClick` tool will silently fail on win32 |
| Windows `click` uses non-existent `Mouse::PressLeftButton()` | Windows | **High** | `[System.Windows.Forms.Mouse]::PressLeftButton()` is not a real API; the `click` tool falls through to the throw on win32 |

### 🟡 Incomplete / unimplemented features

| Issue | Status | Details |
|-------|--------|---------|
| No real A11y element positions on macOS | Open | `getA11yTree()` extracts role/title/value via AppleScript but never calls `AXPosition` or `AXSize`; all bounding boxes are hardcoded stubs `{x:0,y:0,w:100,h:30}` |
| No real A11y tree on Linux | Open | `getA11yTree()` returns only window name via `xdotool`; real tree requires `at-spi2`, `accerciser`, or similar |
| `getA11yTree` Windows not implemented | Open | Falls through all platform branches; returns `{ elements: [], error: "A11y not supported on this platform" }` |
| No Scenic integration | Open | File header mentions Scenic/A11y as a cross-platform fallback; `computer_controller.ts` has no Scenic code |
| No LLM screen summary | Open | `enableLLMSummary` defaults to false in `screen_recognition.ts`; set `LLM_SCREEN_SUMMARY_ENDPOINT` to activate |
| No config file (JSON/YAML) | Open | All config via env vars or programmatic `configure()` call |
| No persistent task history | Open | `computer_agent.ts` step history is in-memory only; no disk persistence |
| `executeMultiApp()` not differentiated | Open | In `computer_agent.ts`; currently delegates to `execute()` without cross-app coordination |
| OCR parsers are file-private | Design choice | `parseHocrOutput` and `parseOcrOutput` in `screen_recognition.ts` are not exported; external callers cannot import hOCR parsing directly |

---

## Next Steps (in priority order)

1. ~~Fix bounding box OCR~~ — ✅ done (`parseHocrOutput` with real pixel coordinates in `screen_recognition.ts`)
2. ~~Fix findAndClick dispatch~~ — ✅ done (wired through `_executeStep` in `computer_agent.ts`)
3. ~~Fix macOS drag~~ — ✅ done (`cliclick` + PyAutoGUI fallback)
4. **Fix `platformKeyCombo` on macOS** — replace broken multi-keydown AppleScript with working `keystroke "x" using {command down}` or single `key down`/`key up` per modifier
5. **Fix `Mouse::Down()/Up()` on Windows drag** — replace with `mouse_event` (deprecated WinAPI) or P/Invoke `SetSystemMouse`
6. **Fix Windows `click` and `doubleClick`** — `[System.Windows.Forms.Mouse]::PressLeftButton()` and `Mouse::DoubleClick()` are not real APIs; replace with `Cursor.Position` + proper mouse event calls
7. **Add win32 `focusWindow` implementation** — PowerShell `Start-Process` or `SetForegroundWindow` WinAPI call
8. **Add Windows `getA11yTree`** — Windows has `Accessibility` API (`AccExplorer32`, UI Automation API) but no Node.js wrapper in this codebase
9. **Fix macOS `getA11yTree` bounding boxes** — add `position of elem` / `size of elem` AppleScript calls to get real screen coordinates
10. **Improve Linux A11y** — `at-spi2` or `accerciser` bindings for real element tree
11. **Add config file** — load settings from `computer/config.json` in `init()`
12. **Integrate with relay.ts** — expose `desktop-agent` as a Discord command or skill
13. **Add performance benchmarks** — measure click/screenshot latency vs. Goose (Rust)

---

## How to Run

```bash
# In simulated mode (Docker / headless):
SIMULATE_DESKTOP=1 bun run computer_agent.ts

# Interactive CLI:
bun run computer_agent.ts
# > do Open Safari, type 'test', press Enter

# Run tests:
chmod +x test-desktop-nav.sh
./test-desktop-nav.sh

# Via module:
import { desktopAgent, executeTask } from "./computer/index.ts";
const result = await desktopAgent.execute("Open Chrome and search for 'AI news'");
```
