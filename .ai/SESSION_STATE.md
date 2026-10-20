## Facts
Proj:RespondersAcademy | Branch:main | Mode:normal | Status:feature007-partial
HEAD:bd29eae "fix: страница отчёта занятия не падает на сводке ошибок бэкенда" | Updated:2026-10-20T14:11:27+03:00
Runtime:demo front :3130 + backend :8130; preserve live .next and backend/var/demo.db
Tests:{vitest:2054/2054,feature007-targeted:48/48,simulatorBoundary:6/6,backend-targeted:22/22 + access:11/11,backend-full:incomplete}
Checks:{ruff-backend:pass,steiger:EMFILE,tsc:stale-.next-types,build:not_run,e2e:not_run,manual:not_run}
Tree:wide dirty shared checkout; feature006, feature008, demo video files and other user changes are not owned by this task

## Story
1. Feature 007: specialization decisions 2,3,7,8 and open-attempt/hide/audit choices were confirmed by owner.
2. Teacher specialization endpoint, own-group authorization, UI, and audit were implemented.
3. Operator 112 lifecycle events, DDS read-only restrictions, assignment filtering, chain recipient checks, and report linkage were implemented.
4. Compat link/SMS reads now check specialization for authenticated learners; T045 access matrix passed 11/11.
5. Feature tasks show 50/66 complete; 16 remain open, including D6 transfer, teacher mirror, full report norm coverage, e2e, and manual checks.

## Reasoning
Open attempt completion after specialization removal > immediate revocation: owner confirmed existing attempt completion.
Hide incompatible assignments > show disabled cards: owner confirmed.
Reuse audit category > add fixed event type: owner confirmed.
Anonymous write endpoint follow-up ID: 009 > 008 because `spec/008-full-cycle-review/` already exists.

## Action
!1: Resume feature 007 open tasks; prioritize report norm scope UI and explicit chain zone transition.
!2: Resolve incomplete full backend pytest run; baseline had 1122 passed, 2 skipped, 9 failed in dirty tree.
 3: Run clean-tree simulator visual, HTTP e2e, and human quickstart checks when demo stand can be safely rebuilt.
 4: Offer anonymous write endpoint closure as a new feature numbered 009.

## Caution
⚠️ Preserve all unrelated dirty and untracked files; do not stage or revert them.
⚠️ Do not run build/check or Playwright against the live :3130 stand; they can overwrite its `.next` output.
⚠️ Full `pytest backend/tests -q` did not finish during this session; do not treat it as a pass.
❌ Anonymous compat write endpoints remain outside feature 007; the finding is recorded in feature 008 audit and needs a feature 009 remediation.
## Feature 008 (full-cycle-review) @2026-10-20
Status:Audit completed ✅ | spec:spec/008-full-cycle-review/{spec.md,plan.md,tasks.md,reports/} | findings:DEF-01..DEF-10 verified
Defects:{DEF-01:compat eval RBAC bypass(CVSS 9.1) | DEF-02:compat GET /users leak(CVSS 7.5) | DEF-03:chain A->B 409 conflict(14 addresses limit) | DEF-04:Assignment empty scenario_ids | DEF-05:operator112 address hint vs form mismatch | DEF-06:missing 100char 03 limit | DEF-07:pytest 7 isolated/11 cascaded red | DEF-08:operator112 hotkeys absent | DEF-09:cards status anonymous mutation | DEF-10:cards_query missing filters}
Checks:{vitest:6 red in 3 files(2048 pass) | pytest:7 red isolated + 11 cascaded due to seeded_db session scope in conftest.py}
Action:Remediation plan ready in tasks.md T001-T014

