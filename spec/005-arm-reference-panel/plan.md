# План реализации: Справочник в АРМ — панель поверх АРМ с поиском и доступом по заданию

**Ветка**: `fix/tz-audit` (отдельная не создавалась; коммиты — по просьбе владельца) | **Дата**: 2026-10-19 | **Спека**: [spec.md](spec.md)

**Вход**: `spec/005-arm-reference-panel/spec.md`. Каталог — `spec/` (реестр `spec/README.md`, AGENTS §8).

## Краткое описание

Обучающийся открывает существующий справочник (105 статей ЕКП) выдвижной панелью поверх АРМ в обоих режимах и в отдельном окне; поиск по основам слов с подсветкой, статья — тезисами. Преподаватель в мастере назначения задаёт «Справочник доступен» (тренировка — да, экзамен — нет); во время открытой попытки задания с запретом сервер отказывает в статьях. Обоснование решений — [research.md](research.md).

## Технический контекст

**Язык/версии**: фронт — TypeScript strict, Next.js App Router + React (версия — `node_modules/next/package.json`, гайды — `node_modules/next/dist/docs/`); бэкенд — Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2.
**Зависимости**: новых нет.
**Хранилище**: SQLite/PostgreSQL; новых таблиц и миграций нет — ключ `referenceAllowed` в JSON `Assignment.params`.
**Тестирование**: `uv run python -m pytest -q`, `ruff`; Vitest + RTL; контракт — `scripts/extract_ts_fields.py` → `tests/contract/expected_fields.json`.
**Платформа**: десктоп 1920 px+, Chrome/Firefox/Яндекс.Браузер.
**Тип проекта**: веб-приложение (фронт + бэкенд).
**Производительность**: поиск по 105 статьям на клиенте < 50 мс; открытие панели — без перезагрузки страницы АРМ.
**Ограничения**: локальный контур, без внешних вызовов; аутентичность АРМ — добавление только в `simulator-bar`; русский язык.
**Масштаб**: 105 статей, до 100 обучающихся.

## Проверка конституции

| Принцип | Оценка | Основание |
|---|---|---|
| I. Локальный контур | ✅ | Поиск — локальная функция, без ИИ и сети |
| II. Методическая достоверность | ✅ | Содержание — существующие статьи; на оценку не влияет (FR-011) |
| III. Измеримый ML | ✅ | ML не затрагивается |
| IV. Простота | ✅ | Без пакетов и миграций; один новый эндпоинт, один виджет, один роут |
| V. Единый контракт | ✅ | `AssignmentParams` и `ReferenceAccess` — добавлением, сверка TS ↔ Pydantic |
| Аудит | ✅ | Значение настройки — в записи создания задания (FR-010) |

Повторная проверка после Phase 1: нарушений нет.

## Структура проекта

```text
spec/005-arm-reference-panel/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/reference-access.md
└── tasks.md                       # /speckit-tasks

backend/app/
├── services/reference_access.py   # lock_for(db, student_id), effective_reference_allowed(row)
├── api/v1/lobby.py                # GET /me/reference-access; замок в GET /kb/articles[/{id}]
├── schemas/v1/assignments.py      # referenceAllowed: проверка типа и значение по умолчанию
├── schemas/v1/lobby.py            # ReferenceAccess
└── services/assignment_service.py # текст аудита
backend/tests/{unit,integration}/test_reference_access*.py

src/
├── shared/api/types/{kb,assignments}.ts   # ReferenceAccess, AssignmentParams.referenceAllowed
├── shared/api/…                           # getReferenceAccess()
├── shared/lib/kb-search/                  # нормализация, основы, ранжирование, подсветка (+ тесты)
├── features/arm-reference/               # ReferencePanel, ArticleTheses, Highlight (+ тесты)
├── widgets/simulator-bar/                 # кнопка «Справочник» + панель
├── features/assignment-create/            # referenceAllowed в черновике, StepParams, StepReview, buildParams
├── pages/reference/                       # сообщение сервера при 403 (запрет в задании)
└── shared/config/routes.ts                # ROUTES.referenceWindow(q, article)
app/arm/reference-window/page.tsx              # тонкая обёртка
```

## Фазы

1. **Бэкенд**: параметр задания, сервис замка, эндпоинт, замок `/kb/*`, аудит, тесты.
2. **Фронт, ядро (US1)**: `kb-search`, `reference-panel`, кнопка в `simulator-bar`.
3. **Доступ (US2)**: мастер назначения, обработка замка в панели и на `/reference`.
4. **Новое окно (US3)**: роут и периодическая проверка доступа.
5. **Проверка**: тесты, контракт, браузер по `quickstart.md`, реестр и отчёт.
