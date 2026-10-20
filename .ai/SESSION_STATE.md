## Facts
Proj:RespondersAcademy | Branch:fix/ai-connection-probe-timeout | Mode:normal | Status:feature006-done-T041-accepted-open
HEAD:75936ee | Updated:2026-10-20T18:40:00+03:00 | Pushed:origin/fix/ai-connection-probe-timeout
Dirty_paths:feature007+shared (other sessions); preserve all
Tests:{backend:1216_pass,3_known_fail(audio_wav_mp3,release_invariants),2_skip;vitest:2119_pass,1_flaky(IncidentScreen,f007);eslint_tsc_steiger_prettier:clean;e2e:student40/40,admin141/141,ai27/27,teacher_FAIL_34_37(also_without_006_changes;likely_f007,unverified)}
Not_checked:{postgres,npm_run_check_single_cmd,cloud_report_in_browser,new_key_entry_flow}

## Story
1. Feature 006 complete except T041 (owner accepted as open 2026-10-20) ✅⚠️
2. Cloud route qwen/qwen3.8-27b + cerebras/fp16 pinned (provider.only, no fallbacks); live probe ok via UI 1327ms; SC-001 2 actions ≈2.7s ✅
3. Real failure observed (network, 17:15) → banner + template → auto-recovery ok ✅
4. Probe writes ai_health; on cloud fail checks local (2s) → degraded|down ✅
5. T043/T045/T046: release_connection in llm_scope; AIRequest marker TTL 120s + fence; migration 0010 ✅

## Action
!1: Owner: enter new key via /account/ai, finish quickstart 2-6 (T041); rotate key pasted in chat.
 2: Local dev.db/demo.db lack ai_scenario_requests.started_at → app.seed.load --reset or ALTER TABLE.
 3: Verify PostgreSQL (alembic upgrade head to 0010; SAVEPOINT/JSONB marker behaviour).
 4: Recheck teacher e2e after feature 007 settles.

## Caution
⚠️ Shared dirty tree; stage only own files. Sandbox blocks loopback bind: e2e needs `JWT_SECRET=... bash backend/scripts/run_frontend_e2e.sh` outside sandbox.
