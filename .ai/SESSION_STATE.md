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

## Story
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
