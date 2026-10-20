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
