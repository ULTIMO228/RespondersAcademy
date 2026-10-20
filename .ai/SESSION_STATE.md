## F012 on feat/011-dds-sasha 2026-10-20 (evening) — T001-T008 done
done:T006 norms → simulator bar (slot+portal, TrainerNorms, showTimer=false for student; mirror keeps timer) | T007 own service = User.service → PROFILE_MAPPING_SEED[0] (egorov svc-upr-obruchev, petrova svc-upr-chert), tile prepended if absent, journal same resolver
Checks@2026-10-20 (macOS, worktree RA-012):{uv run pytest -q 1135 passed/4 skipped | ruff clean | npx vitest run 2033/2033 | tsc, steiger, eslint/prettier(changed) pass}
Browser@2026-10-20 demo-up fresh db: egorov c-009 Принята(наряд+comment)→…→Работы завершены → correctness 100, no «пропущен звонок», no dispatcherAction ✅ | petrova not run in browser (vitest covers)
⚠️ reaction = openedAt − issuedAt (spec 000) → always 0:00 in DDS assignment, not time to «Принята» → owner decision
⚠️ out of scope: DDS feed only cards where own service in notification list
## Facts
Proj:RespondersAcademy | Branch:claude/gracious-darwin-x0znyd | Mode:normal | base:e1ab838(main)
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 ✅ (T061 owner) | 003 error-map ✅ | 004 polza ✅ (T007 open) | 005 visual scenario builder: spec+plan+design ✅ approved, clickable FRONT prototype ✅, server phases Ф1-Ф7 not started}
005 prototype:/teacher/constructor | no server, no DB change (owner) | draft in localStorage key ra.flow-constructor.draft.v1 | publish disabled
005 code:entities/scenario-flow{catalog,editor(history 50),validate,preview engine,layout,demo c-010} | features/flow-{canvas(+minimap),inspector,library,preview} | pages/teacher/constructor | shell workspace mode (PlatformShell workspace, SideNav compact) | tokens --pf-flow-*
Owner feedback 2026-10-20 ✅:{explicit question text «Выяснить: X. Ответ: Y» | «Скрыть ответы» toggle (canvas+outline+aria, inspector keeps answer) | minimap drag freeze (was runaway 1.28M px) | ticket select «Билет N — summary» + details box | full-text callout under selected clipped node, library desc wraps | preview «✓ Записано» + «Мои действия» moved up | ≤1599px toolbar labels → icons}
Tests@2026-10-20:{vitest full 2015 passed/1 failed (same teacher-v1 pre-existing) | lint ✅ steiger ✅ tsc ✅ build ✅ | prettier only 2 foreign | e2e constructor 10/10 + platform + smoke = 23/23 (npx playwright test -c temp config) | minimap e2e verified red on old code}
Tests@2026-10-19:{vitest full: 2001 passed/1 failed (teacher-v1 downloadReportExport Blob instanceof — also red on clean HEAD via git archive, env Node22/jsdom) | flaky: Operator112Softphone «Прослушать ещё раз» failed once in full run, passes alone & on clean HEAD | lint ✅ | steiger ✅ | tsc ✅ | build ✅ | prettier: only 2 foreign files (record.mjs, GenerateDialog.tsx)}
E2E@2026-10-19:{constructor.spec 8/8 + platform.spec 6/6 + smoke.spec 7/7 = 21/21 on next start :3150, system chromium via temp config (executablePath /opt/pw-browsers/chromium, not committed)} | not run:{simulator-visual (darwin snapshots), demo-path, sh e2e scripts, backend pytest (backend untouched)}
Updated:2026-10-20

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
Proj:RespondersAcademy | Branch:fix/ai-connection-probe-timeout | Mode:normal | Status:feature006-done-T041-accepted-open
HEAD:75936ee | Updated:2026-10-20T18:40:00+03:00 | Pushed:origin/fix/ai-connection-probe-timeout
Dirty_paths:feature007+shared (other sessions); preserve all
Tests:{backend:1216_pass,3_known_fail(audio_wav_mp3,release_invariants),2_skip;vitest:2119_pass,1_flaky(IncidentScreen,f007);eslint_tsc_steiger_prettier:clean;e2e:student40/40,admin141/141,ai27/27,teacher_FAIL_34_37(also_without_006_changes;likely_f007,unverified)}
Not_checked:{postgres,npm_run_check_single_cmd,cloud_report_in_browser,new_key_entry_flow}

## Facts
Proj:RespondersAcademy | Branch:SASHA | Mode:normal | HEAD:SASHA pushed | tree:clean after commit
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza ✅ T001-T006, T007 open | 005 arm-reference ✅ | 006 student-rating ✅ | 007 arm-one-to-one spec only | 008 operator112-student ✅ T001-T041 | 009 arm-112-student IN PROGRESS: T001-T006 ✅, next T007 | 010 lesson-call-session spec, owner answers in}
Scope@2026-10-20(owner): only student-112 workplace now; DDS profile+ARM = other teammate → never edit DDS code (widgets/{incident-card,incident-list,service-panel}, pages/{incident,journal,phone}); 112 in own slices (009 R14); voice dialog (007 FR-031..034) = friend, later; plug point useApplicantVoice (009 R6)
Stand:./scripts/demo-up.sh (front :3130, back :8130, db backend/var/demo.db) | stop: ps aux|grep -E "next-server|next start|uvicorn" → kill PIDs (no lsof in cloud container)
Tests@2026-10-20:{vitest:1951 passed/1 red teacher-v1.test.ts downloadReportExport "Blob not instance of Blob" — red on clean HEAD too (Node22+jsdom env), not ours | tsc:pass | steiger:pass | eslint(changed):pass | pytest:not rerun this session}
SC-004(008)@2026-10-20: 5 identical 112 runs c-010 before(5f4988e)/after(HEAD) = 96/81/81/89/86 both, all components equal ✅
Updated:2026-10-20
## Story
0000000000000 2026-10-20 owner: emotion «чуть уменьшить» → STYLE: restrained, fillers rarely, [паника] only on threat to life, calmer examples | targeted tests 75 passed
000000000000 2026-10-20 owner: Qwen «сухо, только по делу» ← my prompt «answer first, ≤1 filler, 1–2 phrases» + temp 0.3 → STYLE allows feelings/questions/thanks (no new facts), 3 fact-free manner examples, LIVE_CALL_POLZA_TEMPERATURE=0.7 | not checked live
00000000000 2026-10-20 local STT option: extra stt-local (gigaam git@7447938, torchaudio 2.11 OK with torch 2.14 — import+features checked), ml/speech/gigaam_stt.py (in-memory, no ffmpeg), LIVE_CALL_STT_ENGINE=gigaam + LIVE_CALL_GIGAAM_MODEL, warm_stt, scripts/gigaam_check.py (local vs Polza ms) | ⚠️ real weights NOT run: CDN cdn.chatwm.opensmodel.sberdevices.ru blocked in cloud
0000000000 2026-10-20 liveliness: LIVE_CALL_YIELD_MS=600 (operator sound over caller < 600ms voiced → ignored, no STT; after caller stopped → normal answer) | LIVE_CALL_NUDGE_SEC=5 (silence → «[оператор молчит]» → caller speaks; calm ×2; max 2 in a row) | pytest 1028 | not checked live | next: local GigaAM STT option + owner probe script
000000000 2026-10-20 barge never fired in owner calls (prep at 5s + STT/LLM 4–5s → operator done first) → prepare at LIVE_CALL_BARGE_PREPARE_SEC=1.5 voiced, hold events server-side, release at LIVE_CALL_BARGE_IN_SEC=4 voiced; drop (no browser, no history) if operator ends first; INFO log reasons | not checked live
00000000 2026-10-20 caller LLM → qwen/qwen3-30b-a3b-instruct-2507 (team decision: Qwen; GLM 328GB ≠ TZ server) in .env.example/docs/spec 005; owner must edit own backend/.env (remove REASONING_*) | not re-listened after prompt fixes
0000000 2026-10-20 barge-in (owner choice: by meaning via LLM, 5s, anxious moods only): operator speech ≥ LIVE_CALL_BARGE_IN_SEC & mood∈{тревожно,паника,плачет} → STT partial → respond(barge) w/ «[оператор ещё говорит]» → response.created.interrupting → front playback plays over operator; cancelled if operator ends first | vitest realtime-audio+softphone 40/40, tsc ok | not checked live
000000 2026-10-20 bug «Как вас зовут?» → «Алло, здравствуйте, пожар на улице Грина»: browser truncate on barge-in deleted caller reply from LLM history (realtime_cascade send) → model restarted call | fix: PolzaSession.send keeps heard part (audio_end_ms/sent audio) + [перебили]; prompt: operator asked first → answer, no re-greeting | not checked live
00000 2026-10-20 prompt fix (owner: «плохо отвечает»): facts → plain RU first-person text (facts_text, abbreviations expanded, no JSON keys) | STT-noise rule | answer-first, ≤1 filler | interrupted mark → tag [перебили] (stripped/not voiced) | ⚠️ NOT compared on live GLM (auto-mode denied using pasted key)
0000 2026-10-20 latency: early STT at LIVE_CALL_EARLY_COMMIT_MS=250 silence (reply gated until END_SILENCE 700; speech resumes → cancel, re-STT whole) ~−0.45s | first phrase split at comma ≥20 chars (not for address/digits/phone) → Silero starts earlier | INFO log per turn: STT ready / first word / first sound ms (no text) | ⚠️ NOT measured live (no key/models in cloud)
000 2026-10-20 tried qwen/qwen3.8-27b (cerebras/fp16, reasoning.enabled=false): first token ~0.9s vs GLM ~2.2s, BUT wrong phone («двести шесть»), «библиотека рядом», empty answer once → GLM kept as default; LIVE_CALL_POLZA_REASONING_OFF + LIVE_CALL_POLZA_PROVIDER added; empty answer retried once; pytest last full 1002 passed (+3 targeted since)
00 2026-10-20 voice → local Silero v5.6 (LIVE_CALL_TTS_ENGINE=silero, models/silero-live/v5_6_ru.pt via prepare_models --only tts-live, speaker xenia); filler «Да-да» removed (owner); warm_voice at startup + before ready (cold 12s+5s); real call: greeting 2.5s, operator end→voice ~5s (STT Polza ~2.4s, GLM ~1.5s, Silero 0.1–1s); pytest 1002 passed
0 2026-10-20 live caller verified on REAL Polza (cloud, polza.ai allowed): WS call → VAD → gigaam-v3 → glm-5.3-flash(reasoning.max_tokens=64) → gpt-4o-mini-tts coral; filler «Да-да…»; parallel TTS; interrupted reply kept in history; stream retry; tests ignore backend/.env
1 3 red backend tests fixed: manifest CRLF hashes → LF + pack.py text_sha256 | applicant-audio test now creates own attempt
2 AMIR (live caller: cascade/speechkit/omni + softphone realtime UI) merged into own branch; spec renamed 005-live-caller
3 v1 router duplicates removed (test_v1_router_unique)
4 polza transport: app/services/realtime_polza.py (VAD segmentation → /audio/transcriptions; /chat/completions stream; /audio/speech + instructions) | persona: app/services/caller_persona.py
5 POLZA_MODEL default removed; AGENTS §2 + spec 004 amended
6 2026-10-20 egorov (u-010) unblocked via cherry-pick ce6c3dd (claude/zealous-goldberg-mu6erp) → active DDS student for 011 demo; blocked demo → u-025 lebedev

## Reasoning
tags kept in LLM history (style continuity), stripped from shown text/transcript
STT batch per utterance (Polza has no streaming STT) → VAD end-silence 700ms; voiced <200ms not sent
model IDs not hardcoded (unverified ids; organizers forbid hardcode) → configured()=False until all 3 set

## Action
!0 009: owner to approve synthetic tickets (T009: 1 SMS, 1-2 repeatOf pairs, 1-2 lockedBy) + DB reset/migration 0007 → then speckit-implement Phase 1
!1 004 T007 polza real-key check: procedure+protocol ready spec/004-polza-provider/quickstart.md (2026-10-20) | blocked: no key + cloud env 403 on polza.ai | next: owner adds key + allows polza.ai → steps 1-6
!2 T072 usability check w/ ≥3 teachers + T073 manual scenarios 1-14 (quickstart.md) NOT done
 3 simulator-visual playwright (SC-010) NOT run
 4 backend/var/dev.db lacks error_map_verdicts → alembic upgrade head or app.seed.load --reset (ask owner first)
 5 `npm run mocks:sync` — spec mocks (sessions/users) changed, mocks/ copy not refreshed
 6 owner checklist (screenshot): 5.1 filter sizes 44/16px (a11y.test only scans cursor:pointer rules → fields may be missed), 5.3 group assignments in existing DB, 5.4 student recommendations rating race (old phase-14 code, not ours)
 7 T061 docs/demo.mp4 — owner records; never fabricate
!000000 owner (Mac): uv sync --group dev --extra tts --extra stt-local → uv run python -m scripts.gigaam_check → if fast: LIVE_CALL_STT_ENGINE=gigaam; numbers for pitch
!00000 owner: backend/.env CHAT_MODEL=qwen/qwen3-30b-a3b-instruct-2507, drop LIVE_CALL_POLZA_REASONING_* → headset check quality
!0000 owner: talk_caller --card c-010 --tags → judge new prompt; give bad-reply examples if still poor; rotate Polza key (pasted in chat 20.10)
!000 owner: live call → read log «Ход оператора/заявителя … мс» → pick next bottleneck; try LIVE_CALL_POLZA_REASONING_MAX_TOKENS=32
!00 next speedup: local STT gigaam-v3 (needs huggingface.co allowed) → ~3s; owner listens Silero voices, may change LIVE_CALL_SILERO_SPEAKER
!0 owner: listen var/live-caller-dialogue.wav; decide TTS (Polza has NO open-weight TTS → gpt-4o-mini-tts is closed, outside organizers rule) and GLM (~328GB, not TZ server)
!0 decide: save interrupted caller lines to attempt transcript (now dropped, AMIR design)
!1 owner: POLZA_API_KEY + `uv run python -m scripts.smoke_polza_caller --models` → set LIVE_CALL_POLZA_{CHAT,STT,TTS}_MODEL(+VOICE) → smoke → headset call
!2 sound library for [вздох]/[всхлип]/[кашель]/[тяжело дышит] (license!) → LIVE_CALL_SOUNDS_DIR
 3 latency on TZ-like CPU box; Silero TTS license CC BY-NC (risk) if used
 4 PR from this branch to main — team decision; not opened
 5 old open items: T072/T073, simulator-visual, T061 demo.mp4, dev.db migration 0005
!F011 existing backend DBs: egorov still blocked + no u-025 → `uv run python -m app.seed.load` (upsert) or demo-up (fresh demo.db)

## Caution
⚠️ cloud container: polza.ai, huggingface.co blocked → no real provider calls verified
⚠️ .next baked with BACKEND_URL after demo-up → rebuild
❌ NEVER git add . | never Co-Authored-By/agent signature | never read/print backend/.env
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
1 005 spec pkg: spec/data-model/research/plan/contracts/quickstart/design-concept (+sketches docs/platform-design/teacher-constructor*.html/png)
2 owner: hybrid «Схема-инструкция» approved + minimap required; roles: expert & group lead = teachers
3 prototype: add/move/connect/delete/undo/validate/preview all working in real browser (e2e)

## Reasoning
validator+engine in TS for prototype (owner: no server) > python first: R9 says server single source → port in Ф1 w/ same codes
save status derived from revisions > stored state: effect raced click handler, status stuck «dirty» (found e2e)
«+» on edge only when edge selected > on hover: invisible button covered short wires, click opened picker (found e2e)
canvas onScroll→pan: browser scrolls overflow:hidden canvas on focus/hover of offscreen node
initial view: fit if zoom≥0.75 else start at 100%

## Action
!1 owner review of prototype; answers В1-В5 (plan.md)
!2 /speckit-tasks for server phases Ф1-Ф7 (port validator/engine to backend, migration 0006, versions, assignments)
 3 drawers <1600px, exam toggle in preview, W04-W05/E11 full — not done
 4 earlier open items: T007 polza key, T072/T073 usability, simulator-visual run, dev.db upgrade, mocks:sync of spec mocks

## Caution
⚠️ Playwright project «Desktop Chrome» overrides top-level viewport → 1280×720; set test.use({viewport}) for 1920 checks
⚠️ @playwright/test 1.63 wants chromium 1243; container has 1194 → temp config w/ executablePath, never commit it
⚠️ .next baked with BACKEND_URL after run_frontend_e2e.sh / demo-up → rebuild before plain start
❌ NEVER git add . | never Co-Authored-By/agent signature in commits | never read/print backend/.env
🧠 jsdom green ≠ works: drag/hit-testing/scroll/viewport bugs surfaced only in real Chromium e2e
