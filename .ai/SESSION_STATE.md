# SESSION_STATE
## F012 on feat/011-dds-sasha 2026-10-20 (evening) — T001-T008 done
done:T006 norms → simulator bar (slot+portal, TrainerNorms, showTimer=false for student; mirror keeps timer) | T007 own service = User.service → PROFILE_MAPPING_SEED[0] (egorov svc-upr-obruchev, petrova svc-upr-chert), tile prepended if absent, journal same resolver
Checks@2026-10-20 (macOS, worktree RA-012):{uv run pytest -q 1135 passed/4 skipped | ruff clean | npx vitest run 2033/2033 | tsc, steiger, eslint/prettier(changed) pass}
Browser@2026-10-20 demo-up fresh db: egorov c-009 Принята(наряд+comment)→…→Работы завершены → correctness 100, no «пропущен звонок», no dispatcherAction ✅ | petrova not run in browser (vitest covers)
⚠️ reaction = openedAt − issuedAt (spec 000) → always 0:00 in DDS assignment, not time to «Принята» → owner decision
⚠️ out of scope: DDS feed only cards where own service in notification list

## F011 on SASHA 2026-10-20 (branch feat/011-dds-sasha, base origin/SASHA d0c9d2f; SASHA itself NOT pushed)
done:011 card feed (bank /student-cards, studentCards in DDS assignments, eval by teacher etalon) + no auto-push 112→live DDS (SASHA test_chain moved to D4) + egorov unblocked (lebedev blocked) + egorov trainingProfile=dds + login demo line «Диспетчер ДДС» + seed asg-003 dds for egorov
fix:assignment wizard step 0 validated with mode filter → dds-profile student blocked at «Обучающиеся» (default mode 112) → step 0 validates raw selection
Checks@2026-10-20:{uv run pytest -q 1133 passed/4 skipped | ruff clean | npx vitest run 2017/2018 (teacher-v1 Blob env) before wizard fix; assignment-create 46/46 after | tsc, steiger, eslint/prettier (changed) pass | mocks:validate pass}
Browser@2026-10-20 (cloud chromium, fresh db, next start :3130 BACKEND_URL):{ivanov no «Открыть АРМ» | egorov has it | 112 card → teacher bank → DDS assignment → egorov «Начать» → /arm/card/c-097 | /arm journal} | not run: statuses+eval in browser, npm run check, e2e
⚠️ DDS card «my service» = first notification-list service by kind, not user's (src/pages/incident/lib/cardView.ts)
⚠️ codex/feature-007-learner-role-split = parallel role model, based on old main (no develop/voice) → not merged; SASHA 008 trainingProfile used

## Handoff 2026-10-20 (evening) → next window
Branch:SASHA (pushed, HEAD 7edccf6 + this handoff) | develop merged in (d08ce53) | spec:009-arm-112-student
Where: tasks.md Phase 2 Foundational | done T001-T007 + T020 | NEXT: T008 mock validator (channel∈{call,sms}, smsText if sms, repeatOf→existing card|null, lockedBy only bg) → T009 (owner texts!) → T010-T012 journal (reuse operator112_service.in_student_journal) → T013-T019
Owner decisions 2026-10-20:
  - live AI caller (005-live-caller) replaces recording in 112 ARM, BOTH training+exam; recording only if NEXT_PUBLIC_LIVE_CALLS_ENABLED=false; no silent fallback when live server unconfigured (state unavailable)
  - only student-112 workplace now; DDS code untouched (R14)
  - design = ARM 1:1; compare vs СРАВНЕНИЕ-ИНТЕРФЕЙСА-АРМ.md (до/после) + окна-АРМ-112.html; proposal (not yet accepted): add до/после items to checklists/visual-112.md + T070, screenshot pairs 1920×1080
Voice point (T020 ✅): entities/operator112-attempt/model/useApplicantVoice.ts → {kind live|recording, state checking|idle|connecting|playing|unavailable|ended, start, stop, mute, level, recordingUrl, trainerText(only trainer strip, FR-027)}; useRealtimeCaller+useCallerAudio moved softphone→entity; backend live_call_service.writable: any active assignment (exam ok)
T007 ✅: 7 new event types + payload checks; linkAdded cardId ∈ journal (ArmCardFixture bg | own 112 IncidentCard) else 400
🧠 assumption: journal bg = all ArmCardFixture (no per-assignment bg) — recheck in T011
Checks@2026-10-20 after merge: pytest 1122 passed/4 skipped/0 red | ruff clean | vitest 2008/2011 (teacher-v1 Blob = env; IncidentScreen+PresentScreen flaky under load, pass alone) | tsc+eslint(changed)+steiger pass | next build NOT run
Blocked/owner:
  !1 renumber duplicate spec 005 (005-arm-reference-panel vs 005-live-caller)
  !2 T009 synthetic ticket texts (1 SMS, 1-2 repeatOf pairs, 1-2 lockedBy) + ok for migration 0007/DB reset
  !3 real live call: POLZA_API_KEY+models in backend/.env, polza.ai allowed in cloud env (now 403) → ./scripts/demo-up.sh --live
  !4 004 T007 real-key check: spec/004-polza-provider/quickstart.md

## Handoff 2026-10-20 (late) → next window
Branch:SASHA | HEAD:285fda4 pushed | tree:clean | spec:009-arm-112-student | tasks.md: 70/74 [X]
Done this window (after da634ac):
  ✅ ecd1568 T031 channel/smsText/repeatOf in attempt | T051 e2e-student.sh 112 block (run_frontend_e2e --only student: 69/69 PASS)
  ✅ 8878cd6 T068 hotkeys = памятка §3.17 (Alt+F1-3/Q/A/P/N/T/O/Z/S/W/B/M, Esc, Insert, Enter)
  ✅ a2dfd45 T059 «связана» on services bar + crimson link cell in journal
  ✅ 16ab893 T066 «справка» menu → «Краткая инструкция» (ShortGuideWindow, text from памятка) + «Сообщить о проблеме»
  ✅ 7cd2caf/95fb45c/baf328a/285fda4 visual fixes vs refs: journal menu icons+row cells+alarm-only red status; card services bar at bottom, «Отключение» during call, 2-line flags; Esc only top modal; links/SMS history as overlays w/ current card; «Округ» select (12 Moscow okrugs)
  ✅ d9ca9ae checklists/visual-112.md filled (windows 2,3,3a,3b,3c,4,5,6,7,7a,8,9,12)
Checks@2026-10-20: vitest full 2147 passed/2 red (IncidentScreen flaky L013; teacher-v1 Blob env, known) | pytest 1171 passed/4 skipped/0 red | ruff clean | tsc, steiger clean
Stand: scratchpad stand.sh (demo_up.sh w/ env JWT_SECRET, DEMO_DB in scratchpad) | screenshots via Playwright script (not in repo)
Open 009: T052 SC-004 before/after scores | T069 e2e visual spec (needs backend) | T070 rows 7b,13,reminder,problem not compared; row 4 (tab label/row titles — no data) | T072 quickstart manual
Owner decisions pending: c-066/c-093/lockedBy texts + c-093 phone | address word threshold 0.5 | primary = repeatOf card | journal 404 vs 403 | migration 0007 to working DB | «Краткая инструкция» text drafted from памятка — review
⚠️ /ef_before.json at FS root (executor leftover) — owner deletes

## Handoff 2026-10-20 (009 executor commits) → next window
Branch:SASHA | HEAD:da634ac = origin/SASHA (fetched, 0/0 at start; L024 done) | tree before docs:clean | spec:009-arm-112-student
Scope:student-112 workplace only | DDS code untouched (R14) | docs of this window NOT committed (AGENTS.md, spec/README.md, spec/009 tasks.md, .ai/*)
Parallel work (NOT docs, NOT reviewed here, NOT staged): another executor's uncommitted edits appeared in the tree during this window: backend/app/models/session.py, backend/app/schemas/v1/operator112.py, backend/app/services/operator112_service.py, backend/tests/contract/expected_fields.json, src/pages/operator112/model/channel.ts, src/pages/operator112/ui/Operator112Screen.test.tsx, src/shared/api/types/operator112.ts, untracked backend/tests/integration/test_operator112_channel.py, src/pages/operator112/model/channel.test.ts. Do not commit them with docs.
Commits 009 (oldest→newest; task ids = tasks.md):
  b9c3443 journal header/table/lock window (T021–T024, T061)
  5affa4d PoV-112 card: phone bar, header, timer, applicant, description, address+map, call/SMS windows, history, reminder (T018–T019, T028–T029, T033–T040, T060, T063)
  738b57e card timer, draft with tabs/links/address, screen views, reminder hook (T013–T017, T062)
  9929614 type tabs, services panel «Добавьте службы», match windows, «Показ связей» (T041–T042, T046–T048, T057–T058)
  9f50e2d address check without street, link check, legacy attempts check (T044–T045, T055–T056, T071)
  87d63c3 journal server+client, matches endpoint, «×» accepted until answer (T010–T012, T053–T054)
  27f56cf «Сообщить о проблеме»: backend + migration 0007, window, teacher block (T064–T067)
  2c05070 screen assembled from PoV-112 parts; old form + softphone deleted (T025–T027, T030, T032, T043, T049, T050)
  600a0fa problem-report window wired on 112 screen: services icon, Alt+M (T066 partial)
  5073abf mocks + validator: sms c-066, repeatOf c-093, lockedBy (T008–T009; T009 texts pending owner)
  da634ac fix op-l1…op-l4 binding rules in error-map stage «Завершение» (backend/app/services/error_map_stages.py; 003 file, tagged 009)
  before: 7edccf6 T020 live AI caller (entities/operator112-attempt/useApplicantVoice), 94c81ed merge origin/SASHA, 9c62e27 stage A components
Open 009 (tasks.md: [X] 65 / [ ] 9 after docs):
  T031 [US2] partial: SMS window/channel/text done; SMS voice not started; recheck on real ticket after T009 owner texts
  T051 [US4] e2e-student.sh 112 steps + run_frontend_e2e --only student: not done
  T052 [US4] SC-004 5 reference runs 112 before/after in baseline.txt: not done
  T059 [US5] partial: links in CardDraft, match window, «Показ связей», journal badge done; no separate «связана» button (entry = «Связи» icon)
  T066 [US6] partial: window + Alt+M + client done; «?» in journal header and «Краткая инструкция»: not done (no content in spec)
  T068 [FR-032] partial: Shift+F1/F2, Alt+E/A/T, Enter, aria-label done per tasks.md; Alt+M wired in 600a0fa; T068 not re-marked
  T069 e2e/arm-112-visual.spec.ts snapshots 1920×1080: not done
  T070 manual check of 14 windows vs checklists/visual-112.md: not done
  T072 quickstart scenarios 1–13 on ./scripts/demo-up.sh: not done
  T073 docs (spec/README 009 row, AGENTS §3 map): done 2026-10-20, [X]
  T074 handoff + SESSIONS: done 2026-10-20, [X]; baseline.txt / affected-tests.md NOT deleted (no owner consent)
Owner decisions (open):
  !1 ticket texts (T009 «тексты — на согласование владельцу»): c-066 sms, smsText «Знакомый хочет повеситься…» (spec/000-фронт/mocks/cards.json); lockedBy on card-36814850, card-36814854 (fixtures/arm-cards.json)
  !2 c-093 phone 916-410-22-38 (= card-36814851 AON +7 (916) 410-22-38; T009: «номер свободен») — keep or change
  !3 main card = card from repeatOf: evaluation requires primary == repeatOf (backend/ml/assess/operator112.py:472); UI first linked = main (src/pages/operator112/model/draft.ts:213) — confirm
  !4 address check threshold: lexical coverage < 0.5 → ADDRESS_MISMATCH, only for addresses outside reference (backend/ml/assess/operator112.py:258) — confirm
  !5 journal: foreign/unknown assignment → 404 (backend/app/services/operator112_service.py:722); not student or profile≠112 → 403 (:716, :719) — confirm 404 vs 403
  !6 migration 0007 not applied to working DB (per task statement); no backend/var/*.db in this container, so not verified here; DB reset only by owner
  !7 «Краткая инструкция»: no content in spec (spec/009-arm-112-student/plan.md:115) — owner text needed
  !8 hotkeys Shift+F1 / Shift+F2 / Alt+E: executor assumption (memo names «Просмотр»/«Дополнить», tasks.md T068) — confirm
  !9 carry-over: duplicate spec number 005 (005-arm-reference-panel vs 005-live-caller, both in spec/README.md) — not fixed
  !10 carry-over: 004 T007 real Polza key check (spec/004-polza-provider/quickstart.md) — open per spec/README.md
  ⚠️ Silero TTS license CC BY-NC (risk outside hackathon)
Checks@2026-10-20 (docs window, no code run): read-only verification only | git show --stat 009 commits | ls/grep slices, routes, v1 endpoints, migration 0007 | backend/.venv python: Base.metadata.tables = 46 (import only, no DB)
Checks@2026-10-20 (009 executors, per owner): targeted sets only | npm run check, npm run test, e2e: NOT run | results of targeted sets not in git → not recorded here
Next: owner decisions !1–!8 → T051/T052 (US4 e2e + SC-004; c-066/c-093 texts needed) → T072 on demo-up (0007 applied only with owner OK) → T069/T070 visual 14 windows → finish T031/T059/T066/T068
Rules: TDD pairs 400/200 | commits w/o Co-Authored-By | git fetch before reading handoff (L024) | prettier only changed files (it reformats foreign files)
Env notes: cloud container: npm ci in fresh containers + npm run mocks:sync before vitest | uv sync --group dev | no lsof → kill by PID (L023)

## Facts (develop: live-caller, merged into SASHA 2026-10-20)
Proj:RespondersAcademy | Branch:claude/awesome-curie-i39fyz (= pensive-feynman-smkr22 + latency work; not merged to main) | Mode:normal
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza-provider ✅ + amendment: POLZA_MODEL required | 005 live-caller: polza transport implemented, not checked live}
Finals:2026-10-23 online pitch | rule(moderator 17–19.10): API only for open-weight models deployable on TZ server (CPU≥6c,32GB,no GPU), no hardcode
Tests@2026-10-20 (cloud, uv run pytest -q):{pytest:1034 passed/3 skipped/0 red, ruff:clean}
Front@2026-10-19 (cloud):{tsc:pass, vitest:1948/1949 — teacher-v1 Blob instanceOf red on clean main too (env), 1 more flaky in first run} | not run:{npm run check, e2e, simulator-visual}
Updated:2026-10-19

## Facts
Proj:RespondersAcademy | Branch:merge/021-branch-consolidation (WT ../RespondersAcademy-merge) | Base:origin/main ba1f7d8 (2026-10-20) | Mode:normal | pushed:❌ (push+main only on owner request)
Merged:develop db44740 | feat/011-dds-sasha ada3e78 | SASHA ad5e271 | fix/ai-connection-probe-timeout 5e309ef | codex/feature-007-learner-role-split 971261d | claude/gracious-darwin-x0znyd 8c992c6 | feature/scenario-graph-builder cdef678
Dups (already contained, not merged):feat/011-dds-card-feed 32e2160 (⊂ dds-sasha) | claude/zealous-goldberg-mu6erp ce6c3dd (⊂ dds-sasha) | kind-goldberg=card-feed | practical-hawking=graph-builder
NotMerged:claude/optimistic-maxwell-wxwdzs 9924210 (K12 pitch pptx, real-people photos → owner decision, Q3)
Spec:spec/021-branch-consolidation/ (journal: merge-journal.md) | commits mapped 128/128 (K0-K12)
Features(renumbered):013 visual-scenario-builder | 014 live-caller | 015 scenario-graph-builder | 016 arm-reference-panel | 017 student-rating | 018 operator112-student | 019 learner-role-split | 020 ai-chat-assistant
Features(kept):005-performance-report | 006-llm-provider-switch | 007-arm-one-to-one | 008-full-cycle-review | 009-arm-112-student | 010-lesson-call-session | 011-dds-card-feed | 012-dds-memo-alignment
Migrations:chains 0006-0007 (SASHA) | 0006-0010 (seva) | 0006-0009 (graph) → 0011_merge_sasha_seva → 0012_specs_from_training_profile (move+drop training_profile) → 0013_merge_scenario_graph; heads=1 ✅
Tests@2026-10-20:vitest 2612 passed (2612) | tsc ✅ | lint ✅ | steiger ✅ | build ✅ | pytest 1681 passed/0 failed/4 skipped/3 xfailed (after fix eb9312b; gate run before fix: 1680/1) | ruff ✅ | mocks:validate ✅ | format:check ✅ except inherited окна-АРМ-112.html
Gate@2026-10-20:HTTP e2e mock mode (next start :3130): student 40/40 ✅ | teacher 94/96 — steps 82, 86 inherited (same on SASHA tip) | admin 141/141 ✅ | Playwright smoke+platform+constructor+scenario-graph 23/23 ✅ | not run: simulator-visual, demo-path, auth-security, run_frontend_e2e.sh (backend mode)
Baseline origin/main@2026-10-20:vitest 1912 | pytest 911 passed/3 failed/2 skipped | known red:test_ready_applicant_audio_is_playable_from_recordings[wav|mp3], test_release_invariants (fixed by develop 3720f58)
Updated:2026-10-20

## Decisions
В1 specializations (list) is the single model; training_profile removed/derived → no second source
В2 external services (SpeechKit, GigaAM CDN, Polza for live-caller/reports/chat) = options only, OFF by default | verified journal T006 (AI_PROVIDER=local, LIVE_CALLS_ENABLED=False, SPEECHKIT_API_KEY=None; cloud key only ciphertext in ai_settings, source default local) | AGENTS §2 + FINAL-GATE record deviation from constitution I
P1 specialization model → В1
P2 two constructors (013 flow/1 front prototype, 015 scenario-graph/1 server) → both merged on own routes (/teacher/constructor, tab «Граф» in /teacher/scenarios/[id]); unification = separate feature, owner decision
P3 rating (017) vs performance (005-performance-report) → both merged (/teacher/rating, /teacher/performance, /admin/performance)
P4 window 112 → SASHA implementation wins; operator112-softphone, operator112-questionnaire, Operator112Workspace deleted; seva edits ported only if still relevant
P5 simulator-bar slot → one element carrying both data-simulator-bar-slot and SIMULATOR_BAR_SLOT_ID; Slot and Portal kept as two fallback policies
Q1 renumber minimal (one commit, git mv, at the end)
Q3 K12 pitch pptx not merged
Order:merge --no-ff by pieces F1 develop → F2 dds-sasha → F3 SASHA → F5 seva(fix) → codex → F6 gracious → F7 graph → renumber
Removed with 98705b7:backend/scripts/seed_chain_demo.py | tests test_ai_chain, test_seed_chain_demo | e2e/two-mode-full-path.spec.ts → chain A→B replaced by DDS feed (011); do not restore w/o owner

## Open
006 llm-provider-switch:T041 manual check w/ real key (SC-001)
008 full-cycle-review:audit 5 critical defects T001-T014 all open (0/19) | T001-T003 RBAC holes (grades, GET /users, anon sessions) = security → fix before prod
009 arm-112-student:T052 SC-004 5 baseline runs | T069 visual snapshots arm-112-visual | T070 manual check 14 windows | T072 quickstart on stand
010 lesson-call-session:spec Draft, no tasks.md/plan
011 dds-card-feed:T010 manual browser check (partly done 2026-10-20 on cloud, left open)
019 learner-role-split:T041 2nd echelon (transfer, links) | T059-T063 final runs (pytest, npm run check, simulator-visual, run_frontend_e2e.sh, manual checklist) not done at branch tip
015 scenario-graph:S8 e2e run_frontend_e2e.sh --only scenario-graph did not finish on clean DB (passed on manual stand) | drag-and-drop not checked | T072/T073 usability not done
013 visual-scenario-builder:server phases Ф1-Ф6 not started (prototype only, localStorage)
020 ai-chat:T019 e2e boundary | T031 Playwright | T032 latency | T034 full check | T035 memory | cloud chat OFF until owner decision §2 (T020)
005-performance-report:T006 demo data + review by management
014 live-caller:real smoke_polza_caller.py w/ key + headset call + hardware measure not done
004 polza:T007 real key check not done
K12 pitch:not merged (owner decision)
Push/main:not done; needs owner request

## Caution
⚠️ main ba1f7d8:pptx filename stored NFD; with core.precomposeunicode=true git shows it as untracked ?? → do not stage
⚠️ BACKEND_URL baked into .next/routes-manifest.json at next build → rebuild after changing it
⚠️ Playwright L015/L017:fresh server before each run (in-memory store), workers=1, check which layer BACKEND_URL points to
⚠️ mocks/* gitignored (.gitignore:16) → mocks:sync before tsc/test else TS2307 on @mocks/*
⚠️ migration filenames collide across chains by number; order = down_revision, never renumber files
⚠️ vitest flake IncidentScreen «недоступен» line (L013) passes alone
⚠️ POLZA_MODEL default differs (fix: openai/gpt-4o-mini, develop: None) → check conflict resolution in config.py
🧠 ivanov = only 112 after 018; check demo accounts (ivanov, egorov, u-005, u-006, u-016, u-017) against specializations
