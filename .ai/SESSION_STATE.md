## Facts
Proj:RespondersAcademy | Branch:claude/practical-hawking-7p9bam (was main @2026-10-19) | Mode:normal | pushed to origin/claude/practical-hawking-7p9bam @2026-10-20
tree:@2026-10-20 only .ai/ + spec contract docs pending commit | docs/demo*.mp4 absent from git status (not ours)
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ T001-T071 | 004 polza-provider ✅ T001-T006, T007 open}
Stand:demo-up.sh running @2026-10-19 (front :3130, back :8130, db backend/var/demo.db); not re-checked 2026-10-20 | stop: lsof -ti tcp:3130 tcp:8130 -sTCP:LISTEN | xargs kill
Tests@2026-10-20:{pytest (`cd backend && uv run pytest -q`, run by this session after audit round 3): 1000 passed/2 skipped/3 red (known debt: test_ready_applicant_audio_is_playable_from_recordings x2, test_release_invariants; same names as before, not re-proven on clean HEAD this session) | ruff (`uv run ruff check .`): clean | alembic roundtrip + `alembic check`: pass}
Tests@2026-10-19:{ruff:clean, vitest:1912 passed (234 files; 1 flaky IncidentScreen run, passes alone), steiger:pass, tsc:pass, build:pass, mocks:validate:pass}
E2E@2026-10-19:{scripts/e2e-error-map.sh via run_frontend_e2e.sh --only error-map: 20/20} | not run:{simulator-visual playwright,e2e-student/teacher/admin since 002}
Front@2026-10-20 (after `npm ci` + `npm run mocks:sync`; src/ untouched by this branch):{vitest `npx vitest run`: 1910 passed/2 failed of 1912 — teacher-v1.test.ts downloadReportExport fails on clean origin/main too (Blob realm in jsdom, pre-existing), TeacherScenarioEditorPage route test passes alone (flaky in full run) | steiger: pass | tsc --noEmit: errors about @mocks/*.json BEFORE mocks:sync (not re-run after sync)}
Not run@2026-10-20:{npm run build, playwright e2e, scripts/e2e-*.sh} — не проверялось
npm run check:⚠️ stops at prettier on 2 foreign files (scripts/demo-video/record.mjs, GenerateDialog.tsx) | steiger/tsc/build run separately
Updated:2026-10-20

## Story
1 003 error-map: stages w/ traffic light (icon+word, thresholds 0.10/0.30, min 5/3, band ±10pp), stage detail, student map vs group, group journal, present mode, PDF, AI explain w/ agree/disagree verdict (migration 0005 error_map_verdicts, audit error_map.verdict), /me/focus + widget my-focus, thresholds in admin settings
2 004 polza: AI_PROVIDER=local|polza (default local), PolzaClient in ml/generate/llm.py (OpenAI-compat, Bearer, rpm+daily limits, any error → None → template fallback), only scenario generation + explain_stage go external, audit ai.external_call (no texts/key), GET /api/v1/admin/ai/provider (admin), no admin UI; AGENTS §2 amended w/ owner OK
3 docs: AGENTS §14-15 + .ai/LESSONS.md + PROJECT_MAP.md added; CLAUDE.md = Claude layer + @AGENTS.md
4 scenario-builder backend (2026-10-20; contract: spec/001-ai/contracts/ai-workflow-v1.md)
4a ✅ 936b7c4 manual versions: POST/GET /api/v1/ai/scenarios, GET /api/v1/ai/scenarios/{id}/versions/{n}
4b ✅ d3d7caf engine app/scenario_runtime (39 unit tests tests/unit/test_scenario_runtime.py, run 2026-10-20)
4c ✅ 8594a92 integration: workflow submit/review/publish (app/services/scenario_workflow.py); expert perms on user (PUT/GET /api/v1/admin/users/{id}/permissions, teacher only); student runs (app/services/scenario_runs.py, /api/v1/ai/scenario-runs/*)
4d ✅ migration 0006_scenario_builder (down_revision 0005_error_map_verdicts; users.permissions, ai_scenario_versions.graph/reviewed_by/review_comment, table ai_scenario_runs); alembic head = 0008_scenario_run_active_unique (0007 ai_scenario_runs.revision optimistic lock; 0008 partial unique index one waiting run per student+version)
4e ✅ contract ai-workflow-v1.md: workflow/permissions/runs rows; graph param on POST scenarios + revise; approve → 409 for graph versions
5 ✅ audit fixes (2026-10-20): run update guarded by revision (409 on parallel write) + optional expectedSteps; double start returns active run (200); finished assignment blocks start/action (finish still allowed); revise race IntegrityError → 409 (was 500); graph rejects unknown keys, non-scalar values, >50 branches; 0006 downgrade fixed for SQLite triggers (direct DROP COLUMN); 9 builder integration tests extended to 17
5b ✅ audit round 2 (independent haiku audit + own checks): legacy approve blocked for rejected and for pending_review non-chain (chain student_card keeps approve); expectedSteps now REQUIRED on run actions; start_run falls back to active run on IntegrityError; facts set at start are locked vs actions; card nested fields flattened (caller.status); order ops (gt/ge/lt/le) numeric-only incl. parse check; graph start non-string → 400 (was 500); parallel publish → 409 (was 500)
5c ✅ audit round 3 (residuals closed): review decision = conditional UPDATE (approval=pending_review AND reviewed_by IS NULL) → parallel expert 409; scenario row re-read FOR UPDATE before doc rewrite in publish/revise; _save_draft retried in savepoint on id IntegrityError (next_id race); student finish idempotent (200, one audit row). Auditor's D2 was wrong (whitespace reject comment already 400). Real PostgreSQL concurrency not tested (SQLite single shared connection in tests → collisions simulated by monkeypatched stale reads)

## Reasoning
verdict key omitted when none (dump() exclude_none for optional TS fields) > null
explanation None when level==noData (model not called)
external LLM only via llm.external_client(); configured_client() stays local (warmup must not hit network)
audit events buffered in llm.py, flushed async by external_ai_audit.flush_external_calls (client is sync)
polza without key → Settings validator fails startup (no silent switch)
run access = student + assigned approved+validated version (app/api/v1/ai_access.py:85-110), else 403; author/admin run view adds facts+events (app/services/scenario_runs.py _load/_view)
approve on graph version → 409 (app/services/ai_scenario_review.py:220-250); graph versions go submit → review → publish only
🧠 2026-10-20 contract rows checked vs code (routes, guards, error codes); two drifts listed in Caution

## Action
!1 T007 polza real-key check: owner puts POLZA_API_KEY in backend/.env, then says ready; run 1 scenario gen + 1 explain, check audit rows
!2 T072 usability check w/ ≥3 teachers + T073 manual scenarios 1-14 (quickstart.md) NOT done
3 simulator-visual playwright (SC-010) NOT run
4 backend/var/dev.db lacks error_map_verdicts and 0006/0007 → `alembic upgrade head` (or app.seed.load --reset; ask owner first)
5 `npm run mocks:sync` — spec mocks (sessions/users) changed, mocks/ copy not refreshed
6 owner checklist (screenshot): 5.1 filter sizes 44/16px (a11y.test only scans cursor:pointer rules → fields may be missed), 5.3 group assignments in existing DB, 5.4 student recommendations rating race (old phase-14 code, not ours)
7 T061 docs/demo.mp4 — owner records; never fabricate
8 scenario-graph/1 format: PROPOSAL, not agreed with owner — owner decision open
9 no frontend editor for graph (scenario builder UI does not produce graph)
10 graph does not feed scoring: etalon.expectedActions is linear

## Caution
⚠️ .next baked with BACKEND_URL=127.0.0.1:8130 after run_frontend_e2e.sh / demo-up → rebuild before plain `next dev`/start
⚠️ e2e sh scripts need fresh servers/db each run (in-memory store, verdict rows)
⚠️ other sessions may edit/commit same checkout: git status first, test -e before creating files
⚠️ drift: student run view (app/services/scenario_runs.py _view) also returns scenarioId/version/studentId; contract says only runId/status/outcome/steps → owner: narrow code or fix contract
⚠️ ambiguity: contract protocol says 422 for invalid input; service validation_failed → 400 (app/api/errors.py:40), used for permission/graph/action-value errors → owner decides
⚠️ contract ai-workflow-v1.md status line "Реализация endpoint'ов — отдельный этап" stale (dated 2026-09-22)
⚠️ published scenario version cannot be revised (revise on approved base → 409, existing rule): no path to evolve a published scenario → owner decision
❌ NEVER git add . | never Co-Authored-By/agent signature in commits | never fabricate docs/demo.mp4 | never read/print backend/.env
🧠 pre-existing red tests proven on clean HEAD via git archive, not by assumption
