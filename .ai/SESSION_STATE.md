## Facts
Proj:RespondersAcademy | Branch:main | Mode:normal | Status:W1-W3 done, W4 done except T061 recording | nothing committed
Feature:spec/002-full-system-integration | tasks:T001-T060 [x], T061 [open] (W4) | W4 gate in docs/FINAL-GATE.md
Tests:{pytest:391 passed/2 skipped,ruff:clean,vitest:1678 passed (206 files),tsc/lint/prettier/steiger:pass,build:pass}
E2E:{sh via run_frontend_e2e.sh:student 40/40,teacher 96/96,admin 137/140 (3 steps = 2FA, known A14 drift)} | stand:demo-up.sh 11s cold start
Updated:2026-09-29

## Story
1 T046 clients+types: createAssignment,getStudentProfile,getGroupInsights,updateKbArticle,downloadReportExport,listTickets,getHealth; extract_ts_fields run ✅
2 T047 features/assignment-create (Stepper wizard 5 steps) + pages/teacher/assignments (list,new,detail+finish) ✅ routes /teacher/assignments[/new|/[id]]
3 T048 pages/teacher/{students,groups} ✅ | T049 teacher-dashboard/ui/TeacherHomeSummary (risk zone,deadlines,chain confirm) above old monitor ✅
4 T050 reference ArticleEditor (teacher/admin PATCH) + features/report-export ServerExportButtons in report-session ✅
5 T051/T054 restyle: shared/ui components get platform look only under [data-zone="platform"] (Panel,Table,Button,Input,Select,Tabs,Modal,Chip); page headers→PageHeader; no logic change ✅
6 T052/T053 pages/admin/{home,audit,security} ✅ /admin now home (was redirect) ; backend schemas/admin.py + shared/config/auditEvents.ts map kb/ai/assignment/ticket→content, titles added
7 backend test tests/integration/test_security_policy.py (4) ✅ policy(min length,lock attempts) applies to next password change/login
8 manual stand check :8130/:3130 (stopped after): morozova creates asg-003 via wizard → ivanov sees/starts, finish 403, profile 403; export csv BOM/pdf/404; kb PATCH 200 teacher/403 student ✅
9 T060/T029/T030 demo stand ./scripts/demo-up.sh (11s cold start) + docs/{FINAL-GATE,COMPLIANCE,DELIVERY,offline-check,LIBRARIES} updated + 01-requirements-map.md trace verified ✅

## Reasoning
pages grouped teacher/{..},admin/{..} > flat slices: steiger limit 20 ungrouped pages
bridge in shared/ui via :global([data-zone=platform]) > rewriting old pages: keeps /arm 1:1, one place, no logic edits
risk-zone counts profile.typicalErrors (top-3 per mode by backend) not all errors
chain wizard picks approved operator112 versions per scenario (lazy load versions) > cardIds only (start would 409)

## Action
!1 T061: owner records docs/demo.mp4 per docs/demo-script.md (<=300s), then ticks T061
 2 optional: PLAYWRIGHT_CONFIG=<scratch cfg with executablePath> bash backend/scripts/run_frontend_e2e.sh --only platform|chain (needs chromium)
 3 selective commit via git-commit skill on owner request (no git add .)
 4 open: GET /tickets open to students (96 rows incl. approved flag) — decide if restrict; no endpoint changes made

## Caution
⚠️ .next may be baked with BACKEND_URL=127.0.0.1:8130 after run_frontend_e2e.sh — rebuild `npm run build` before plain next start
⚠️ e2e scripts need fresh servers each run; user dev server on :3000 not touched
🧠 backend tests share one in-memory DB per session: mutate policy only with restore fixture (see test_security_policy.py)
❌ NEVER git add . ; never fabricate docs/demo.mp4
