# verifier registry — the ratchet's index (append-only)

Every verifier must be listed here. Removals require INBOX ack.

| id | dimension | claim | run command | iter |
|---|---|---|---|---|
| v001-1 | reliability-errors | meow birth produces valid birth prompt | python3 .mochu/verifiers/gap-001/v001-1_birth_prompt_valid.py | iter-1 |
| v001-2 | reliability-errors | meow -p spawns claude session without crash | python3 .mochu/verifiers/gap-001/v001-2_spawn_completes.py | iter-1 |
| v001-3 | reliability-errors | @file prompt mechanism works on Windows | python3 .mochu/verifiers/gap-001/v001-3_at_file_prompt.py | iter-1 |
| v001-4 | reliability-errors | Files written are not stubs (>=10 non-empty lines) | python3 .mochu/verifiers/gap-001/v001-4_no_stub_writes.py | iter-1 |
| v001-5 | reliability-errors | Exit contract enforced via ship_gate.py | python3 .mochu/verifiers/gap-001/v001-5_exit_contract.py | iter-1 |
| v003-1 | developer-experience | legacy-swarm branch exists | python3 .mochu/verifiers/gap-003/v003-1_legacy_branch_exists.py | iter-2 |
| v003-2 | developer-experience | src/swarm/ and quantum files deleted from main | python3 .mochu/verifiers/gap-003/v003-2_swarm_deleted.py | iter-2 |
| v003-3 | developer-experience | quantum-circuit, blessed, blessed-contrib, ws removed from package.json | python3 .mochu/verifiers/gap-003/v003-3_deps_stripped.py | iter-2 |
| v003-4 | developer-experience | heartbeat still works after W2 deletions | python3 .mochu/verifiers/gap-003/v003-4_heartbeat_works.py | iter-2 |
| v006-1 | performance | baseline.json exists with valid non_core_loc | python3 .mochu/verifiers/gap-006/v006-1_baseline_exists.py | iter-3 |
| v006-2 | performance | baseline non_core_loc is lower than W0 baseline (22911) | python3 .mochu/verifiers/gap-006/v006-2_thinning_ratchet.py | iter-3 |
| v006-3 | performance | current src/ LOC count and delta from baseline | python3 .mochu/verifiers/gap-006/v006-3_loc_count.py | iter-3 |
| v006-4 | performance | ship_gate.py includes thinning enforcement | python3 .mochu/verifiers/gap-006/v006-4_ship_gate_ratchet.py | iter-3 |