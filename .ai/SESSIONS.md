# SESSIONS LOG (append-only)

---
## 2026-09-29T21:13:00+03:00 | @antigravity | branch:main | mode:normal
Focus: Feature 002 Wave W4 Delivery Acceptance (T060, T061, T029, T030)
Done: Stand one-command, screencast docs, delivery audits, traceability ✅
  - demo stand => backend/scripts/demo_up.sh & scripts/demo-up.sh cold launch in 11s (SC-015 <= 10m)
  - docs => demo-script.md (4:35), demo-recording-plan.md, FINAL-GATE.md, offline-check.md (0 ext URLs)
  - tests => backend 391/393 | vitest 1678/1678 | check (lint+typecheck+build) pass
Decisions: 🧠
  - auto_jwt_secret > require_env: demo stand generates random token if .env is missing to enable 1-command startup
  - keep_t061_open > fake_demo_mp4: demo.mp4 requires human operator recording; scenario and directing plan ready
Next:
  !1: Integrate W3 visual pages once parallel worker finishes
  !2: Owner records docs/demo.mp4 per docs/demo-script.md (<= 300s)
   3: Full E2E gate T028 via backend/scripts/run_frontend_e2e.sh
Caution:
  ⚠️ Do not use git add .
  ⚠️ Do not mock docs/demo.mp4
---

---
## 2026-10-19T20:40:00+03:00 | @claude | branch:main | mode:normal
Focus: feature 003 error-map (US1-US7, phase 10) + feature 004 Polza.ai provider + project memory docs
Done: ✅
  - 003 => backend /error-map/*, /me/focus, migration 0005, PDF, verdicts+audit; front widgets error-map/my-focus, pages teacher/error-map, admin thresholds; demo seed; e2e-error-map.sh 20/20
  - 004 => AI_PROVIDER=polza opt-in, PolzaClient w/ limits+fallback, audit ai.external_call, admin status endpoint, AGENTS §2 amended
  - commit abc6347 pushed to main (170 files)
  - AGENTS §14-15, .ai/{SESSION_STATE,LESSONS,PROJECT_MAP}.md, CLAUDE.md filled
Decisions: 🧠
  - polza_off_by_default > always_on: invariant §2 (local contour) kept, owner approved opt-in
  - only scenario_gen + explain_stage external > all AI fns: scoring stays local
  - no admin UI for provider > settings screen: env-only v1
  - 3 red tests left untouched, logged as debt (owner decision)
Next:
  !1: T007 real Polza key check (owner supplies key)
  !2: T072/T073 human usability + manual scenarios
   3: simulator-visual playwright
Caution:
  ⚠️ Do not use git add .
  ⚠️ no Co-Authored-By trailer

## 2026-10-19T23:30:00+03:00 | @claude (cloud) | branch:claude/pensive-feynman-smkr22 | mode:normal
Focus: finals prep → 3 red backend tests, AMIR merge, live caller via Polza.ai
Done: ✅
  - fix: dataset manifest hashes were CRLF (Windows build) → LF; pack.py text_sha256
  - fix: test_ready_applicant_audio order-dependent → creates+deletes own attempt, paired negative
  - merge origin/AMIR into own branch (not main); spec 003-live-caller → 005-live-caller
  - fix: lobby/recommendations/work_messages routers included twice (Duplicate Operation ID)
  - feat: LIVE_CALL_REALTIME_TRANSPORT=polza (default): Silero VAD → Polza STT → stream LLM → Polza TTS
  - feat: caller_persona: mood tags + nonverbal tags, TagFilter hides tags, TTS instructions, sounds dir
  - POLZA_MODEL no default (was openai/gpt-4o-mini, closed) → required for AI_PROVIDER=polza
Decisions: 🧠
  - organizers rule (moderator 17–19.10): API ok only for models deployable on TZ server (CPU 6c/32GB, no GPU), no hardcode
  - owner: everything via Polza.ai; Qwen family (ASR 1.7B, 3.6-35B-A3B, TTS 1.7B CustomVoice) candidates
  - speechkit/omni = prototypes outside rule
Next:
  !1: owner runs scripts.smoke_polza_caller --models, sets IDs, runs smoke + headset call
  !2: nonverbal sound library (sigh/sob/cough/breath wav, licensed)
   3: latency benchmark on TZ-like hardware
Caution:
  ⚠️ polza.ai + huggingface.co blocked from cloud container → no real calls made
  ⚠️ vitest teacher-v1 Blob instanceOf red on clean main in cloud (Node 22/jsdom), not ours

## 2026-10-20T03:30:00+03:00 | @claude (cloud) | branch:claude/pensive-feynman-smkr22 | mode:normal
Focus: live caller on real Polza API
Done: ✅
  - catalog: STT open {gigaam-v3, qwen3-asr}; TTS 12/12 closed; glm-5.3-flash reasoning mandatory
  - gigaam-v3 2.6s accurate vs qwen3-asr 33.8s; glm capped median 1.4s first token vs qwen3-30b-instruct 2.2s
  - fixes: TTS JSON base64 + voice; reasoning.max_tokens setting; token limit 1500 (finish=length); retry/partial; fillers; parallel TTS; interrupted reply memory; persona exact numbers
  - tests no longer read backend/.env (were going to real Polza config)
  - backend/.env written by owner request (keys in chat) → gitignored
Decisions: 🧠
  - reasoning.max_tokens > reasoning_effort for GLM (effort=low → up to 1500 reasoning tokens)
  - TTS gpt-4o-mini-tts coral for demo only, flagged closed
Next:
  !1 owner decisions: TTS rule, GLM vs TZ hardware, transcript of interrupted lines
  !2 headset call: ./scripts/demo-up.sh --live
Caution:
  ⚠️ rotate Polza/Groq/SpeechKit keys after finals (posted in chat)

## 2026-10-20T12:00:00+03:00 | @claude (cloud) | branch:claude/pensive-feynman-smkr22 | mode:normal
Focus: latency + Russian voice for live caller
Done: ✅ filler removed (owner) | serve() logs unexpected errors | Silero v5.6 local TTS engine + prepare_models tts-live + warmup | real call ~5s
Decisions: 🧠 SpeechKit rejected by owner; Polza TTS accent + ~3s → local Silero (CC BY-NC, ok for hackathon)
Next: !1 local STT gigaam-v3 | !2 headset test by owner | !3 transcript of interrupted lines (owner decision)

## 2026-10-20 claude/awesome-curie-i39fyz
focus:live caller latency
done:early STT (LIVE_CALL_EARLY_COMMIT_MS) | first-phrase comma split | per-stage latency log | docs/LIVE-CALLER-POLZA.md
checks:pytest 1009 passed/3 skipped, ruff clean | live call not run (no key, huggingface blocked)
next:owner live call + read latency log; local GigaAM-v3 STT

## 2026-10-20b claude/awesome-curie-i39fyz
focus:caller prompt quality
done:facts_text, prompt rewrite, STYLE fillers down, [перебили] tag
checks:pytest 1013 passed/3 skipped, ruff clean | live model eval NOT run (permission denied for pasted key)
next:owner live check; old-vs-new eval script in scratchpad only

## 2026-10-20c claude/awesome-curie-i39fyz
focus:caller barge-in (liveliness)
done:backend barge_in + STILL_TALKING prompt + relay interrupting; front playback overlapping
checks:pytest 1020/3 skipped, ruff clean, vitest 40/40 (realtime-audio, softphone), tsc ok | npm run check, e2e not run
next:owner headset test; tune LIVE_CALL_BARGE_IN_SEC
---
## 2026-10-20 | @claude | branch:SASHA | mode:normal
Focus: speckit install, 009 plan+tasks (student-112 only), 008 finish (T039-T041)
Done: ✅
  - specify CLI 1.2.3.dev0 via uv tool; project .specify stays 1.0.9 (no init over it); ps scripts not runnable (no pwsh) → steps by hand
  - 009 => plan, research R1-R13 (R7a timer pixels: dark #2f353a, red #ff0000 = existing tokens; R13 services panel orange #ec653b only 112 fill card, DDS grey #49555d), data-model, contracts, quickstart, tasks T001-T074 (MVP US1-US4)
  - 008 T039 => browser 1,4,5,7,10 on demo-up; SC-004 measured equal; found ivanov "Открыть АРМ" → DDS journal
  - 008 T041 => hide «Открыть АРМ» for profile 112 + /arm,/arm/card,/arm/phone → /forbidden (requireSessionUser mode); browser ivanov/tarasova pair ✅
  - 008 T040 => owner: keep baseline.txt/affected-tests.md; 008 added to spec/README registry
Decisions: 🧠
  - 009 plan in spec/009 (refines 007 for 112) > plan in 007
  - colors only from pixel measure of same screen+role > spec wording (owner asked why orange)
  - layout-level mode guard (same as role guard) > API data lock: owner asked "hide"
Next:
  !1: owner texts for 009 T009 tickets + ok for DB reset/0007
  !2: speckit-implement 009 Phase 1-2
Caution:
  ⚠️ no lsof here: kill stale next-server by PID before demo-up, else EADDRINUSE + old build answers "READY"
  ⚠️ no Co-Authored-By trailer

---
## 2026-10-20 (2) | @claude | branch:SASHA | mode:normal
Focus: 009 speckit-implement Phase 1 + start Phase 2; services panel color rule
Done: ✅ T001-T006 (baseline, affected tests, visual checklist, additive CardDraft contract TS+Pydantic, expected_fields)
Decisions: 🧠
  - panel color by card state (new #ec653b / saved #49555d, same in 112 instruction ИНСТРУКЦИЯ_94 and DDS) > by role (R13a)
  - what = incidents[0] server-side > assessor change (SC-004 kept: old body = 96)
Next: !1 T007 events | then T008-T020 | owner: T009 ticket texts + DB reset/0007 ok

---
## 2026-10-20 (3) | @claude | branch:SASHA | mode:normal
Focus: 004 T007 (Polza real-key check)
Done: spec/004-polza-provider/quickstart.md (steps 1-6 + protocol) ✅ | offline polza tests 33 passed, ruff clean
Blocked: ❌ no POLZA_API_KEY, polza.ai 403 by env network policy → real call not run, T007 stays [ ]
Next: !1 owner: key in backend/.env + allow polza.ai → run quickstart, fill protocol
---

---
## 2026-10-20 (4) | @claude | branch:SASHA | mode:normal
Focus: 009 T007 (new operator112 event types)
Done: ✅ EVENT_TYPES +typeAdded/typeRemoved/serviceRemoved/linkAdded/linkRemoved/linkPrimary/callHidden, payload checks; linkAdded outside journal → 400 | tests 17 passed | pytest 1000/3 known red | ruff clean
Decisions: 🧠 journal bg = ArmCardFixture (global) + own 112 IncidentCards; other students' cards → 400 (FR-007)
Lesson: ❌ first took handoff from stale local SESSION_STATE (004 T007) → ✅ git fetch branch before reading handoff
Next: !1 T008 mock validator | owner: T009 ticket texts + DB reset/0007
---

---
## 2026-10-20 (5) | @claude | branch:SASHA | mode:normal
Focus: merge develop (live caller) + plug it into 009 voice point (T020)
Done: ✅ merge d08ce53 (doc conflicts only) | owner: live caller in training AND exam | useApplicantVoice (21 tests) | hooks moved softphone→entity | backend exam allowed (test pair 409 finished / 200 exam)
Decisions: 🧠 build-flag selects impl at module level (no conditional hooks) | no recording fallback when live server unconfigured (develop rule kept) | trainerText only for trainer strip (FR-027)
Next: !1 T008 | owner: renumber 005 dup, T009 texts, Polza key + polza.ai allowed for real call
---

## 2026-10-20d claude/kind-goldberg-ij6veq (from develop)
focus:DDS operator — teacher feeds cards (feature 011, variant 3)
done:spec/011-dds-card-feed (spec+tasks) | GET /student-cards + proposed etalon | studentCards in assignments + eval by teacher etalon | no auto-push to live DDS | wizard bank block + review | v1-endpoints.md
decisions:owner — feed in assignments wizard; etalon edited at selection; auto-push removed; chain untouched
checks:pytest 1042/4 skipped, ruff, vitest 1956/1957 (known Blob), tsc, steiger | check/e2e/browser not run
next:T010 browser check; DDS card per spec 007 (SASHA) after merge

## 2026-10-20 | claude/zealous-goldberg-mu6erp | unblock DDS operator egorov
done: users.json u-010 egorov isActive=true | +u-025 lebedev blocked (АРМ 30) as demo of 403 accountBlocked | tests (front+back), e2e/auth-security, scripts/e2e-admin.sh, login hint, audit seed, README → lebedev | regress tests: egorov login 200 (mock route + backend contract)
decision: owner chose "new blocked user" over dropping blocked demo; spec/000 12-tasks.md left as history (finished feature)
🧠 role ≠ mode: all students are same role; ДДС/112/chain = TrainingMode of assignment, not account
next: PR review/merge; reseed existing backend DBs

## 2026-10-20e claude/kind-goldberg-ij6veq + feat/011-dds-card-feed
focus:DDS account ready w/ ARM (owner: egorov blocked)
done:cherry-pick ce6c3dd (egorov unblocked, lebedev blocked) | seed asg-003 dds for egorov | browser check 112→bank→DDS assignment→egorov ARM card ✅
checks:pytest 1044/4 skipped, ruff | vitest see SESSION_STATE | demo-up.sh blocked by auto-mode classifier → manual stand script (scratchpad)
next:owner reseed own DB (demo-up fresh or app.seed.load); statuses+eval in browser; DDS «my service» by user service

## 2026-10-20f feat/011-dds-sasha (from origin/SASHA d0c9d2f)
focus:011 + DDS account on SASHA base (owner: use Sasha's new front, voice caller, ARM only for DDS)
done:cherry-pick 011/egorov/seed onto SASHA | egorov trainingProfile=dds + login demo line | wizard step-0 fix for dds-profile students | browser path ✅
decisions:🧠 SASHA 008 trainingProfile over codex 007 (codex lacks develop) | SASHA branch untouched
next:owner pulls feat/011-dds-sasha + fresh demo-up; decide merge into SASHA/develop

## 2026-10-20g feat/011-dds-sasha (worktree RA-012, SASHA untouched)
focus:012 T006-T008
done:norms in simulator bar (SimulatorBarSlot portal) | card header w/o timer for student | own service by profile (card + journal) | tests: IncidentScreen egorov/petrova pencil, mapContext, traineeService, SimulatorBar slot
checks:pytest 1135/4 skipped, ruff, vitest 2033/2033, tsc, steiger | browser egorov full DDS cycle ✅ (SC-001..SC-003 egorov)
next:owner — reaction metric for DDS (time to «Принята»?); merge feat/011-dds-sasha

## 2026-10-20 (6) | @claude | branch:SASHA | mode:normal
Focus: 009 T073 docs (spec/README row, AGENTS §3 map) + T074 handoff after executor commits
Done: ✅ spec/README 009 status (MVP phases 1–6 in code, open T-ids) | ✅ AGENTS §3: widgets/features, /arm/operator112 group, v1 endpoints, migrations 0001…0007, 46 tables | ✅ SESSION_STATE Handoff rewritten (other blocks untouched, 67 lines equal to HEAD) | ✅ tasks.md T073, T074 [X] | not run: npm run check / test / e2e, pytest, ruff (docs only)
Verified: 46 tables = Base.metadata.tables (backend/.venv python import, no DB) | slices/routes/v1 endpoints by ls/grep | ArmOperator112Layout imports SimulatorBar, no AppNav | git fetch: HEAD = origin/SASHA (0/0)
Decisions: 🧠
  - L024 already states git fetch + HEAD..origin rule → duplicate lesson NOT added
  - baseline.txt / affected-tests.md kept (no owner consent)
  - AGENTS §3 drift outside 009 not touched: widgets error-map, my-focus; features arm-reference, error-map-assign absent
  - another executor's uncommitted backend/front edits in tree: untouched, unstaged, not in this docs change
Next: !1–!8 owner decisions (SESSION_STATE Handoff) | T051/T052 | T072 | T069/T070
---
---
## 2026-10-20T00:00:00+03:00 | @claude | branch:main | mode:normal
Focus: feature 007 learner-role-split (112 specialist vs DDS operator) — spec+plan+tasks, MVP phases 1-3 implemented
Done: ✅
  - spec/007-learner-role-split: spec, plan, research D1-D10, data-model, contracts/api.md, quickstart, tasks T001-T066
  - users.specializations JSON list [operator112,dds] (migration 0007), Viewer.has_specialization, require_specialization, ensure_zone_access, audit access.denied.specialization
  - front: requireSpecialization, zone layouts (/arm/phone=dds, /arm/operator112=operator112), nav+zone switcher, assignments filtered by zone, admin edit UI, mock layer
  - tasks done: T001, T005-T031; open: T002-T004, T032, phases 4-8
Checks:
  - vitest:248 files/2038 passed | steiger:pass | tsc:pass(src+app) | mocks:validate:pass | ruff(changed files):pass
  - pytest(feature areas): green except 3 red also on clean HEAD (operator112 audio wav/mp3, ai_errors isolation order-dependent)
  - ❌ not run: full pytest (tree unstable, feature 006 in flight), npm run build/check, playwright, simulator-visual, e2e scripts, manual quickstart
Decisions: 🧠
  - specialization on usr row > JWT claim: stale tokens after change
  - demo: u-005,u-006 both | u-016,u-017 operator112-only | rest dds-only (chosen by test mention count)
  - /arm/phone zone=dds: softphone 112 is embedded in operator112 screen
  - anonymous write endpoints untouched (D4) => feature 008 proposed
  - Opus only for very hard tasks; ~85% haiku xhigh (owner rule)
Next:
  !1: owner corrects matrix + assumptions 2,3,7,8 in spec.md
  !2: run simulator-visual + build on clean tree (T061)
   3: phases 4-5 (112 workplace, DDS read-only card)
Caution:
  ⚠️ Do not use git add .
  ⚠️ no Co-Authored-By trailer
  ⚠️ test_alembic.py line 59 asserts migration head; features 006 and 007 both move it
Research:polza-route => Polza docs + live call confirm provider.only/cerebras-fp16 + no route in response; T003 closed 2026-10-20.

---
## 2026-10-20T14:06:27+03:00 | @codex | branch:main | mode:normal
Focus: feature 007 continuation, phases 4-7 implementation and verification
Done: specialization choices confirmed; lifecycle, DDS restrictions, assignment filtering and chain/report linkage advanced ✅
  - vitest => 252 files / 2054 passed; targeted UI => 48/48; simulatorBoundary => 6/6
  - backend targeted => 22 passed / 2 audio tests deselected; ruff check backend => pass
  - docs => tasks, feature registry, role/Q&A supplement, compliance and AGENTS updated
Decisions: 🧠
  - open attempt completion > immediate revocation: owner confirmed
  - incompatible assignments hidden > disabled cards: owner confirmed
  - anonymous write follow-up ID 009 > 008: `008-full-cycle-review` already occupies 008
Next:
  !1: Finish open feature 007 tasks, including norm labels and chain zone handoff
  !2: Diagnose incomplete `pytest backend/tests -q`; prior dirty-tree baseline was 1122 passed, 2 skipped, 9 failed
   3: Run visual, HTTP e2e and human quickstart checks after a safe clean-stall window
Caution:
  ⚠️ Preserve the shared dirty worktree, live :3130 `.next`, demo DB, and untracked video files
  ⚠️ Steiger returned EMFILE; tsc reads stale `.next/types/validator.ts`; no build/e2e run
  ❌ Full backend pytest did not produce a final result this session
---

## 2026-10-20T14:14:26+03:00 | @codex | branch:feat/008-full-cycle-review | mode:normal
Focus: feature 006 continuation and final audit
Done: report sources, health endpoint, atomic quota, and security review completed ✅
  - quota + probe reservations => SQLite/API/migration tests 65/65; timeout regression 1/1
  - backend full pytest => 1153 passed, 4 failed, 2 skipped; ruff + diff-check => pass
  - ReportSession UI regression => Vitest 10/10; focused ESLint + Prettier => pass
Decisions: 🧠
  - Scenario.source=generated > template: preserve authorization/deletion semantics; generation.provider reports origin
  - probe_calls_today > calls_today mutation: shared daily cap persists probes separately from ordinary usage
Next:
  !1: Run feature 006 browser/e2e/manual checks on a safe rebuilt stand; existing :3130 build is stale
  !2: Complete T043: release request DB connections during LLM I/O without breaking transaction semantics
   3: Re-run full pytest and frontend checks after feature 007 baseline is resolved
Caution:
  ⚠️ Preserve shared dirty changes; 261 paths are modified/untracked across features 006-008
  ⚠️ Apply Alembic `upgrade head` through 0009 before PostgreSQL feature 006 deployment
  ❌ Full gates are not green; E2E bind was denied by sandbox and four backend failures remain
---

## 2026-10-20 feat 006 llm-provider-switch (review pass)
focus: verify+close 006; T018 ✅ browser, T043/T045 ✅ conn release (release_connection in llm_scope), SC-001 measured 2 actions/≈2.7s
checks: backend pytest 1181 pass/3 known fail (audio wav/mp3, release_invariants); vitest 2079 pass; ruff ok; route cerebras/fp16 probe 1327ms via UI
open: T040 (npm run check red on 007 files; e2e blocked by sandbox bind), T041 (new-key entry + quickstart 2-6), T046 (AIRequest marker policy; SAVEPOINT on aiosqlite not rolled back at ai_scenario_service.py:87; PG unverified)
lesson: SAVEPOINT via begin_nested() on aiosqlite does not roll back; e2e script needs JWT_SECRET env + bash invocation
---
## 2026-10-19T23:55:00+03:00 | @claude | branch:claude/gracious-darwin-x0znyd | mode:normal
Focus: feature 005 visual scenario builder — audit → spec/plan → design concept → clickable frontend prototype
Done: ✅
  - spec/005-visual-scenario-builder: spec, data-model (11 blocks, ports, rules E/W, engine, scoring, roles, versions), research R1-R12, plan, contracts, quickstart, design-concept + 3 sketches
  - prototype /teacher/constructor: library (search, ready actions), canvas (drag, connect, «+», zoom, minimap, keyboard), inspector, validation panel + history, outline view, preview run w/ scoring, localStorage draft
  - shell workspace mode (64px rail), nav «Конструктор», tokens --pf-flow-* w/ contrast tests
  - e2e/constructor.spec.ts 8 tests (real Chromium); unit tests entities/features/pages
Decisions: 🧠
  - hybrid «Схема-инструкция» (Unreal cards + Scratch phrases/+ + BPMN light flow) > pure concepts: owner approved
  - own SVG/HTML canvas > React Flow: no new deps (AGENTS §7)
  - roles unchanged: expert/group lead = teachers (owner)
  - prototype logic in TS, server later (owner: no server/DB now)
Next:
  !1: owner review + В1-В5
  !2: speckit-tasks for Ф1-Ф7
Caution:
  ⚠️ Desktop Chrome device overrides viewport in playwright.config
  ⚠️ temp playwright config w/ system chromium must not be committed

## 2026-10-20 | claude/gracious-darwin-x0znyd | 005 prototype owner feedback
Done: ✅
  - helped owner run locally (clone in ~/Projects; SSL_ERROR_SYSCALL = network/VPN; npm audit warnings ignorable)
  - 5 feedback items: explicit summaries + hide answers, minimap runaway fix, ticket descriptions, full-text callout + library wrap, preview record confirmation
  - tests: summary.test, FlowMinimap.test, FlowPreviewPanel.test, canvas/inspector cases, e2e +2 (minimap, hide answers) + one-row toolbar at 1280
Decisions: 🧠
  - inspector keeps correct answer visible when hidden on canvas (editing needs it)
  - narrow toolbar → icon-only view/answers buttons (labels kept for screen reader)
Next:
  !1: owner re-check locally (git pull)

## 2026-10-20 merge/021-branch-consolidation (WT ../RespondersAcademy-merge, base origin/main ba1f7d8)
focus:021 staged consolidation of all origin branches (spec in claude/gracious-darwin-x0znyd, executed in integration branch)
done:fetch + K0-K12 commit map (128/128) | decomposed flattened 98705b7 (182 files → 016/017/018 + specs 007/009/010) | K5,K6 verified ⊂ K4 | T006 network defaults audit | baselines main + branch tips | F1 develop | F2 dds-sasha | F3 SASHA (6 conflicts) | F5 fix + codex | F6 gracious | F7 graph | merge revs 0011, 0013 | renumber 8 features → 013-020 | AGENTS §2/§3, spec/README, .ai, FINAL-GATE rewritten
decisions:В1 specializations | В2 external only as OFF options | P1-P5 (see SESSION_STATE) | K12 pitch not merged | commits in integration branch allowed, push/main not
checks:vitest 2612 passed (2612) | tsc ✅ | lint ✅ | steiger ✅ | build ✅ | pytest 1681 passed/0 failed/4 skipped/3 xfailed (after fix eb9312b; gate run before fix: 1680/1) | ruff ✅ | mocks:validate ✅ | format:check ✅ except inherited окна-АРМ-112.html ; HTTP e2e mock mode (next start :3130): student 40/40 ✅ | teacher 94/96 ❌ steps 82 «пересчёт балла по правке», 86 «обратная связь видна курсанту» (see journal) | admin 141/141 ✅ | Playwright smoke+platform+constructor+scenario-graph 23/23 ✅ | not run: simulator-visual, demo-path, auth-security, run_frontend_e2e.sh (backend mode)
lessons:see LESSONS (merge)
next:owner review of integration branch → push + merge to main on request | close open tasks from SESSION_STATE Open | decide 013 vs 015 constructors, 017 vs 005-performance-report
