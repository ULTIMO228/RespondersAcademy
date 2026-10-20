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
