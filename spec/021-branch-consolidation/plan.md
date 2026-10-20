# Implementation Plan: Поэтапное сведение всех веток в main

**Branch**: `merge/021-branch-consolidation` (создаётся от `origin/main` `ba1f7d8`) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `spec/021-branch-consolidation/spec.md`

## Summary

Влить в интеграционную ветку от `origin/main` 11 из 13 кусков (K1–K11) из 12 веток origin, по одному
куску за шаг. Каждый кусок вливается `merge --no-ff`. Конфликты разрешаются по содержимому с записью
решения, после каждого куска идёт быстрый гейт проверок. Три цепочки миграций сводятся
merge-ревизиями без перешивки (R3). Номера 8 фич меняются одним отдельным коммитом в конце (R2).
Смысловые дубли данных решаются до своего куска, интерфейсные вливаются обе стороны (Q2). В main —
только по прямой просьбе владельца.

## Technical Context

**Language/Version**: TypeScript strict + Next.js 16.3.5 (из `node_modules/next/package.json`),
Node 24.15.0; Python 3.11+ (бэкенд, `uv`)

**Primary Dependencies**: git ≥ 2.38 (`merge-tree --write-tree` уже работает в этом окружении), npm,
uv, alembic. Новые зависимости из веток: `websockets`, extras `stt-local` и `speechkit` (K1/K3),
`openpyxl` (K7); `package.json` ни одна ветка не меняет

**Storage**: SQLite для проверок (`backend/var/*.db`, вне git), три цепочки alembic от `0005_error_map_verdicts`

**Testing**: Vitest + RTL (`npm run test`), ESLint, Steiger, tsc, `next build`; pytest + ruff; контрактные
тесты по `expected_fields.json`; Playwright и HTTP-скрипты — только в финальном гейте

**Target Platform**: локальная машина владельца (macOS, zsh), без доступа к боевым системам

**Project Type**: веб-приложение (Next.js фронт + FastAPI бэкенд), процесс интеграции веток

**Performance Goals**: быстрый гейт на один кусок — порядка минут, без e2e. Полный гейт — один раз, в F8

**Constraints**: не переписывать и не удалять ветки origin; без `git add .`, `reset --hard`, force-push;
без `Co-Authored-By` и подписи агента в коммитах (CLAUDE.md, L001); не читать `backend/.env`;
коммиты и push — по просьбе владельца

**Scale/Scope**: 127 уникальных не-merge коммитов, около 1000 изменённых файлов суммарно,
16 фич из веток, 3 цепочки миграций, ожидаемо около 85 конфликтных файлов в сумме по шагам

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Как план его соблюдает | Статус |
|---|---|---|
| I. Локальный контур, CPU-only | Слияние ничего не включает. Облачные extras из веток (SpeechKit, GigaAM-CDN, Polza с ключом в БД, отправка отчётов и чата) предъявляются владельцу (R10, В2). После F8 проверяется, что по умолчанию сеть не используется | ✅ при условии T006: всё внешнее выключено по умолчанию, иначе выключается в слиянии; расхождение с текстом принципа фиксируется в `AGENTS.md` §2 |
| II. Методическая достоверность | Правила оценки из веток не меняются, конфликты в `ml/assess` разрешаются с сохранением ссылок на источники правил | ✅ |
| III. Измеримый ML | Метрики и скрипты не трогаются. Тесты оценщиков входят в быстрый гейт | ✅ |
| IV. Простота (YAGNI) | Новой функциональности нет. Перенумерация минимальная, merge-ревизии вместо перешивки, e2e только в финале | ✅ |
| V. Единый контракт данных | `expected_fields.json` перегенерируется из TS-типов после каждого куска, который меняет типы. Модель специализации — одна (R5, В1) | ✅ после ответа на В1 |

Gate пройден: нарушений, которые план вносит сам, нет. Пункт I — внешний риск из содержимого веток,
вынесен в вопрос В2.

**Re-check после Phase 1**: data-model и контракт журнала не добавляют сущностей в продукт. Гейт
остаётся пройденным.

## Project Structure

### Documentation (this feature)

```text
spec/021-branch-consolidation/
├── spec.md               # спецификация (/speckit-specify)
├── plan.md               # этот файл
├── research.md           # R1–R11: решения и факты
├── data-model.md         # реестр кусков, пересечений, фич, журнал
├── contracts/
│   └── merge-journal.md  # формат записи журнала по куску и по конфликту
├── quickstart.md         # команды проверки по шагам
├── merge-journal.md      # журнал слияния (заполняется на реализации)
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

Код фичи не пишется. Затрагиваются точки слияния:

```text
backend/alembic/versions/        # + merge-ревизии (R3)
backend/app/api/v1/__init__.py   # регистрация роутеров всех кусков
backend/app/models/user.py       # training_profile / specializations / permissions (R5)
backend/tests/contract/expected_fields.json  # перегенерация
backend/uv.lock                  # uv lock, не ручное слияние
src/shared/api/{index,endpoints/index,types/index}.ts
src/widgets/simulator-bar/       # один механизм слота (R7)
src/widgets/platform-nav/        # пункты меню всех кусков
app/arm/(operator112)/           # бывшая (section) (R6)
spec/README.md, spec/NNN-*       # реестр и перенумерация (R2)
AGENTS.md, .ai/*                 # слитое состояние (FR-014)
```

**Structure Decision**: работа в отдельном git worktree интеграционной ветки. Текущее дерево
`claude/gracious-darwin-x0znyd` остаётся нетронутым, параллельные сессии ему не мешают (L003).

## Фазы реализации (детали — tasks.md)

- **F0 Подготовка**: worktree от `origin/main`, фиксация вершин веток, эталонный быстрый гейт на main
  и на вершине каждой вливаемой ветки (L005).
- **F1–F3 Кластер ДДС**: develop → dds-sasha → SASHA (+ R7).
- **F4 Сверка K5/K6** без слияния.
- **F5 Кластер seva**: fix → codex (+ R5, R6, merge-ревизия alembic).
- **F6–F7 Конструкторы**: gracious-darwin → scenario-graph-builder (+ merge-ревизия).
- **F8 Финал**: перенумерация, `spec/README.md`, `AGENTS.md`, `.ai/*`, полный гейт, итоговый отчёт.

## Вопросы владельцу (не блокируют F0–F4)

- **В1** → `specializations` (решено 2026-10-20, spec Clarifications).
- **В2** → опции, выключенные по умолчанию, проверка до F1 (T006) (решено 2026-10-20).
- **В3** (после F8): объединять ли два конструктора и рейтинг со сводной успеваемостью отдельной фичей?
- **В4** (после F8): питч с фото команды (K12) — вливать или хранить вне репозитория?
- **В5** (после F8): удалять ли исходные ветки и `claude/*`-дубли после слияния в main?

## Complexity Tracking

| Отклонение | Зачем | Почему проще не подходит |
|---|---|---|
| Merge-ревизии alembic (3 головы → 1) | БД с любой исходной ветки обновляются без пересоздания | Перешивка в линию ломает созданные БД (R3) |
| Отдельный worktree | Не мешать текущей ветке и параллельным сессиям | Переключение ветки в общем дереве рискует чужой незакоммиченной работой |
