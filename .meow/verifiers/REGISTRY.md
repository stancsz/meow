# verifier registry — the ratchet's index (append-mostly)

Every verifier file must be listed here with what it protects.
Removals require an INBOX entry and human ack.

| id | file | protects |
|---|---|---|
| v0001 | v0001_scaffold_integrity.py | the Nine Lives skeleton: required files exist, are non-stub, governor scripts run |
| v0002 | v0002_one_life_e2e.py | one mocked life runs end-to-end: birth → ledger entry → ship_gate green |
| v001-1 | v001-1_birth_prompt_valid.py | meow birth produces valid birth prompt (non-empty, structured) |
| v001-2 | v001-2_spawn_completes.py | meow birth assembles prompt and logs the birth event (pre-spawn heartbeat mechanics) |
| v001-3 | v001-3_at_file_prompt.py | @file prompt mechanism works on Windows |
| v001-4 | v001-4_no_stub_writes.py | Files written are not stubs (≥10 non-empty lines for .md) |
| v001-5 | v001-5_exit_contract.py | Exit contract enforced via ship_gate.py |
| v003-1 | v003-1_legacy_branch_exists.py | W2: legacy-swarm branch exists and has commits |
| v003-2 | v003-2_swarm_deleted.py | W2: src/swarm/ and quantum files deleted from main |
| v003-3 | v003-3_deps_stripped.py | W2: quantum-circuit, blessed, blessed-contrib, ws removed from package.json |
| v003-4 | v003-4_heartbeat_works.py | W2: heartbeat still works after W2 deletions (regression) |
| v006-1 | v006-1_baseline_exists.py | thinning ratchet: baseline.json exists with valid non_core_loc |
| v006-2 | v006-2_thinning_ratchet.py | thinning ratchet: baseline < W0 baseline (monotone down) |
| v006-3 | v006-3_loc_count.py | thinning ratchet: current src/ LOC <= baseline non_core_loc |
| v006-4 | v006-4_ship_gate_ratchet.py | thinning ratchet: ship_gate.py includes thinning enforcement |
| v008-1 | developer-experience | W3: src/agent/ deleted from main | python3 .meow/verifiers/v008-1_agent_deleted.py |
| v008-2 | developer-experience | W3: src/orchestrator/, kernel/, cli/ deleted | python3 .meow/verifiers/v008-2_orchestrator_deleted.py |
| v008-3 | developer-experience | W3: heartbeat still works after deletions (regression) | python3 .meow/verifiers/v008-3_heartbeat_works_w3.py |
| v008-4 | developer-experience | W3: thinning ratchet holds (src/ LOC <= baseline) | python3 .meow/verifiers/v008-4_thinning_ratchet_w3.py |
| v008-5 | developer-experience | W3: no typecheck errors in core (bin/, scripts/, skills/) | python3 .meow/verifiers/v008-5_typecheck_passes.py |
| v009-1 | developer-experience | W4: src/extensions/, mcp/, eval/ deleted | python3 .meow/verifiers/v009-1_ext_mcp_eval_deleted.py |
| v009-2 | developer-experience | W4: .husky/, dist-runtime/, scratch/, legacy skills deleted | python3 .meow/verifiers/v009-2_perimeter_cleaned.py |
| v009-3 | developer-experience | W4: heartbeat works after perimeter deletions (regression) | python3 .meow/verifiers/v009-3_heartbeat_works_w4.py |
| v009-4 | developer-experience | W4: thinning ratchet holds after W4 | python3 .meow/verifiers/v009-4_thinning_ratchet_w4.py |
| v009-5 | developer-experience | W4: src/ contains only core dirs | python3 .meow/verifiers/v009-5_src_empty.py |
| v010-1 | developer-experience | W5: src/ deleted from main | python3 .meow/verifiers/v010-1_src_deleted.py |
| v010-2 | developer-experience | W5: heartbeat works after W5 (regression) | python3 .meow/verifiers/v010-2_heartbeat_works_w5.py |
| v010-3 | developer-experience | W5: thinning ratchet holds (src/ LOC = 0) | python3 .meow/verifiers/v010-3_thinning_ratchet_w5.py |
| v010-4 | developer-experience | W5: package.json has no src/ references | python3 .meow/verifiers/v010-4_no_src_refs.py |
| v010-5 | developer-experience | W5: typecheck passes on core | python3 .meow/verifiers/v010-5_typecheck_clean.py |
