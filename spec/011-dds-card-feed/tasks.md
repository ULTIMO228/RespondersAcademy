# Задачи фичи 011 — подача карточек обучающихся-112 оператору ДДС

Отметка `[X]` — только после реальной проверки (команда и результат в `.ai/SESSION_STATE.md`).

## Фаза 1. Бэкенд

- [X] T001 Тест + реализация `GET /api/v1/student-cards`: права (§4), поля (§5.1), предложенный эталон — `backend/app/services/student_card_service.py`, `backend/app/api/v1/student_cards.py`, `backend/app/schemas/v1/student_cards.py`
- [X] T002 Тест + реализация `studentCards` в `POST /assignments`: правила §5.2 (400/403 и парный 201) — `schemas/v1/assignments.py`, `services/assignment_service.py`
- [X] T003 Тест + реализация оценки по подтверждённому эталону (§5.3) — `services/evaluation_service.py`, `services/chain_service.py`
- [X] T004 Тест + удаление автоподачи в идущие занятия (FR-004), `chain` без изменений — `services/chain_service.py`, `tests/integration/test_chain.py`

## Фаза 2. Контракт и фронт

- [X] T005 TS-типы `StudentCard`, `StudentCardEtalon`, `AssignmentCreateRequest.studentCards` + `listStudentCards()`; `extract_ts_fields.py` → `expected_fields.json`
- [X] T006 Мастер заданий: блок «Карточки обучающихся-112» в режиме ДДС, правка эталона, проверка шага, `buildRequest` — `src/features/assignment-create`
- [X] T007 Шаг «Проверка»: карточки обучающихся и решения (FR-006)

## Фаза 3. Проверки и память

- [X] T008 (2026-10-20: pytest 1042 passed/4 skipped, ruff чисто, vitest 1956/1957 — красный только известный `teacher-v1` Blob, tsc/eslint/prettier/steiger чисто; `npm run check` и e2e не запускались) `uv run pytest -q`, `uv run ruff check .`, `npx vitest run src/features/assignment-create src/shared/api`, `npx tsc --noEmit`, `npm run lint`
- [X] T009 Реестр `spec/README.md`, `.ai/SESSION_STATE.md`, `.ai/SESSIONS.md`
- [ ] T010 Ручная проверка в браузере на бэкенде (SC-003, SC-005) — не проверялось
