# EVOLVE: Research & Learn from Other Agents
[EPOCH: WAITING_FOR_DOGFOOD]

## Epoch Gate System

**CRITICAL RULE:** EVOLVE cannot start a new epoch until DOGFOOD validates the PREVIOUS epoch's promised capabilities.

Each EVOLVE iteration follows this cycle:
1. **Research** → Find a pattern/capability to adopt
2. **Promise** → Document what will be implemented (exact feature name)
3. **Wait** → DOGFOOD must validate it works before EVOLVE continues

## Research Targets (choose one per epoch)
- **Cursor** - Streaming, code fence handling, context management
- **Claude Code** - Tool permissions, slash commands, session management
- **Builder.io** - Component generation, iterative refinement
- **Windsurf** - Cascade architecture, multi-agent coordination

## Output: Epoch Promise
Write to `/app/agent-harness/evolve/epoch/{epoch-n}/{promise.md`:
```
=== EPOCH PROMISE ===

## Capability to Implement
{Name of exact feature}

## What It Does
{1-2 sentence description}

## Implementation Criteria (how DOGFOOD will validate)
1. {Specific test case}
2. {Specific test case}
3. {Must be reproducible}

## From Research: {Source}
{Who has this pattern and how do they do it?}
```

## Epoch History
- Epoch 1-6: Completed (see evolve/research/)
- Epoch 7: IN PROGRESS - Focus on P0 fixes from cross-tool synthesis

---

# DOGFOOD: Validate & Fix Capabilities
[EPOCH: MUST_VALIDATE_EVOLVE]

## Mission
**BLOCK EVOLVE until promised capabilities are REAL and WORKING.**

## Validation Method
For each promise from EVOLVE's epoch:
1. Read the promise file at `/app/agent-harness/evolve/epoch/{n}/promise.md`
2. Execute the exact test cases listed in "Implementation Criteria"
3. If tests PASS: Write validation to `/app/agent-harness/dogfood/validation/{epoch-n}-{capability}.json`
4. If tests FAIL: Mark as SLOPPY and report what specifically is broken

## Validation Output Format
```json
{
  "epoch": 7,
  "capability": "{name}",
  "status": "VALIDATED | SLOPPY | NOT_IMPLEMENTED",
  "tests": [
    { "name": "test case 1", "result": "PASS | FAIL", "evidence": "..." }
  ],
  "verdict": "Detailed assessment - is this real or fake?",
  "blocking": true | false
}
```

## If SLOPPY Implementation Found
1. Report exactly what's wrong (be specific - not "it's broken" but "X function returns Y instead of Z when condition W")
2. Suggest exact fix
3. Re-run after fix to confirm

## If VALIDATED
1. Notify "EVOLVE can proceed to next epoch"
2. Mark capability as "proven" in CAPABILITY_STATUS.md

---

# DESIGN: Prototype UI for Validated Capabilities
[EPOCH: WAITING_FOR_VALIDATION]

## Mission
Design human-agent interfaces for capabilities that have been VALIDATED by DOGFOOD.

## Rules
- Only prototype for capabilities that have `status: VALIDATED` in dogfood validation/
- Do NOT design for capabilities that are still in research or sloppy implementation

## Design Targets (validated capabilities only)
- After Epoch 7 validates "code fence aware chunking" → Design streaming progress indicator
- After Epoch 7 validates "TokenBuffer" → Design agent "thinking" indicator

## Output
Write proposals to `/app/agent-harness/design/proposals/{validated-capability}-{date}.md`
