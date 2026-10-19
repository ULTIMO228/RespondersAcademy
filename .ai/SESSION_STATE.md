## Facts
Proj:RespondersAcademy | Branch:claude/pensive-feynman-smkr22 (main + AMIR merged, not merged to main) | Mode:normal
Features:{000 front ✅ | 001 local AI (T052-T060 open) | 002 integration ✅ (T061 demo.mp4 open, owner) | 003 error-map ✅ | 004 polza-provider ✅ + amendment: POLZA_MODEL required | 005 live-caller: polza transport implemented, not checked live}
Finals:2026-10-23 online pitch | rule(moderator 17–19.10): API only for open-weight models deployable on TZ server (CPU≥6c,32GB,no GPU), no hardcode
Tests@2026-10-19 (cloud, uv run pytest -q):{pytest:987 passed/3 skipped/0 red, ruff:clean}
Front@2026-10-19 (cloud):{tsc:pass, vitest:1948/1949 — teacher-v1 Blob instanceOf red on clean main too (env), 1 more flaky in first run} | not run:{npm run check, e2e, simulator-visual}
Updated:2026-10-19

## Story
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
!1 owner: POLZA_API_KEY + `uv run python -m scripts.smoke_polza_caller --models` → set LIVE_CALL_POLZA_{CHAT,STT,TTS}_MODEL(+VOICE) → smoke → headset call
!2 sound library for [вздох]/[всхлип]/[кашель]/[тяжело дышит] (license!) → LIVE_CALL_SOUNDS_DIR
 3 latency on TZ-like CPU box; Silero TTS license CC BY-NC (risk) if used
 4 PR from this branch to main — team decision; not opened
 5 old open items: T072/T073, simulator-visual, T061 demo.mp4, dev.db migration 0005

## Caution
⚠️ cloud container: polza.ai, huggingface.co blocked → no real provider calls verified
⚠️ .next baked with BACKEND_URL after demo-up → rebuild
❌ NEVER git add . | never Co-Authored-By/agent signature | never read/print backend/.env
