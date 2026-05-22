# Test Report - 2026-05-21

## Test Results Summary

```
Test Files:  34 passed | 1 skipped (35)
Tests:       179 passed | 2 skipped (181)
Duration:    3.60s
```

All tests passing as of 2026-05-21.

## Updated: gemini-2.0-flash → gemini-3.5-flash

Google deprecated Gemini 2.0 Flash on June 1, 2026. Updated all references:
- `src/liaison/Liaison.ts`: `fastModel` default
- `src/orchestrator/Orchestrator.ts`: ECOMODE model
- `tests/orchestrator/ExecutionMode.test.ts`: test assertion

## TypeScript / Lint Status

```
✖ 576 problems (0 errors, 576 warnings)
```

All warnings are pre-existing `Unexpected any` in `src/types/tool.ts`.

## Docs Cleanup Verification

Deleted:
- `docs/GAP_ANALYSIS.md` (duplicate)
- `docs/assets/repo_map.md` (duplicate)
- `docs/learn.md` (duplicate of ARCHITECTURAL_GAP_ANALYSIS.md)
- `docs/gaps.md` (duplicate)
- `docs/processed/*` (archived to `docs/archive/`)
- `docs/gap-analysis-vs-kitchen-factory/*` (archived)

Remaining canonical docs in `docs/`:
- `ARCHITECTURAL_GAP_ANALYSIS.md`
- `PUBLISH.md`
- `ROADMAP.md`
- `TOKEN_OPTIMIZATION_STRATEGY.md`
- `TUI_SPEC.md`
- `assets/image.png`

## Model Research (via WebFetch, not WebSearch)

Google deprecated `gemini-2.0-flash` on **June 1, 2026**.

Current stable Gemini lineup (from [ai.google.dev/models](https://ai.google.dev/models)):
- **Gemini 3.5 Flash** — stable, most intelligent for sustained frontier performance on agentic and coding tasks
- **Gemini 3.5 Flash-Lite** — stable/preview, fast and budget-friendly
- **Gemini 3.1 Pro** — preview, advanced intelligence, complex problem-solving, agentic coding
- **Gemini 2.5 Pro** — most advanced for complex tasks with deep reasoning and coding

Pricing (from [ai.google.dev/pricing](https://ai.google.dev/pricing)):
- **Gemini 3.5 Flash**: Input free, Output free (standard batch still paid)
- **Gemini 3.5 Flash-Lite**: Most budget-friendly in the family
- Batch pricing: $0.05/M input tokens, $0.20/M output tokens (text/image/video)

**No Haiku equivalent in current Gemini lineup** — Google's budget model is Flash-Lite, not a separate Haiku brand like Anthropic.

**Note:** WebSearch API is currently failing (returns 400 invalid params), but WebFetch works directly against Google docs.