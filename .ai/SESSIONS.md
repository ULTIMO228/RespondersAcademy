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
