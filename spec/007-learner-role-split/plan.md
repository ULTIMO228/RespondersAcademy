# Implementation Plan: Разграничение специализаций обучающихся (112 / ДДС)

**Branch**: `main` (ветка не создавалась) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: `spec/007-learner-role-split/spec.md` (черновик, матрица ответственности ждёт правок владельца)

## Summary

Ввести у обучающегося специализацию «специалист 112» / «оператор ДДС» (одна или обе), закрепить зоны на фронте и бэкенде, сделать карточку ДДС только для чтения в полях 112, достроить недостающее рабочее место 112 (сохранение с оповещением, отработана, закрытие, «Нет контакта/Срыв звонка», перевод, связи), разделить назначение, нормативы и отчёты по специализации. Подход: аддитивное поле `specializations` на пользователе (D1), серверные гварды по сессии (D2–D3), единая проверка `require_specialization` на бэкенде, гранулярный read-only в карточке (D5). Решения и отклонённые альтернативы — [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript strict + Next.js (версию читать в `node_modules/next/package.json`, перед кодом читать `node_modules/next/dist/docs/`); Python 3.11+

**Primary Dependencies**: без новых (FSD-фронт, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2)

**Storage**: SQLite (dev) / PostgreSQL; миграция `0007_user_specializations` (одна колонка); мок-слой — `mocks/users.json` через `spec/000-фронт/mocks/`

**Testing**: Vitest + RTL рядом с кодом; `backend/tests/{unit,contract,integration}`; Playwright (`e2e/two-mode-full-path.spec.ts`, `simulator-visual.spec.ts`); HTTP-скрипты `scripts/e2e-*.sh`

**Target Platform**: локальный изолированный контур, desktop-first 1920px+

**Project Type**: web-приложение (фронт + бэкенд в одном репозитории)

**Performance Goals**: без регрессий; проверка специализации — чтение уже загруженной строки `User`, лишних запросов нет

**Constraints**: аддитивные контракты; внешний вид `/arm/*` не меняется (AGENTS §9); без внешних сервисов; русский язык; TDD, парные 403/200

**Scale/Scope**: 2 специализации, ~24 демо-учётки, ~20 затрагиваемых экранов и ~15 эндпоинтов зон

## Constitution Check

| Принцип | Оценка |
|---|---|
| I. Локальный контур, CPU-only | ✅ внешних сервисов нет |
| II. Методическая достоверность | ✅ правила берутся из памятки/единого документа; расхождения источников зафиксированы в спеке и допущениях 8–9 |
| III. Измеримый ML | ✅ не затрагивается (оценщики не меняются, добавляются только подписи норматива) |
| IV. YAGNI, приоритет ядра | ✅ порядок этапов: сначала доступ (US1), потом достройка 112/ДДС; Карта/Сводка/База знаний вне объёма; пара «112-обучающийся → ДДС-обучающийся» отложена (допущение 3) |
| V. Единый контракт | ✅ словарь `operator112 \| dds` тот же; поле необязательное |
| Технологические ограничения | ✅ три роли и RBAC сохраняются: специализация — атрибут `student`, не новая роль |
| Аудит | ✅ смена специализации и отказы в доступе логируются |

Повторная проверка после дизайна: нарушений нет; Complexity Tracking не требуется. Дополнительные инварианты AGENTS: §2 (обратная совместимость контрактов) — аддитивно; §9 (аутентичность) — через гранулярный read-only и существующую панель «В кабинет».

## Project Structure

### Documentation (this feature)

```text
spec/007-learner-role-split/
├── spec.md
├── plan.md              # этот файл
├── research.md          # решения D1–D10
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # создаёт /speckit-tasks
```

### Source Code (затрагиваемые области; точные файлы уточняются в tasks.md)

```text
backend/
├── alembic/versions/0007_user_specializations.py        # новое
├── app/models/user.py                                   # + specializations, to_public
├── app/schemas/                                         # camelCase 1:1 с TS-типами
├── app/api/deps.py                                      # Viewer.specializations, require_specialization
├── app/api/v1/{operator112,assignments,tickets}.py      # гварды зоны 112 / назначение
├── app/api/compat/{attempts,cards,calls,sessions}.py    # гварды зоны ДДС
├── app/services/{operator112_service,attempts,assignment_service,chain_service,report_builder,performance_service,error_map_service}.py
├── app/seed/{load.py,assignments_seed.py}               # специализации в сидах
└── tests/{contract,integration,unit}/                   # test_specialization_access.py и парные 403/200

src/
├── shared/api/types/user.ts                             # + Specialization, User.specializations (расширение)
├── entities/user/{index.server.ts,config/roleAccess.ts,model/*}   # requireSpecialization, матрица доступа
├── app/layouts/{ArmSectionLayout,ArmJournalLayout,ArmCardLayout}.tsx  # гварды зоны
├── widgets/{app-nav,platform-nav,incident-list}/        # меню и вкладки по специализации, переключатель зон
├── widgets/incident-card/                               # гранулярный read-only для ДДС
├── pages/{operator112,student/*,teacher/*,admin/*}/     # зона 112, задания, результаты, пользователи
├── features/{assignment-create,operator112-*}/          # фильтр обучающихся; сохранение/закрытие 112
└── shared/api/mock/                                     # мок-слой: специализация, проверки зон

spec/000-фронт/mocks/users.json  → npm run mocks:sync   # u-005 обе, u-006/u-007 только 112, прочие ДДС
spec/000-фронт/{02-roles.md,08-qa-decisions.md}          # поправка к Q&A В4 (дополнение, не переписывание)
docs/COMPLIANCE.md, README.md                            # отметка о разграничении
```

**Structure Decision**: изменения распределяются по существующим слоям FSD и бэкенда; новых слоёв, пакетов и зависимостей нет. Единственный новый общий элемент — `require_specialization` / `requireSpecialization`.

## Порядок реализации (этапы под `tasks.md`)

| Этап | Содержание | Истории |
|---|---|---|
| E1. Модель и сессия | колонка + миграция, `Viewer`, `PublicUser`, TS-тип, моки/сиды/валидатор, редактирование админом, аудит | US1 |
| E2. Серверные гварды | `require_specialization` на путях D4; проверка режима при создании задания/попытки; парные 403/200 | US1 |
| E3. Фронт-гварды и навигация | `requireSpecialization`, `roleAccess`, меню/вкладки, переключатель зон, сообщение для несовпавших старых заданий | US1 |
| E4. Карточка ДДС read-only по полям 112 | гранулярная блокировка, тесты, снимки `simulator-visual` | US3 |
| E5. Рабочее место 112 | сохранить+подтверждение, «Отработана», «Закрыть», «Нет контакта/Срыв звонка» → затем перевод и связи | US2 |
| E6. Назначение, отчёты, нормативы | фильтр студентов и валидация режима, подписи нормативов, попытки 112 в отчётах, мониторинг 112 у преподавателя | US4 |
| E7. Передача и цепочка | выдача карточки только ДДС-обучающимся, явная смена зоны в цепочке, e2e | US5 |
| E8. Документация и закрытие | поправки спек 000, COMPLIANCE, `.ai/`, итог проверок | — |

Зависимости: E1 → E2/E3 (параллельно) → E4–E7 (E5 и E6 независимы) → E8.

## Исполнители (предложение по делегированию)

| Работа | Исполнитель |
|---|---|
| Миграция, модель, гварды, сиды, контрактные тесты (E1–E2, E6 бэкенд, E7) | Haiku 5.5 xhigh (основной объём ≈85%; ревью безопасности гвардов делает основная сессия, Opus — только для очень сложных задач) |
| Фронт-гварды, типы, мастер назначений, моки (E3, E6 фронт) | Haiku 5.5 xhigh |
| Карточка ДДС read-only и зона 112 в UI (E4, E5), снимки аутентичности | Sonnet 5.5 medium |
| Документация (E8) | Haiku 5.5 xhigh |

## Риски

- Анонимные записывающие эндпоинты (D4) оставляют обход специализации; закрывает отдельная фича 008. До неё гварды защищают честного пользователя, не злоумышленника.
- Снимки `simulator-visual` не прогонялись с фичи 002 (SESSION_STATE): E4 обязан их запустить, иначе аутентичность не доказана.
- `mocks/` — закоммиченная копия: после правки `users.json` обязателен `mocks:sync`; `--reset` БД — только по просьбе владельца.
- Допущения 2, 3, 7, 8 спеки ждут подтверждения; план от них зависит только в E5 (кто «Отработана»), E6 (кто назначает), E7 (правило выдачи).
- Расхождение с Q&A заказчика В4 (обучаемый — только ДДС): фиксируется поправкой в спеке 000 при приёмке.
