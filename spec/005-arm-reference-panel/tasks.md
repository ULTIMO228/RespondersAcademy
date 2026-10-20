# Tasks: Справочник в АРМ (005)

**Input**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/reference-access.md)
Формат: `[ID] [P?] [Story] Описание`.

## Phase 1: Основание (бэкенд)
- [X] T001 `referenceAllowed` в `AssignmentCreateRequest`: проверка типа, значение по умолчанию по формату, явная запись в `params` — `backend/app/schemas/v1/assignments.py`
- [X] T002 Аудит создания задания с «справочник: доступен|недоступен» — `backend/app/services/assignment_service.py`
- [X] T003 Сервис `backend/app/services/reference_access.py`: `effective_reference_allowed(row)`, `lock_for(db, viewer)` (учёт `_expire`)
- [X] T004 `GET /me/reference-access` и замок 403 `forbidden` в `GET /kb/articles[/{id}]` — `backend/app/api/v1/lobby.py`, схема `ReferenceAccess`
- [X] T005 [P] Тесты: по умолчанию тренировка/экзамен, явное значение, 400; замок при открытой попытке, снятие после отправки и по лимиту времени, преподаватель не блокируется — `backend/tests/integration/test_reference_access.py`

## Phase 2: US1 — панель (P1) 🎯
- [X] T006 [P] [US1] `src/shared/lib/kb-search`: нормализация, основы, ранжирование, подсветка + тесты (≥ 3 буквы, «пожаре», «ё»)
- [X] T007 [P] [US1] Типы `ReferenceAccess`, `AssignmentParams.referenceAllowed`; клиент `getReferenceAccess()`; `expected_fields.json`
- [X] T008 [US1] Виджет `src/features/arm-reference`: поиск, результаты с `<mark>`, статья тезисами в порядке разделов, Esc/возврат фокуса, «Ничего не найдено», «временно недоступен» + тесты
- [X] T009 [US1] Кнопка «Справочник» в `src/widgets/simulator-bar` (видна при `allowed`), панель поверх АРМ

## Phase 3: US2 — доступ по заданию (P1)
- [X] T010 [US2] Мастер: `referenceAllowed` в черновике, галочка на шаге «Параметры» с умолчанием по формату до ручной правки, строка на шаге проверки, `buildParams` + тесты
- [X] T011 [US2] Карточка задания у преподавателя показывает «Справочник: доступен/недоступен»
- [X] T012 [US2] Панель и `/reference`: при 403 `forbidden` — «Справочник недоступен в этом задании»

## Phase 4: US3 — новое окно (P2)
- [X] T013 [US3] Роут `/arm/reference-window?q=&article=` без меню кабинета (`app/arm/reference-window/page.tsx`, `ROUTES.referenceWindow`), «Открыть в новом окне» в панели, проверка доступа при фокусе и раз в 15 с

## Phase 5: Проверка
- [X] T014 pytest + ruff, vitest, tsc, eslint; браузер по [quickstart.md](quickstart.md); реестр `spec/README.md`
