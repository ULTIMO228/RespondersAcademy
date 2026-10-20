# Implementation Plan: Учётка ivanov — чистый специалист системы-112

**Branch**: `007-arm-one-to-one` (отдельная ветка не создавалась) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `spec/018-operator112-student/spec.md`

## Summary

У обучающегося появляется необязательный «профиль режима» (`trainingProfile: operator112 | dds`, нет = оба режима). ivanov получает профиль `operator112` и службу «ЦОВ системы-112». Одно серверное правило `allows(user, mode)` применяется при создании заданий и занятий (400), в выдаче заданий, занятий, рекомендаций и истории курсанту (скрытие / 403). Мастер назначения помечает курсантов с профилем и на шаге режима показывает, кто пропущен. Админ видит и меняет профиль с записью в аудит. Учётка диспетчера ДДС — отдельная будущая фича.

## Technical Context

**Language/Version**: Python 3.11 (FastAPI, SQLAlchemy async, Alembic); TypeScript / Next.js (FSD: `src/features`, `src/pages`, `src/shared`)
**Primary Dependencies**: существующие; новых нет
**Storage**: SQLite (демо/dev), PostgreSQL 12+ (целевая); миграция Alembic `0006`
**Testing**: pytest (unit / integration / contract `expected_fields.json`), vitest; ручной чек-лист `quickstart.md`
**Target Platform**: локальный контур, офисный ПК без GPU
**Project Type**: web application (backend + frontend в одном репозитории)
**Performance Goals**: без изменений — правило O(число курсантов) на запрос
**Constraints**: экраны АРМ не меняются (spec/007 FR-001); не сбрасывать существующие базы
**Scale/Scope**: 1 поле, 1 миграция, 1 сервисный модуль, ~6 точек вызова на бэкенде, 4 экрана фронта (мастер, админка, кабинет, тип User)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Проверка | Итог |
|---|---|---|
| I. Локальный контур, CPU-only | Нет моделей и внешних вызовов | ✅ |
| II. Методическая достоверность | Оценка не меняется; разделение ролей 112/ДДС соответствует памятке и решению владельца (spec/007 Clarifications) | ✅ |
| III. Измеримый ML | ML не затрагивается; SC-004 — оценки 112 до/после совпадают | ✅ |
| IV. Простота (YAGNI) | Одно nullable-поле со значениями существующего `TrainingMode`; без новой роли и таблиц; учётка ДДС не делается заранее | ✅ |
| V. Единый контракт данных | Поле добавляется в тип `User` (TS) и модель (Python), сверка `expected_fields.json`; схемы сценария/события/оценки не меняются. Связка «карточка A → сценарий B» уже выведена в spec/007 — фича её не трогает | ✅ |
| Аудит | Смена профиля админом пишется в журнал | ✅ |
| Персональные данные | ФИО вымышленные (мок) | ✅ |

**Повторная проверка после Phase 1**: дизайн (research R1–R8, data-model, contracts) нарушений не добавил. ✅

## Project Structure

### Documentation (this feature)

```text
spec/018-operator112-student/
├── spec.md
├── plan.md              # этот файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/api.md     # Phase 1
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (ещё нет)
```

### Source Code (repository root)

```text
backend/
├── alembic/versions/0006_user_training_profile.py        # новое: колонка + data-шаг для ivanov
├── app/models/user.py                                     # training_profile, to_public
├── app/services/training_profile.py                       # новое: allows / blocked_message / split_by_profile
├── app/services/assignment_service.py                     # create (400), list_rows / detail / start (скрытие, 403)
├── app/services/session_engine.py                         # create_session (400), список/вход курсанта; профиль службы не считать для operator112
├── app/services/recommendation_service.py                 # только разрешённый режим, без R10 к запрещённому
├── app/api/v1/lobby.py (+ analytics)                      # история/аналитика курсанта по разрешённому режиму
├── app/api/compat/admin_users.py, app/schemas/admin.py   # trainingProfile в create/patch, _changes
├── app/seed/load.py                                       # перенос trainingProfile
├── scripts/demo_up.sh                                     # подсказка «ivanov — специалист-112»
└── tests/
    ├── unit/test_training_profile.py                      # новое
    ├── integration/test_operator112_profile.py            # новое: назначения, занятия, рекомендации, история
    └── contract/expected_fields.json                      # перегенерировать

spec/000-фронт/mocks/users.json, mocks/users.json          # u-005: trainingProfile, service
src/
├── shared/api/types/user.ts                               # TrainingProfile, User.trainingProfile
├── shared/config/ (или entities/user)                     # подписи профиля
├── features/assignment-create/model/students.ts           # split по профилю и режиму
├── features/assignment-create/ui/StepStudents.tsx         # метка 112/ДДС
├── features/assignment-create/ui/StepMode.tsx, StepReview.tsx, AssignmentWizard.tsx  # Alert «пропущены», состав без них
├── pages/admin-users/ui/UserFormFields.tsx (+ модалки)    # select «Профиль режима»
├── pages/student/home/ui/StudentHomeScreen.tsx            # не показывать byMode запрещённого режима
└── app/api/mock/admin/users*                              # мок-слой: поле профиля
README.md                                                  # список демо-учёток
```

**Structure Decision**: web application, существующая раскладка; новые файлы — только `training_profile.py`, миграция и два файла тестов.

## Порядок работ

1. Модель + миграция + сиды + `to_public` + тип TS + `expected_fields.json` (основа, блокирует всё).
2. `training_profile.py` + юнит-тесты.
3. Бэкенд-применение: задания → занятия → рекомендации → кабинет; интеграционные тесты (US1, US2-3).
4. Фронт: мастер назначения (US2-1/2/4).
5. Админка бэкенд + фронт + мок-слой (US3).
6. Демо-подсказки (`demo_up.sh`, README), прогон `quickstart.md`, полный pytest/vitest.

Шаги 4 и 5 независимы после шага 1 (разные файлы).

## Риски

- Тесты/фикстуры, где ivanov получает задание ДДС (`tests/conftest.py` student = ivanov): после фичи они упадут — перевести такие фикстуры на другого курсанта (petrova `u-006`), не ослабляя правило. Предварительно найти через `grep -rn "u-005\|ivanov" backend/tests e2e src`. Оценка на 20.10.2026: ~9 файлов pytest и ~35 файлов фронта/e2e упоминают ivanov вместе с ДДС (часть — только мок-данные, не назначения); сначала разобрать, какие из них реально упадут.
- E2E-скрипты (`run_frontend_e2e.sh`, `e2e/*.spec.ts`) с ivanov в режиме ДДС — то же.
- Рабочее дерево общее с незакоммиченными 005/006/007 — коммитить выборочно, без `git add .`.

## Complexity Tracking

Нарушений конституции нет — раздел не заполняется.
