# Desktop Agent — Build Status

**Last updated:** 2026-04-24
**Status:** Core modules fully functional — all critical bugs fixed, hOCR bounding boxes implemented, macOS drag improved

---

## Module Inventory

| Module | File | Status | Notes |
|--------|------|--------|-------|
| Controller | `computer_controller.ts` | ✅ Complete | macOS/Linux/Windows, simulated mode |
| Screen Recognition | `screen_recognition.ts` | ✅ Complete | Tesseract/macOS/Vision/mock engines |
| Human-in-the-Loop | `human_in_the_loop.ts` | ✅ Complete | Risk scoring, approval gates, 3 channels |
| Agent Orchestrator | `computer_agent.ts` | ✅ Complete | Plan→Act→Verify loop, HITL integration |
| Test Script | `test-desktop-nav.sh` | ✅ Complete | 7 test phases, Bun/Node compatible |
| Entry Point | `index.ts` | ✅ Complete | Type + function re-exports |

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
- `drag` — macOS: `cliclick` (primary) or Python/PyAutoGUI; Linux: stepwise xdotool; Windows: PowerShell
- `openApp`, `focusWindow`, `closeWindow` — window management
- `getA11yTree` — accessibility tree for element detection
- Platform detection: darwin, linux, win32
- Simulated mode (`SIMULATE_DESKTOP=1`) for Docker/headless environments
- Error recovery: retry with exponential backoff, failure logging

### ✅ screen_recognition.ts
- `capture()` — full-screen screenshot + OCR → ScreenState
- `captureRegion()` — crop a specific bounding box
- `ocr()` — tesseract hOCR (primary, real bounding boxes), tesseract text (fallback, synthesized boxes), macOS Vision (fallback), mock (testing)
- `parseHocrOutput()` — parses tesseract hOCR HTML for real pixel bounding box coordinates per word
- `parseOcrOutput()` — plain-text fallback with sensible synthesized bounding boxes (image-height/N per line)
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
- 4 trigger channels: stdout, discord, http-callback, none
- Approval queue with persistence to `/tmp/hitl_pending.json`
- CLI commands: `approve`, `reject`, `status`, `reset`
- Action type risk map (delete=8, format=10, click=2, type=1, etc.)

### ✅ computer_agent.ts
- `DesktopAgent` class with full observe→plan→act→verify loop
- Task parser: natural language → `TaskStep[]` plan
- `findAndClick` compound action: `_resolveFindAndClick()` resolves text via OCR → clicks element center; fully wired through `_executeStep` (was previously parsed but never dispatched)
- Multi-app task support via `executeMultiApp()`
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

- All 4 core modules compile and export their public APIs
- Simulation mode allows full logic testing in Docker without a display
- HITL gates fire correctly for HIGH-risk actions
- Agent can execute multi-step plans and verify screen changes
- Test script covers 7 phases from module loading to multi-app tasks
- `findAndClick` is now fully dispatched (was parsed but never executed)
- Real bounding box coordinates via tesseract hOCR parsing
- macOS drag uses `cliclick` or PyAutoGUI (was broken AppleScript workaround)
- Linux drag uses stepwise movement for reliability
- All type exports in `index.ts` are valid (non-existent types removed)

---

## Known Gaps

| Gap | Severity | Status | Notes |
|-----|----------|--------|-------|
| No real element-position OCR | Medium | ✅ Fixed | `parseHocrOutput()` parses tesseract hOCR output for real bbox coords |
| No real mouse drag on macOS | Medium | ✅ Fixed | `drag()` now uses `cliclick` (preferred) or Python/PyAutoGUI fallback |
| No real accessibility tree on Linux | Medium | Open | `getA11yTree()` returns only window name on Linux |
| Linux drag is single-step teleportation | Low | ✅ Fixed | Stepwise movement now used for reliability |
| No LLM screen summary endpoint set | Low | Open | `enableLLMSummary` defaults to false; set `LLM_SCREEN_SUMMARY_ENDPOINT` |
| No config file (JSON/YAML) | Low | Open | All config via env vars or programmatic `configure()` |
| No persistent task history | Low | Open | history is in-memory; no disk persistence |
| No `findAndClick` dispatch in `_executeStep` | Critical | ✅ Fixed | `findAndClick` steps now route through `_resolveFindAndClick()` |
| `index.ts` exported non-existent types | Critical | ✅ Fixed | Removed `OCRResult` and `HumanApproval` from `computer_controller.js` exports |

---

## Next Steps (in priority order)

1. ~~Fix bounding box OCR~~ — ✅ done (hOCR parsing implemented)
2. ~~Fix findAndClick dispatch~~ — ✅ done (wired through `_executeStep`)
3. ~~Fix macOS drag~~ — ✅ done (cliclick + PyAutoGUI)
4. **Test on real macOS display** — run `./test-desktop-nav.sh` outside Docker with a real screen
5. **Improve Linux A11y** — use `at-spi2` or `accerciser` for real element trees
6. **Add config file** — load settings from `computer/config.json`
7. **Integrate with relay.ts** — expose `desktop-agent` as a Discord command or skill
8. **Add performance benchmarks** — measure click latency vs. Goose

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