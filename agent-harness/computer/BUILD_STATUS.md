# Desktop Agent — Build Status

**Last updated:** 2026-04-24
**Status:** Core modules functional — all previously known bugs fixed, real hOCR bounding boxes working, macOS/Linux drag solid, auto-detection in place. Several platform-native bugs and edge cases remain (see Known Gaps).

---

## Module Inventory

| Module | File | Status | Notes |
|--------|------|--------|-------|
| Controller | `computer_controller.ts` | ✅ Functional | macOS/Linux/Windows, simulated mode, auto-detection |
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
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ Task     │  │ Observe →    │  │ Human-in-the-Loop  │     │
│  │ Parser   │→ │ Plan → Act   │→ │ Gate (HITL)         │     │
│  │          │  │ → Verify     │  │                    │     │
│  └──────────┘  └──────────────┘  └────────────────────┘     │
│                     ↓           ↓           ↓                │
│            ┌────────────────────────────────────┐           │
│            │         computer_controller.ts      │           │
│            │  click | type | screenshot | open  │           │
│            │  Linux (xdotool) | macOS | Win32    │           │
│            └────────────────────────────────────┘           │
│                     ↓           ↓                            │
│            ┌────────────────────────────────────┐           │
│            │       screen_recognition.ts         │           │
│            │  capture | ocr | findElement         │           │
│            └────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

---

## Implemented Features

### ✅ computer_controller.ts
- `click`, `doubleClick`, `type`, `pressKey` — platform-native input injection
- `screenshot`, `moveMouse`, `scroll`, `drag`
- `drag` — macOS: `cliclick` (primary) or Python/PyAutoGUI; Linux: stepwise xdotool; Windows: PowerShell `System.Windows.Forms` API
- `openApp`, `focusWindow`, `closeWindow` — window management
- `getA11yTree` — accessibility tree for element detection
- Platform detection: darwin, linux, win32
- Simulated mode (`SIMULATE_DESKTOP=1`) for Docker/headless environments
- Error recovery: retry with exponential backoff, failure logging
- `init()` auto-detects tesseract, screencapture, or DISPLAY availability at startup and enables simulated mode automatically when no display is found (Linux headless)

### ✅ screen_recognition.ts
- `capture()` — full-screen screenshot + OCR → ScreenState
- `captureRegion()` — crop a specific bounding box
- `ocr()` — tesseract hOCR (primary, real bounding boxes), tesseract text (fallback, synthesized boxes), macOS Vision (fallback), mock (testing)
- `parseHocrOutput()` — parses tesseract hOCR HTML for real pixel bounding box coordinates per word (private function, not exported)
- `parseOcrOutput()` — plain-text fallback with sensible synthesized bounding boxes (private function, not exported)
- `getImageDimensions()` — extracts image size via `identify` or `file` for accurate box sizing
- `findElement()` / `findAllElements()` — fuzzy text search on screen
- `waitForElement()` / `waitForElementGone()` — polling with timeout
- `compareScreens()` — diff two states to detect UI changes
- LLM summarization endpoint (optional)
- Mock element injection for test mode

### ✅ human_in_the_loop.ts
- `riskAssessment()` — 0–10 score based on action type + target + confidence
- `requiresApproval()` — gates MEDIUM and HIGH risk actions
- `promptHuman()` — blocks until approval/reject/timeout
- 3 trigger channels: stdout, http-callback, discord (note: `"none"` in TriggerChannel type is currently unused; `channel` only checks the 3 active channels)
- Approval queue with persistence to `/tmp/hitl_pending.json`
- CLI commands: `approve`, `reject`, `status`, `reset`
- Action type risk map (delete=8, format=10, click=2, type=1, etc.)

### ✅ computer_agent.ts
- `DesktopAgent` class with full observe→plan→act→verify loop
- Task parser: natural language → `TaskStep[]` plan
- `findAndClick` compound action: `_resolveFindAndClick()` resolves text via OCR → clicks element center; fully wired through `_executeStep`
- `executeMultiApp()` — multi-app task support (currently delegates to `execute()`)
- Step history tracking with timing, risk, and verification data
- Interactive CLI with `do`, `see`, `history`, `hitl`, `screenshot`, `quit`

---

## Benchmarking Against Peers

| Feature | Goose (Rust) | Eigent (Multi-agent) | **Our Desktop Agent** |
|---------|-------------|----------------------|------------------------|
| Input speed | Native Rust | Python + OS APIs | Bun + OS APIs |
| Screen reading | macOS A11y | Multi-stage pipeline | capture() + OCR |
| Element detection | AX tree | LLM labeling | fuzzyScore on OCR text |
| HITL gates | Not documented | Yes, approval triggers | ✅ Implemented |
| Multi-app tasks | Via IPC | Agent coordination | ✅ executeMultiApp() |
| Error recovery | Rust Result type | Retry loop | ✅ with retry + backoff |
| Simulation mode | N/A | N/A | ✅ SIMULATE_DESKTOP=1 |
| Platform | macOS primary | Cross-platform | darwin/linux/win32 |

---

## What's Working (2026-04-24)

- All 5 source modules compile and export their public APIs
- Simulation mode allows full logic testing in Docker without a display
- HITL gates fire correctly for HIGH-risk actions
- Agent can execute multi-step plans and verify screen changes via `compareScreens`
- `findAndClick` is fully dispatched through `_executeStep` → `_resolveFindAndClick()`
- Real bounding box coordinates via tesseract hOCR parsing (`parseHocrOutput`)
- macOS drag uses `cliclick` (two-phase: anchor + drag) or PyAutoGUI fallback
- Linux drag uses stepwise movement for reliability
- `init()` auto-detects OCR engine and automatically enables simulated mode when no display is found (Linux headless)
- `index.ts` correctly re-exports all types from their source modules (no non-existent types)
- Mock OCR elements can be injected for deterministic testing (`setMockElements`)

---

## Known Gaps

### 🔴 Platform-native bugs (test before production use)

| Issue | Platform | Severity | Notes |
|-------|----------|----------|-------|
| `platformKeyCombo` AppleScript broken | macOS | High | Key-down/up script produces malformed `{key,}` syntax — combo shortcuts (Cmd+C, etc.) silently fail. Needs single `keystroke` or `key code` per modifier pass |
| `focusWindow` has no win32 path | Windows | Medium | `else` branch falls through without sending any command — silently succeeds |
| `getScreenSize` on macOS falls back to 1920×1080 | macOS | Low | AppleScript queries window size of Finder, not screen size — no osascript screen-size API is used; hardcoded fallback always triggered |
| `platformKeyCombo` on Windows uses non-existent `Mouse` class | Windows | High | `[System.Windows.Forms.Mouse]::PressLeftButton()` / `Up()` are not real APIs; should use `mouse_event` or `[System.Windows.Forms.SendKeys]` instead |

### 🟡 Incomplete / unimplemented features

| Issue | Status | Notes |
|-------|--------|-------|
| No real accessibility tree on Linux | Open | `getA11yTree()` returns only window name via `xdotool getactivewindow getwindowname`; real tree would need `at-spi2` or `accerciser` |
| macOS AX tree has no real position data | Open | `getA11yTree()` extracts role/title/value but `boundingBox` is hardcoded stub `{x:0, y:0, width:100, height:30}` — `AXPosition` is not called |
| `parseHocrOutput` and `parseOcrOutput` are private | Design choice | Both functions are file-private; `parseHocrOutput` is referenced in docstrings but cannot be imported from outside. If external callers need hOCR parsing, add `export` to both |
| No LLM screen summary endpoint set | Open | `enableLLMSummary` defaults to false; set `LLM_SCREEN_SUMMARY_ENDPOINT` env var to activate |
| No config file (JSON/YAML) | Open | All config via env vars or programmatic `configure()` |
| No persistent task history | Open | history is in-memory; no disk persistence |
| `executeMultiApp()` delegates to `execute()` | Partial | Cross-app task handling is not yet differentiated from single-app; coordination logic is TODO |
| `handleCliCommand` "none" channel unused | Low | `TriggerChannel` type lists `"none"` but `_notifyChannel` only handles `"stdout"`, `"http-callback"`, `"discord"`; `"none"` falls through silently |

---

## Next Steps (in priority order)

1. ~~Fix bounding box OCR~~ — ✅ done (hOCR parsing implemented)
2. ~~Fix findAndClick dispatch~~ — ✅ done (wired through `_executeStep`)
3. ~~Fix macOS drag~~ — ✅ done (cliclick + PyAutoGUI)
4. **Fix `platformKeyCombo` on macOS** — replace broken multi-keydown AppleScript with a working keystroke approach
5. **Fix `Mouse::PressLeftButton()` on Windows** — replace with `mouse_event` or `SendKeys` equivalent
6. **Add win32 `focusWindow` implementation** — `start` or PowerShell window-activation command
7. **Test on real macOS display** — run `./test-desktop-nav.sh` outside Docker with a real screen
8. **Improve Linux A11y** — use `at-spi2` or `accerciser` for real element trees
9. **Add config file** — load settings from `computer/config.json`
10. **Integrate with relay.ts** — expose `desktop-agent` as a Discord command or skill
11. **Add performance benchmarks** — measure click latency vs. Goose

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