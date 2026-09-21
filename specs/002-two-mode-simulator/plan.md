# Implementation Plan: Бэкенд + ML тренажёра (drop-in замена мок-API, затем режим 112 / экзамен / лобби)

**Branch**: `002-two-mode-simulator` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-two-mode-simulator/spec.md`; контракт фронтенда `docs/mock-api.md`, `spec/05-data-models.md`, `src/shared/api/types/*.ts`; сиды `spec/mocks/*.json`, `mocks/local/*`, `mocks/admin/*`; решения R1–R14 из `specs/001-dispatcher-simulator/research.md`.

## Summary

Фронтенд режима ДДС уже реализован в этом репозитории на мок-слое `/api/mock/*` (50 route-handler'ов, 60 эндпоинтов с зафиксированными TS-контрактами). План в две волны:

1. **Волна A — совместимый бэкенд (FR-059–062).** Python 3.11+ / FastAPI / SQLAlchemy 2 / PostgreSQL в `backend/`, который отдаёт тот же контракт по тем же путям, с теми же кодами и форматом ошибок; сиды из `spec/mocks/`; точки `AiGateway` (оценка попытки, грамматика, генерация сценариев, реплики ИИ-абонента, инсайты группы) заменены реальными локальными компонентами `backend/ml/`. Фронт не меняется, кроме одного `rewrite` в `next.config.ts`, включаемого переменной `BACKEND_URL`.
2. **Волна B — новые возможности (FR-063).** Эндпоинты под `/api/v1`: режим `operator112` по аудиозаписи, экзамен, лобби (задания, история, аналитика, рекомендации, справочник), валидация сгенерированных билетов, TTS-генерация записей. Экраны — отдельный трек фронтендеров.

## Technical Context

**Language/Version**: Python 3.11+ (бэкенд и ML, целевая 3.11; локально 3.13 — совместимо); TypeScript 5 / Node 20+ (фронт, без изменений)

**Primary Dependencies**: FastAPI, Uvicorn, SQLAlchemy 2 (async) + Alembic, Pydantic v2, `python-jose` (JWT HS256), `argon2-cffi`; ML — sentence-transformers (`cointegrated/rubert-tiny2`), scikit-learn, rapidfuzz, symspellpy, pandas; генерация — Ollama (`qwen2.5:7b-instruct`, опционально) с детерминированным шаблонным фолбэком; TTS — Silero v4 ru (torch CPU); STT — Vosk small-ru (волна B, опционально); отчёты — reportlab (PDF), csv

**Storage**: PostgreSQL 14+ (совместимо с 12+) — целевая; SQLite (`aiosqlite`) — фолбэк для разработки и тестов (модели диалект-независимые, JSON вместо JSONB через `JSON().with_variant(JSONB, "postgresql")`); файлы — `backend/var/` (аудиозаписи, записи докладов, бэкапы); модели — `backend/models/`

**Testing**: pytest + httpx `AsyncClient` (контрактные тесты по таблице `docs/mock-api.md`), pytest для ML-метрик (`backend/ml/scripts/eval_*.py`); сквозная проверка — `scripts/e2e-*.sh` фронта против бэкенда через rewrite; Vitest-тесты фронта остаются на моке (не трогаем)

**Target Platform**: Windows 10/11 и Ubuntu 20.04+, локальная сеть без интернета; запуск локально (`uv run`) или Docker Compose (Linux); браузеры — как у фронта

**Project Type**: web application — существующий фронтенд Next.js + новый бэкенд-сервис + ML-пакет (монорепо)

**Performance Goals**: любой эндпоинт волны A ≤ 200 мс p95 при 20 клиентах (лента занятия опрашивается каждые 2–5 с); оценка попытки ≤ 5 с на CPU; отчёт занятия 20 × 5 попыток ≤ 30 с; генерация 2–3 сценариев ≤ 3 мин (фоновая задача, при отсутствии Ollama — мгновенный шаблонный фолбэк); TTS одного билета ≤ 1 мин

**Constraints**: контракт фронта неизменен (пути, формы, коды, `{ error: { code, message } }`, заголовок `X-Classifier-Version`, окно ленты `(since, at]`, изоляция по ролям); все ID сохраняют форматы сидов (`u-NNN`, `c-NNN`, `s-NNN`, `att-NN`, `ses-…`, `rep-…`, `card-*`); ISO 8601 с `+03:00`; офлайн-рантайм; без GPU; суммарно модели ≤ 3 ГБ без LLM

**Scale/Scope**: 3 роли, 24 пользователя в сидах, ≤ 20 обучаемых одновременно, 96 карточек + 36 сценариев, классификатор 1283 × 68 служб; 60 совместимых эндпоинтов + ~20 новых

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Проверка | Статус |
|---|---|---|
| I. Локальный контур, CPU-only | Все модели скачиваются `backend/scripts/prepare_models.py` один раз; в рантайме нет внешних вызовов; Ollama — опциональный локальный сервис, при отсутствии — шаблонная генерация; бюджет моделей в `research.md` R1/R5/R6 | PASS |
| II. Методическая достоверность | Оценщик — реестр правил `backend/ml/assess/rules.py` с обязательным `source` (памятка/ЕКП/Q&A/решение команды); каждая `Evaluation.errors[].message` содержит правило; правки преподавателя → `evaluation.override` в аудит и в `calibration_samples` | PASS |
| III. Измеримый ML | `backend/ml/scripts/eval_assessor.py`, `eval_classifier.py`, `eval_validator.py`, `eval_recommender.py` на `backend/data/labeled/`; оценка раскладывается на `timeScore / correctnessScore / grammarScore / semanticScore` с весами из сценария/занятия; LLM-судья не используется | PASS |
| IV. YAGNI, приоритет ядра | Волна A ограничена контрактом фронта: без WebSocket (фронт опрашивает ленту), без SIP, без бэкапов по расписанию (ручной `backup.run`), без TLS; новое — только волна B, после прохождения `scripts/e2e-*.sh` | PASS |
| V. Единый контракт данных | Контракт = TS-типы фронта (`src/shared/api/types`) ↔ Pydantic-схемы `backend/app/schemas/` 1:1; поле `mode` (`dds` по умолчанию) добавляется как необязательное расширение в `Session`, `CardEvent`, `Evaluation`; карточка из режима A представима как `IncidentCard` (`createdByStudentId`) — тот же тип, что уже есть у фронта | PASS |

Технологические ограничения конституции (PostgreSQL 12+, Python 3.11+, логин/пароль + RBAC, синтетика, открытый код) — соблюдены. Пост-дизайн проверка — в конце файла.

## Project Structure

### Documentation (this feature)

```text
specs/002-two-mode-simulator/
├── plan.md              # этот файл
├── research.md          # Phase 0: решения R1–R22
├── data-model.md        # Phase 1: таблицы, связи, переходы состояний
├── quickstart.md        # Phase 1: как поднять и проверить
├── contracts/
│   ├── compat-endpoints.md   # 60 эндпоинтов волны A → модули бэкенда, семантика, источники данных
│   ├── v1-endpoints.md       # новые эндпоинты волны B
│   └── evaluation.schema.json # форма Evaluation/ошибок (общая для обоих режимов)
├── checklists/requirements.md
└── tasks.md             # Phase 2: /speckit-tasks (не создаётся здесь)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml            # uv; пакеты app, ml; extras: [pg], [tts], [stt], [llm]
├── alembic/                  # миграции (versions/0001_initial …)
├── app/
│   ├── main.py               # FastAPI: роутеры compat под /api/mock и /api/v1, v1-only под /api/v1
│   ├── config.py             # Settings (DATABASE_URL, JWT_SECRET, MODELS_DIR, OLLAMA_URL?, TZ=+03:00)
│   ├── db/                   # engine/session, base, JSON-variant, id-генераторы (u-NNN, s-NNN, …)
│   ├── models/               # SQLAlchemy: user, reference, classifier, incident_card, arm_card, card_runtime,
│   │                         #   scenario, material, profile_mapping, session, card_flow, attempt, phone_call,
│   │                         #   evaluation, override, report, group_report, feedback, audit, system_*,
│   │                         #   (волна B) ticket_audio, assignment, kb_article, recommendation, street
│   ├── schemas/              # Pydantic 1:1 с src/shared/api/types/*.ts (camelCase alias, by_alias=True)
│   ├── api/
│   │   ├── deps.py           # viewer из cookie arm112_session / Bearer; require_role
│   │   ├── errors.py         # ApiError → { error: { code, message } }; маппинг 400/401/403/404/409/422/500
│   │   ├── compat/           # auth, reference, classifier, cards, card_actions, attempts, calls, scenarios,
│   │   │                     #   materials, profile_mapping, grammar, sessions, users, reports, admin_users, admin_system
│   │   └── v1/               # (волна B) tickets, audio, operator112, assignments, lobby, kb, recommendations, validation
│   ├── services/             # доменная логика: dds_status_machine, session_engine (cardFlow/feed/control),
│   │                         #   report_builder, audit, evaluation_service (обёртка над ml), scenario_service
│   ├── seed/                 # загрузка spec/mocks + mocks/local + mocks/admin (идемпотентно), fixture_map
│   └── ai_gateway.py         # интерфейс как у фронта: evaluate_attempt / generate_scenario / check_grammar /
│                             #   group_insights / call_reply → реализации из ml
├── ml/
│   ├── assess/               # engine.py, rules.py, components/ (timing, decision, statuses, comments, fields,
│   │                         #   grammar, address, multitask, report), dds.py, operator112.py
│   ├── nlp/                  # embedder.py (rubert-tiny2), semantic.py, grammar.py (symspell), address.py (rapidfuzz)
│   ├── classify/             # ekp_group_classifier.py (+ train/eval)
│   ├── generate/             # scenario_generator.py (Ollama | template), validator.py (6 критериев)
│   ├── insights/             # group_insights.py, recommender.py, rating.py (Эло)
│   ├── speech/               # tts.py (Silero), stt.py (Vosk) — волна B
│   └── scripts/              # prepare_models.py, eval_assessor.py, eval_classifier.py, eval_validator.py, calibrate.py
├── data/                     # streets/moscow_streets.json, labeled/, kb/ (статьи справочника)
├── tests/
│   ├── contract/             # по таблице docs/mock-api.md: коды и формы каждого эндпоинта
│   ├── integration/          # демо-путь: занятие → попытки → отчёт → правка → обратная связь
│   └── unit/                 # машина статусов, окно ленты, оценщик, адреса, грамматика
├── var/                      # рантайм-файлы (git-ignored)
└── docker-compose.yml        # postgres + backend (+ ollama profile)

next.config.ts                # + rewrites(beforeFiles): /api/mock/:path* → ${BACKEND_URL}/api/mock/:path* (если задан)
```

**Structure Decision**: монорепо; фронт остаётся как есть (`app/`, `src/`), бэкенд и ML — в `backend/` (два python-пакета `app` и `ml` в одном `pyproject`, чтобы оценщик импортировался без сети и без HTTP-прослойки). Один процесс FastAPI обслуживает и совместимый контракт (`/api/mock`, зеркало `/api/v1`), и новые эндпоинты (`/api/v1`). Тяжёлые модели грузятся лениво при первом обращении и кэшируются в процессе.

## Complexity Tracking

> Нарушений Constitution Check нет. Единственное сознательное усложнение — два префикса (`/api/mock` и `/api/v1`) для одного роутера: префикс `mock` сохраняется, потому что он зашит в `NEXT_PUBLIC_MOCK_API_BASE_URL` по умолчанию и в `scripts/e2e-*.sh`; альтернатива (менять фронт) нарушает FR-059.

## Phase 0 — Research

Выход: [research.md](research.md). Решения R1–R14 из фичи 001 переиспользованы с правками (R7 и R14 — WebSocket не нужен в волне A; R11 — Recharts не нужен, графики рисует фронт по `charts`), добавлены R15–R22: совместимость контракта, cookie-сессия и JWT, стратегия сидов и ID, репликация рантайм-семантики мок-слоя (лента, управление занятием, сборка отчёта), фолбэк без Ollama и без PostgreSQL, TTS-запись для режима A, валидатор билетов, рекомендательная система. Открытых `NEEDS CLARIFICATION` нет.

## Phase 1 — Design

Выходы: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

- **Модель данных** — 27 таблиц волны A (строковые PK в форматах сидов, JSON для вложенных структур фронта) + 7 таблиц волны B; машины состояний: статусы ДДС (`reference.ddsStatuses[].next`), занятие (`draft → configured → running → finished → reported`), валидация сценария (`draft → pending → approved | rejected`), попытка/задание/экзамен.
- **Контракты** — `contracts/compat-endpoints.md`: все 60 эндпоинтов с указанием модуля, источника данных, побочных эффектов (аудит, store) и правил изоляции; `contracts/v1-endpoints.md`: новые; `contracts/evaluation.schema.json`: форма оценки. OpenAPI генерируется FastAPI на `/api/docs`.
- **Quickstart** — локальный запуск с SQLite или PostgreSQL, сид, прогон `pytest tests/contract`, запуск фронта с `BACKEND_URL`, прогон `scripts/e2e-student.sh` / `-teacher.sh` / `-admin.sh`, проверка ML-метрик.

### Constitution Check (после дизайна)

| Принцип | Результат |
|---|---|
| I | В `data-model.md` нет сущностей, требующих внешних сервисов; `prepare_models.py` — единственная точка сети; `docker-compose` без внешних образов, кроме `postgres` и `ollama` (профиль `llm`, выключен по умолчанию). PASS |
| II | Таблица `evaluation_rules` не нужна — реестр правил в коде с тестом «у каждого правила непустой source»; `teacher_overrides` + `calibration_samples` в модели. PASS |
| III | `evaluations.components` хранит покомпонентные баллы и веса; `assessor_version` в каждой оценке; скрипты метрик в структуре. PASS |
| IV | Волна A не добавляет таблиц сверх нужных контракту (проверено по `compat-endpoints.md`); волна B — отдельные таблицы, не трогающие волну A. PASS |
| V | Pydantic-схемы генерируют OpenAPI; контрактный тест сверяет обязательные поля ответов с `spec/05-data-models.md`; поле `mode` есть в `sessions`, `attempts`, `evaluations`. PASS |

## Phase 2 — Tasks

Формируется `/speckit-tasks` → `tasks.md`. Порядок фаз: Setup (pyproject, config, db, errors, deps, seed) → Foundational (auth, reference, classifier, users) → US1 (cards + card actions + attempts + sessions + feed/control) → US2 (evaluation: ml.assess + grammar + address + semantic; attempts/evaluation, reports, journal, feedback) → US5/US6 (scenarios, generate, validate, materials, profile-mapping) → US10 (calls/reply) → US11 (admin/*) → контрактные и e2e-проверки волны A → волна B: US3 (tickets audio, operator112 attempts), FR-003 экзамен, US4 лобби, US7 рекомендации, US8 цепочка → Polish (метрики, документация установки, скринкаст).
