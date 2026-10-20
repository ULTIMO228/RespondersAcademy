## Facts
Proj:RespondersAcademy | Branch:main | Mode:normal | HEAD:abc6347 pushed to origin/main | tree:only docs/demo.mp4 + docs/demo-new.mp4 untracked (not ours)
Features:{005 performance-report ✅ T001-T005 (T006 open) | 000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ T001-T071 | 004 polza-provider ✅ T001-T006, T007 open}
Stand:demo-up.sh running @2026-10-19 (front :3130, back :8130, db backend/var/demo.db) | stop: lsof -ti tcp:3130 tcp:8130 -sTCP:LISTEN | xargs kill
Tests@2026-10-19:{pytest:911 passed/2 skipped/3 red(known debt, docs/FINAL-GATE.md),ruff:clean,vitest:1912 passed (234 files; 1 flaky IncidentScreen run, passes alone),steiger:pass,tsc:pass,build:pass,mocks:validate:pass}
E2E@2026-10-19:{scripts/e2e-error-map.sh via run_frontend_e2e.sh --only error-map: 20/20} | not run:{simulator-visual playwright,e2e-student/teacher/admin since 002}
npm run check:⚠️ stops at prettier on 2 foreign files (scripts/demo-video/record.mjs, GenerateDialog.tsx) | steiger/tsc/build run separately
Updated:2026-10-19

## Story
1 003 error-map: stages w/ traffic light (icon+word, thresholds 0.10/0.30, min 5/3, band ±10pp), stage detail, student map vs group, group journal, present mode, PDF, AI explain w/ agree/disagree verdict (migration 0005 error_map_verdicts, audit error_map.verdict), /me/focus + widget my-focus, thresholds in admin settings
2 004 polza: AI_PROVIDER=local|polza (default local), PolzaClient in ml/generate/llm.py (OpenAI-compat, Bearer, rpm+daily limits, any error → None → template fallback), only scenario generation + explain_stage go external, audit ai.external_call (no texts/key), GET /api/v1/admin/ai/provider (admin), no admin UI; AGENTS §2 amended w/ owner OK
3 docs: AGENTS §14-15 + .ai/LESSONS.md + PROJECT_MAP.md added; CLAUDE.md = Claude layer + @AGENTS.md

## Reasoning
verdict key omitted when none (dump() exclude_none for optional TS fields) > null
explanation None when level==noData (model not called)
external LLM only via llm.external_client(); configured_client() stays local (warmup must not hit network)
audit events buffered in llm.py, flushed async by external_ai_audit.flush_external_calls (client is sync)
polza without key → Settings validator fails startup (no silent switch)

## Action
!1 T007 polza real-key check: owner puts POLZA_API_KEY in backend/.env, then says ready; run 1 scenario gen + 1 explain, check audit rows
!2 T072 usability check w/ ≥3 teachers + T073 manual scenarios 1-14 (quickstart.md) NOT done
 3 simulator-visual playwright (SC-010) NOT run
 4 backend/var/dev.db lacks error_map_verdicts → alembic upgrade head or app.seed.load --reset (ask owner first)
 5 `npm run mocks:sync` — spec mocks (sessions/users) changed, mocks/ copy not refreshed
 6 owner checklist (screenshot): 5.1 filter sizes 44/16px (a11y.test only scans cursor:pointer rules → fields may be missed), 5.3 group assignments in existing DB, 5.4 student recommendations rating race (old phase-14 code, not ours)
 7 T061 docs/demo.mp4 — owner records; never fabricate
 8 2026-10-20 browser check /admin/performance as admin ✅: export.xlsx fetch 200 xlsx 14KB, tabs Students+Errors render; group col nowrap fixed (uncommitted, vitest 10 pass, eslint/prettier/tsc clean); 5 resolved: mock exportFormats csv|pdf is correct (mock layer has no xlsx)

## Caution
⚠️ .next baked with BACKEND_URL=127.0.0.1:8130 after run_frontend_e2e.sh / demo-up → rebuild before plain `next dev`/start
⚠️ e2e sh scripts need fresh servers/db each run (in-memory store, verdict rows)
⚠️ other sessions may edit same checkout: git status first, test -e before creating files
❌ NEVER git add . | never Co-Authored-By/agent signature in commits | never fabricate docs/demo.mp4 | never read/print backend/.env
🧠 pre-existing red tests proven on clean HEAD via git archive, not by assumption
