## Handoff 2026-10-20 → next window (009 implement)
Where: spec/009-arm-112-student/tasks.md | Phase 2 Foundational | done T001-T007 | NEXT: T008 (mock validator: channel/smsText/repeatOf/lockedBy) → T009 needs owner texts
  - T007 ✅ 2026-10-20: 7 new event types + payload checks (schemas/v1/operator112.py); linkAdded cardId ∈ journal via operator112_service.in_student_journal (ArmCardFixture bg | own IncidentCard mode_origin=operator112) → reuse in T011; tests/integration/test_operator112_events_v2.py 17 passed; pytest 1000 passed/3 known red; ruff clean
  - 🧠 assumption: journal background = all ArmCardFixture rows (no per-assignment bg exists yet) — recheck in T011
Done this window:
  - T001 baseline.txt (pytest 977/3 known red, vitest 1951/1 red teacher-v1 Blob = env, prettier 4 foreign files)
  - T002 affected-tests.md | T003 checklists/visual-112.md (17 windows/states)
  - T004 backend/tests/contract/test_operator112_draft_v2.py (6 tests: old body=96 like baseline, incidents→what, 2 primary links 400/1→200, noContact/dropped w/o address 200, filled w/o address 400, any-subject address+channel in snapshot) ✅
  - T006 app/schemas/v1/operator112.py: CardDraftAddress +country..code,lat,lon; CardDraftLink; CardDraft +channel,incidents,links,outcome; what=incidents[0] if empty; outcome!=filled skips minimum; address minimum also object|lat+lon
  - T005 src/shared/api/types/operator112.ts (+CardChannel, CardOutcome, CardDraftLink, Journal112Row/Response, 7 event types) + exports in types/index.ts, api/index.ts; expected_fields.json regenerated
Checks@2026-10-20: tests/contract 241 passed / 2 known red | ruff clean | tsc pass | prettier (changed) clean | vitest not rerun after T005 (types only)
Rules: DDS code untouched (R14) | services panel color by card state R13a (#ec653b new, #49555d saved) | timer R7a (60 s, only timer block red) | TDD pairs 400/200 | commits w/o Co-Authored-By
Stand: ./scripts/demo-up.sh; before restart kill next-server/uvicorn by PID (no lsof, L015)

## Facts
Proj:RespondersAcademy | Branch:SASHA | Mode:normal | HEAD:SASHA pushed | tree:clean after commit
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza ✅ T001-T006, T007 open | 005 arm-reference ✅ | 006 student-rating ✅ | 007 arm-one-to-one spec only | 008 operator112-student ✅ T001-T041 | 009 arm-112-student IN PROGRESS: T001-T006 ✅, next T007 | 010 lesson-call-session spec, owner answers in}
Scope@2026-10-20(owner): only student-112 workplace now; DDS profile+ARM = other teammate → never edit DDS code (widgets/{incident-card,incident-list,service-panel}, pages/{incident,journal,phone}); 112 in own slices (009 R14); voice dialog (007 FR-031..034) = friend, later; plug point useApplicantVoice (009 R6)
Stand:./scripts/demo-up.sh (front :3130, back :8130, db backend/var/demo.db) | stop: ps aux|grep -E "next-server|next start|uvicorn" → kill PIDs (no lsof in cloud container)
Tests@2026-10-20:{vitest:1951 passed/1 red teacher-v1.test.ts downloadReportExport "Blob not instance of Blob" — red on clean HEAD too (Node22+jsdom env), not ours | tsc:pass | steiger:pass | eslint(changed):pass | pytest:not rerun this session}
SC-004(008)@2026-10-20: 5 identical 112 runs c-010 before(5f4988e)/after(HEAD) = 96/81/81/89/86 both, all components equal ✅
Updated:2026-10-20
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
!0 009: owner to approve synthetic tickets (T009: 1 SMS, 1-2 repeatOf pairs, 1-2 lockedBy) + DB reset/migration 0007 → then speckit-implement Phase 1
!1 004 T007 polza real-key check: procedure+protocol ready spec/004-polza-provider/quickstart.md (2026-10-20) | blocked: no key + cloud env 403 on polza.ai | next: owner adds key + allows polza.ai → steps 1-6
!2 T072 usability check w/ ≥3 teachers + T073 manual scenarios 1-14 (quickstart.md) NOT done
 3 simulator-visual playwright (SC-010) NOT run
 4 backend/var/dev.db lacks error_map_verdicts → alembic upgrade head or app.seed.load --reset (ask owner first)
 5 `npm run mocks:sync` — spec mocks (sessions/users) changed, mocks/ copy not refreshed
 6 owner checklist (screenshot): 5.1 filter sizes 44/16px (a11y.test only scans cursor:pointer rules → fields may be missed), 5.3 group assignments in existing DB, 5.4 student recommendations rating race (old phase-14 code, not ours)
 7 T061 docs/demo.mp4 — owner records; never fabricate

## Caution
⚠️ .next baked with BACKEND_URL=127.0.0.1:8130 after run_frontend_e2e.sh / demo-up → rebuild before plain `next dev`/start
⚠️ e2e sh scripts need fresh servers/db each run (in-memory store, verdict rows)
⚠️ other sessions may edit same checkout: git status first, test -e before creating files
❌ NEVER git add . | never Co-Authored-By/agent signature in commits | never fabricate docs/demo.mp4 | never read/print backend/.env
🧠 pre-existing red tests proven on clean HEAD via git archive, not by assumption
