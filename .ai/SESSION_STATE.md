# SESSION_STATE

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
