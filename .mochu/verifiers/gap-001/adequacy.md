# gap-001: Heartbeat verifier suite

## Gap

Heartbeat verifier suite from Do-Not-Repeat drawers (spawn, stdin, @file, stub read-back, exit contract)

## Dimension

reliability-errors

## Claims

1. `meow birth` prints a valid birth prompt without spawning
2. `meow -p` spawns a `claude -p` session that completes successfully
3. The @file prompt mechanism works on Windows (the spawn workaround)
4. Files written by the agent are not stubs (stub read-back verification)
5. The heartbeat enforces the exit contract (session boundary ownership)

## Verifiers

### v001-1: birth_prompt_valid
Tests that `meow birth` produces valid output without spawning.

### v001-2: spawn_completes
Tests that `meow -p` spawns and the session completes with exit code 0.

### v001-3: at_file_prompt_mechanism
Tests that the @file prompt mechanism works correctly.

### v001-4: no_stub_writes
Tests that agent-written files are not stubs (≥10 non-empty lines).

### v001-5: exit_contract_enforced
Tests that the heartbeat enforces session boundary rules.

## Lazy artifacts this suite blocks

1. **Half-done version**: Just the `meow birth` command works but `-p` mode is broken
2. **Presence-without-substance**: `meow -p` runs but produces no real work
3. **Works-on-happy-path-only**: Basic spawn works but Windows edge cases fail