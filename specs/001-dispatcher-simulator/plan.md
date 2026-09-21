# Implementation Plan: Учебный симулятор диспетчера ДДС (система-112)

**Branch**: `001-dispatcher-simulator` | **Date**: 2026-09-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-dispatcher-simulator/spec.md`

## Summary

Веб-тренажёр, имитирующий АРМ-112 для диспетчера ДДС: поток карточек происшествий, жизненный цикл статусов реагирования, браузерный софтфон с ИИ-ответчиком, рабочее место преподавателя (банк сценариев с генерацией и утверждением, занятие, мониторинг, отчёт, аналитика) и движок авто-оценки с объяснимыми ошибками, калибруемый по правкам преподавателя. Всё работает офлайн на CPU. Технический подход: монорепозиторий из четырёх частей — `backend` (FastAPI + PostgreSQL, REST + WebSocket), `ml` (Python-пакет `dds_ml`: детерминированные правила + малые эмбеддинг-модели + калибровка), `ai` (Python-пакет `dds_ai`: генерация сценариев через локальную LLM, STT/TTS-ответчик), `frontend` (React SPA). Точка стыка — JSON-схемы в `contracts/`.

## Technical Context

**Language/Version**: Python 3.11 (backend, ml, ai); TypeScript 5 / Node 20 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy 2 + Alembic, Pydantic v2, `websockets`; sentence-transformers (`cointegrated/rubert-tiny2`, `intfloat/multilingual-e5-small`), scikit-learn, rapidfuzz, symspellpy (+ LanguageTool как опциональный плагин), pandas; Vosk (`vosk-model-small-ru`), Silero TTS (torch CPU); Ollama с квантованной моделью ≤ 7B (генерация сценариев, LLM-as-judge второго эшелона); React 18 + Vite + TypeScript, React Router, TanStack Query, Recharts

**Storage**: PostgreSQL 14 (совместимо с 12+); файлы записей докладов (WAV) и резервных копий — локальная ФС в `var/`; модели — `models/` в дистрибутиве

**Testing**: pytest (backend, ml, ai) + `httpx` для API; Vitest для фронтенда; ручной чек-лист демо-пути (`quickstart.md`)

**Target Platform**: Windows 10/11 и Ubuntu 20.04+, браузеры Chrome / Firefox / Яндекс.Браузер; запуск через Docker Compose (Linux) или локально через `uv` + Node (Windows без Docker)

**Project Type**: web application (backend + frontend + два Python-пакета ML/AI)

**Performance Goals**: оценка попытки ≤ 5 с на CPU (4 ядра, 8 ГБ); отчёт по занятию 20 × 5 попыток ≤ 30 с; мониторинг преподавателя обновляется ≤ 2 с; ответ ИИ-ответчика «Слушаю» ≤ 2 с; генерация 5 сценариев ≤ 3 мин (не в реальном времени, преподаватель ждёт с индикатором прогресса)

**Constraints**: полностью офлайн в рантайме (SC-008); без GPU; суммарный размер моделей ≤ 3 ГБ (без LLM) + LLM ≤ 5 ГБ; ≤ 20 обучаемых в одном занятии; серверное время — единственный источник таймстампов

**Scale/Scope**: 3 роли, ~12 экранов, 96 базовых + генерируемые сценарии, справочник ЕКП 1283 типа × 85 служб, справочник улиц Москвы ~4 000 записей

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Проверка | Статус |
|---|---|---|
| I. Локальный контур и CPU-only | Все модели в `models/`, загружаются скриптом `deploy/prepare-models.*` на этапе установки; Ollama локальный; геокодер — офлайн-справочник; проверка орфографии — symspellpy офлайн. В `research.md` для каждой модели зафиксирован размер и время отклика на CPU. Тест SC-008 (захват трафика) — в Polish-фазе. | PASS |
| II. Методическая достоверность | Реестр правил оценки `ml/dds_ml/assess/rules.py` — каждое правило с полем `source` (памятка/классификатор/Q&A/решение команды). Схема `assessment.schema.json` требует `rule` у каждой ошибки. Правка преподавателя — `AssessmentOverride` + запись аудита + попадание в калибровочную выборку. | PASS |
| III. Измеримый ML | `ml/scripts/eval_*.py` считают accuracy/F1/каппу/корреляцию на `data/labeled/`; калибровочная регрессия итогового балла; LLM-as-judge — отдельный отключаемый компонент `ai/dds_ai/judge.py` с флагом конфигурации. Итоговый балл = взвешенная сумма компонент (детерминированных + семантических). | PASS |
| IV. Простота / YAGNI | Порядок фаз в `tasks.md` = приоритеты историй (US1, US2 → US3, US4 → US5, US6 → US7). TLS, бэкапы по расписанию, масштабирование — только в `docs/architecture.md`; резервная копия — ручной `pg_dump`. Демо на синтетике: `deploy/seed-demo.*`. | PASS |
| V. Единый контракт данных | `contracts/*.schema.json` (scenario, event, assessment, session-report) — единственный источник; Pydantic-модели бэкенда и TS-типы фронтенда генерируются/валидируются против схем в CI-скрипте `scripts/check-contracts.*`. Эталоны выводятся парсерами `ml/dds_ml/data/` из классификатора и билетов. | PASS |

**Post-design re-check (после Phase 1)**: структура данных и контракты не вводят внешних сервисов; единственный «тяжёлый» компонент — Ollama — локален и используется только преподавателем вне реального времени. Нарушений нет, таблица Complexity Tracking пуста.

## Project Structure

### Documentation (this feature)

```text
specs/001-dispatcher-simulator/
├── plan.md              # Этот файл
├── research.md          # Phase 0: решения по стеку, моделям, телефонии, оценке
├── data-model.md        # Phase 1: сущности, таблицы, связи, переходы состояний
├── quickstart.md        # Phase 1: офлайн-установка, подготовка данных, демо-путь
├── contracts/           # Phase 1: JSON-схемы и обзор API
│   ├── scenario.schema.json
│   ├── event.schema.json
│   ├── assessment.schema.json
│   ├── session-report.schema.json
│   └── api.md
└── tasks.md             # Phase 2: /speckit-tasks
```

### Source Code (repository root)

Код живёт в git-репозитории команды `case-09-112-dispatcher-simulator-team-82/` (корень хакатонного репо). Пути ниже — относительно него.

```text
case-09-112-dispatcher-simulator-team-82/
├── contracts/                      # JSON-схемы (копия-источник для specs/…/contracts)
│   ├── scenario.schema.json
│   ├── event.schema.json
│   ├── assessment.schema.json
│   └── session-report.schema.json
├── backend/
│   ├── pyproject.toml
│   ├── alembic/                    # миграции
│   └── src/app/
│       ├── main.py                 # FastAPI app, роутеры, WS
│       ├── config.py               # настройки (пути моделей, нормативы по умолчанию)
│       ├── db.py
│       ├── models/                 # SQLAlchemy: user, group, scenario, session, attempt, event, assessment, audit, rating
│       ├── schemas/                # Pydantic (валидируются против contracts/)
│       ├── api/                    # роутеры: auth, users, groups, scenarios, sessions, attempts, assessments, reports, analytics, admin, softphone
│       ├── services/
│       │   ├── auth.py             # логин/пароль, JWT-cookie, RBAC
│       │   ├── scenario_bank.py    # импорт билетов, генерация (вызывает dds_ai), фильтр (dds_ml), утверждение, версии
│       │   ├── session_engine.py   # очередь карточек, темп, подкидывание событий, таймеры (серверное время)
│       │   ├── attempt_recorder.py # события, переходы статусов (FR-003/004/005)
│       │   ├── assessment.py       # вызов dds_ml.assess, сохранение, правки преподавателя
│       │   ├── reports.py          # отчёт по занятию, CSV/PDF
│       │   ├── analytics.py        # радар, тепловая карта, топ ошибок, инсайты
│       │   ├── adaptive.py         # обёртка над dds_ml.adaptive
│       │   ├── softphone.py        # WS-аудио ↔ dds_ai.voice
│       │   └── audit.py
│       └── ws/                     # WebSocket: student queue, teacher monitor, class board, softphone audio
│   └── tests/
│       ├── unit/
│       ├── integration/            # API + БД (testcontainers/postgres или sqlite для быстрых)
│       └── contract/               # ответы API валидны по contracts/
├── ml/                             # пакет dds_ml (зона ML-специалиста)
│   ├── pyproject.toml
│   ├── dds_ml/
│   │   ├── data/                   # parse_classifier.py, parse_tickets.py, streets.py, build_reference.py
│   │   ├── assess/
│   │   │   ├── rules.py            # реестр правил с source
│   │   │   ├── timing.py           # 30 с / 3 мин, этапы
│   │   │   ├── statuses.py         # первичное решение, последовательность, полнота
│   │   │   ├── comments.py         # обязательные элементы (семантика + извлечение)
│   │   │   ├── fields.py           # адрес/тип/признаки
│   │   │   ├── grammar.py          # symspellpy (+ LanguageTool опц.)
│   │   │   ├── address.py          # нормализация, rapidfuzz, похожие улицы
│   │   │   ├── multitask.py        # реакция на параллельные карточки
│   │   │   ├── report_checklist.py # чек-лист доклада
│   │   │   ├── semantic.py         # эмбеддинги, косинус, пороги
│   │   │   └── engine.py           # сборка компонент → assessment.schema.json
│   │   ├── classify/               # классификатор группы ЕКП (эмбеддинги + логрег)
│   │   ├── quality/                # фильтр генерации: категория + дедуп
│   │   ├── adaptive/               # рейтинг, сложность сценария, подбор
│   │   ├── calibration/            # регрессия итогового балла, учёт правок
│   │   └── analytics/              # агрегаты для радара/тепловой карты/инсайтов
│   ├── scripts/                    # eval_assessor.py, eval_classifier.py, calibrate.py, eval_report_checklist.py
│   └── tests/
├── ai/                             # пакет dds_ai (зона ИИ-инженера)
│   ├── pyproject.toml
│   ├── dds_ai/
│   │   ├── llm.py                  # клиент Ollama
│   │   ├── generate.py             # промпты: вариации из билетов, эталон, перегенерация по комментарию
│   │   ├── judge.py                # LLM-as-judge (отключаемый)
│   │   └── voice/                  # stt.py (Vosk), tts.py (Silero), responder.py (диалог «Слушаю/Принято»)
│   └── tests/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api/                    # клиент REST/WS, типы из contracts/
│       ├── components/             # IncidentCard, StatusPicker, Queue, Timer, Timeline, Softphone, Charts
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── student/            # Queue.tsx, Card.tsx, Attempt.tsx (разбор), Profile.tsx
│       │   ├── teacher/            # ScenarioBank.tsx, ScenarioPreview.tsx, SessionSetup.tsx, Monitor.tsx, Report.tsx, Analytics.tsx
│       │   ├── board/ClassBoard.tsx
│       │   └── admin/              # Users.tsx, Groups.tsx, Audit.tsx, System.tsx
│       └── lib/
│   └── tests/
├── data/
│   ├── classifier/                 # klassifikator_v046_24.tsv (есть), ekp.json (генерируется)
│   ├── tickets/                    # tickets.json (перепечатка + эталоны)
│   ├── streets/                    # moscow_streets.json (офлайн-выгрузка)
│   ├── labeled/                    # размеченные попытки для калибровки/валидации
│   └── synthetic/                  # сгенерированные сценарии, демо-набор
├── models/                         # скачиваются prepare-models, в git не хранятся
├── deploy/
│   ├── docker-compose.yml          # postgres, backend, frontend (nginx), ollama
│   ├── prepare-models.sh / .ps1    # однократная загрузка моделей
│   ├── seed-demo.sh / .ps1         # импорт ЕКП, билетов, улиц; демо-пользователи; синтетика
│   └── backup.sh / .ps1            # pg_dump
├── scripts/check-contracts.py      # Pydantic ⇄ JSON Schema ⇄ TS-типы
└── docs/                           # база знаний (есть) + architecture.md, install.md, methods.md
```

**Structure Decision**: web application с двумя выделенными Python-пакетами (`ml`, `ai`), потому что у них разные владельцы (ML-специалист и ИИ-инженер), разные тяжёлые зависимости (torch/Vosk vs sentence-transformers) и разный ритм тестирования; бэкенд импортирует их как обычные пакеты (в одном процессе, без отдельного сервиса — YAGNI). `contracts/` в корне репо — единственный источник схем, `specs/…/contracts/` — их проектная копия.

## Ключевые решения (кратко; подробно в research.md)

1. **Телефония без SIP**: софтфон = `getUserMedia` в браузере → WebSocket с PCM-чанками → Vosk STT → `responder` → Silero TTS → аудио обратно. Никакого SIP/WebRTC-сервера; в `docs/architecture.md` описано, как подключить SIP при внедрении.
2. **Оценка = детерминированное ядро + семантические компоненты**: тайминги/статусы/обязательность комментария считаются правилами; смысловая полнота, сравнение действий, чек-лист доклада — эмбеддинги с порогами; LLM-судья — только для спорных, отключаем.
3. **Генерация — не в реальном времени**: преподаватель запускает задачу, видит прогресс; результат проходит `dds_ml.quality` до показа.
4. **Один процесс бэкенда** с ленивой загрузкой моделей при старте (прогрев) и фолбэком «компонент недоступен» (FR-030).
5. **Серверные таймстампы** для всех событий; фронт показывает таймеры, но не является источником истины.

## Phase 0 — Research

Выход: [research.md](research.md). Открытых технических вопросов в Technical Context не осталось; в research.md зафиксированы решения R1–R14: выбор эмбеддера, проверка орфографии без Java, схема аудио для софтфона, модель LLM для CPU, источник справочника улиц, формат PDF-экспорта.

## Phase 1 — Design

Выходы: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md). Constitution Check повторно пройден (см. выше).

## Phase 2 — Tasks

Формируется `/speckit-tasks` → [tasks.md](tasks.md). Порядок фаз: Setup → Foundational (auth, БД, контракты, справочники) → US1 → US2 → US3 → US4 → US5 → US6 → US7 → Polish (валидация метрик, SC-008, документация, скринкаст).

## Complexity Tracking

> Заполняется только при нарушениях Constitution Check — нарушений нет.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
