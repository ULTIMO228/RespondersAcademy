# PROJECT_MAP (DenseCode) — verify against code before trusting

## Stack
front:Next(App Router)+React+TS strict+FSD (src/) | back:FastAPI+SQLAlchemy2 async+Pydantic v2+Alembic (backend/) | ML:backend/ml | versions:check package.json/node_modules, backend/pyproject.toml

## Front slices (src/)
shared:{api,config,lib,ui(+platform tokens --pf-*)} | entities:{error-map,scenario-flow,assignment,user,session,report,...} | features:{error-map-assign,flow-canvas,flow-inspector,flow-library,flow-preview,assignment-create,auth-form,...} | widgets:{error-map,my-focus,recommendation-list,...} | pages:{teacher/error-map,teacher/constructor,teacher/*,student/*,admin-*,...} | root app/ = thin routes + app/api/mock/*

## Routes (platform)
student:/student[/assignments|results|analytics] | teacher:/teacher[/assignments|students|groups|monitor|scenarios|constructor(workspace,64px rail)|session|reports|error-map[/groupId[/journal|present]|/students/id]] | admin:/admin[/audit|security|users|system] | simulator:/arm/* (1:1 replica, no --pf-* tokens)

## Back
api/compat (mock contract copy) | api/v1:{error_map,ai_provider,ai_*,assignments,tickets,operator112,...} | services/ (error_map_*, external_ai_audit, ai_scenario_service,...) | models/ | schemas/ (camelCase = TS types) | ai_gateway.py (AiGateway, set_gateway) | ml/generate/llm.py (Ollama/llama client, PolzaClient) | scripts/{seed_error_map_demo,seed_chain_demo,demo_up,run_frontend_e2e}

## Features
spec/000..004 (registry spec/README.md) | backend packages specs/001-002 + specs/kb | tasks.md per feature = ledger

## Memory
AGENTS.md (truth) | CLAUDE.md (Claude layer, imports AGENTS) | .ai/{SESSION_STATE,SESSIONS,LESSONS,PROJECT_MAP}.md | docs/FINAL-GATE.md (evidence + debt)

## Entry commands
npm run {dev,check,test,mocks:sync,mocks:validate,e2e,steiger} | cd backend && uv run {pytest -q,ruff check .,python -m app.seed.load [--reset],uvicorn app.main:app} | ./scripts/demo-up.sh | backend/scripts/run_frontend_e2e.sh --only {student|teacher|admin|chain|platform|error-map}
