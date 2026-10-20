## Facts
Proj:RespondersAcademy | Branch:feat/008-full-cycle-review | Mode:normal | Status:feature006-phase8-incomplete
HEAD:bd29eaeef7b01c666571759d26f7929aadccf5c3 "fix: страница отчёта занятия не падает на сводке ошибок бэкенда"
Updated:2026-10-20T16:12:00+03:00 | Dirty_paths:250
Files_changed:[feature006,feature007,feature008,shared; preserve all]
Runtime:live front :3130 stale build + backend :8130; preserve .next and backend/var/demo.db
Tests:{backend_full:1153_pass,4_fail,2_skip;feature006_ai_suite:125/125;ReportSession:10/10}
Checks:{ruff_backend:pass,diff_check:pass,focused_eslint_prettier:pass,npm_full:6_known_failures,npm_check:feature007_lint_block,e2e:blocked,visual:not_run}

## Story
1. Feature 006 T018, T040, T041 remain open; T022-T039, T044 complete ✅
2. T044: fixed probe timeout — freed request db session before probe reservation (no SQLite lock contention), dynamic remaining timeout to httpx ✅
2. Daily quota uses atomic ai_health calls_today + probe_calls_today reservations before cloud HTTP ✅
3. Scenario source stays generated for access semantics; generation.provider reports actual source ✅
4. Report-level AI comment now renders once; attempt comments remain attached to their own attempts ✅
5. T043 tracks request DB connection retention during model I/O; full gate is not green ⚠️

## Reasoning
Scenario.source=generated > template: preserve permissions, deletion, and deduplication semantics.
probe_calls_today > calls_today mutation: persist probe usage separately while enforcing one shared daily cap.
T043 follow-up > broad transaction refactor now: preserve report and idempotency transaction semantics.

## Action
!1: Complete T018/T038 E2E/T041 browser and owner real-key workflow after a safe stand rebuild.
!2: Resolve T043 connection retention and add limited-pool concurrency coverage.
 3: Re-run full backend/frontend gates after feature 007 baseline fixes.

## Caution
⚠️ Preserve the shared dirty tree and user files; do not stage or revert unrelated paths.
⚠️ Existing :3130 uses stale .next; sandbox denied loopback bind (`operation not permitted`); do not restart live processes.
⚠️ PostgreSQL must run `alembic upgrade head` through 0009_ai_probe_quota before deployment.
❌ Backend full pytest: 2 known audio tests, feature007 exam test, and test_release_invariants fail; npm full suite has 6 prior failures.
🧠 Quota reservations commit before HTTP; timeout does not refund a sent-request reservation.
