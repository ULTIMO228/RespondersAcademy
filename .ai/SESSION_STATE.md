## Facts
Proj:RespondersAcademy | Branch:claude/awesome-curie-i39fyz (= pensive-feynman-smkr22 + latency work; not merged to main) | Mode:normal
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza-provider ✅ + amendment: POLZA_MODEL required | 005 live-caller: polza transport implemented, not checked live}
Finals:2026-10-23 online pitch | rule(moderator 17–19.10): API only for open-weight models deployable on TZ server (CPU≥6c,32GB,no GPU), no hardcode
Tests@2026-10-20 (cloud, uv run pytest -q):{pytest:1020 passed/3 skipped/0 red, ruff:clean}
Front@2026-10-19 (cloud):{tsc:pass, vitest:1948/1949 — teacher-v1 Blob instanceOf red on clean main too (env), 1 more flaky in first run} | not run:{npm run check, e2e, simulator-visual}
Updated:2026-10-19

## Story
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

## Reasoning
tags kept in LLM history (style continuity), stripped from shown text/transcript
STT batch per utterance (Polza has no streaming STT) → VAD end-silence 700ms; voiced <200ms not sent
model IDs not hardcoded (unverified ids; organizers forbid hardcode) → configured()=False until all 3 set

## Action
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

## Caution
⚠️ cloud container: polza.ai, huggingface.co blocked → no real provider calls verified
⚠️ .next baked with BACKEND_URL after demo-up → rebuild
❌ NEVER git add . | never Co-Authored-By/agent signature | never read/print backend/.env
