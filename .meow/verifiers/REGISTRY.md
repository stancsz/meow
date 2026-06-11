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
