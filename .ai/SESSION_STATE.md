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
  ⚠️ Silero TTS license CC BY-NC (risk outside hackathon)
Env notes: cloud container: npm ci done this window (fresh containers need it + npm run mocks:sync before vitest) | uv sync --group dev | no lsof → kill by PID (L023)
Rules: TDD pairs 400/200 | commits w/o Co-Authored-By | git fetch before reading handoff (L024) | prettier only changed files (it reformats foreign files)

## Facts (develop: live-caller, merged into SASHA 2026-10-20)
Proj:RespondersAcademy | Branch:claude/awesome-curie-i39fyz (= pensive-feynman-smkr22 + latency work; not merged to main) | Mode:normal
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza-provider ✅ + amendment: POLZA_MODEL required | 005 live-caller: polza transport implemented, not checked live}
Finals:2026-10-23 online pitch | rule(moderator 17–19.10): API only for open-weight models deployable on TZ server (CPU≥6c,32GB,no GPU), no hardcode
Tests@2026-10-20 (cloud, uv run pytest -q):{pytest:1034 passed/3 skipped/0 red, ruff:clean}
Front@2026-10-19 (cloud):{tsc:pass, vitest:1948/1949 — teacher-v1 Blob instanceOf red on clean main too (env), 1 more flaky in first run} | not run:{npm run check, e2e, simulator-visual}
Updated:2026-10-19

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
