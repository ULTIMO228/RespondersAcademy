---

description: "Задачи по реализации фичи 001-dispatcher-simulator"
---

# Tasks: Учебный симулятор диспетчера ДДС (система-112)

**Input**: Design documents from `/specs/001-dispatcher-simulator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Конституция (раздел «Рабочий процесс») требует pytest для движка оценки и парсеров данных, контрактные тесты API и матрицу доступа (SC-010). Тесты включены только там, где это требуется; для фронтенда — ручной чек-лист демо-пути.

**Organization**: Задачи сгруппированы по пользовательским историям спецификации (US1–US7) в порядке приоритетов P1 → P4. Пути — относительно корня репозитория команды `case-09-112-dispatcher-simulator-team-82/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1…US7 из spec.md
- В описании — точный путь к файлу

## Path Conventions

Web application: `backend/src/app/`, `ml/dds_ml/`, `ai/dds_ai/`, `frontend/src/`, `contracts/`, `data/`, `deploy/` (см. plan.md → Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: каркас монорепозитория, инструменты, контракты как источник истины

- [ ] T001 Создать структуру каталогов по plan.md: `backend/`, `ml/`, `ai/`, `frontend/`, `contracts/`, `data/{tickets,streets,labeled,synthetic}`, `models/` (в .gitignore), `deploy/`, `scripts/`
- [ ] T002 Инициализировать workspace `uv` с тремя пакетами: `backend/pyproject.toml` (fastapi, sqlalchemy, alembic, pydantic, websockets, argon2-cffi, pandas, reportlab), `ml/pyproject.toml` (sentence-transformers, scikit-learn, rapidfuzz, symspellpy, pandas), `ai/pyproject.toml` (ollama, vosk, torch-cpu, soundfile); корневой `pyproject.toml` с `[tool.uv.workspace]`
- [ ] T003 [P] Инициализировать `frontend/` (Vite + React 18 + TypeScript, React Router, TanStack Query, Recharts) с `frontend/package.json`, ESLint/Prettier
- [ ] T004 [P] Скопировать JSON-схемы из `specs/001-dispatcher-simulator/contracts/*.schema.json` в `contracts/` репозитория и написать `scripts/check-contracts.py` (валидация примеров из `contracts/examples/` по схемам; генерация TS-типов через `json-schema-to-typescript` в `frontend/src/api/types.ts`)
- [ ] T005 [P] Настроить `ruff`, `mypy` (нестрого), `pytest` в корневом `pyproject.toml`; `.editorconfig`; обновить `.gitignore` (`models/`, `var/`, `frontend/dist/`, `.venv/`)
- [ ] T006 [P] Написать `deploy/docker-compose.yml` (postgres:14, backend, frontend/nginx, ollama) и `deploy/README.md`-заглушку с ссылкой на quickstart

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: БД, аутентификация, справочники и базовые модели, без которых ни одна история не работает

**⚠️ CRITICAL**: пока фаза не завершена, работа над историями не начинается

- [ ] T007 Настроить `backend/src/app/config.py` (Pydantic Settings: DATABASE_URL, MODELS_DIR, VAR_DIR, нормативы по умолчанию 30/180 с, веса компонент по умолчанию из research.md R14, флаги `ENABLE_LLM_JUDGE`, `ENABLE_LANGUAGETOOL`) и `backend/src/app/db.py` (engine, session, Base)
- [ ] T008 Создать SQLAlchemy-модели по data-model.md в `backend/src/app/models/`: `user.py`, `group.py`, `ekp_type.py`, `street.py`, `ticket.py`, `scenario.py` (+ `scenario_comment`), `session.py` (+ `session_participant`), `attempt.py`, `event.py`, `assessment.py` (+ `assessment_override`), `rating.py`, `report.py`, `audit.py`; `__init__.py` с экспортом
- [ ] T009 Инициализировать Alembic (`backend/alembic/`, `backend/alembic.ini`) и сгенерировать первую миграцию со всеми таблицами и индексами из data-model.md
- [ ] T010 [P] Реализовать аутентификацию и RBAC в `backend/src/app/services/auth.py` (argon2, JWT в HttpOnly-cookie, `get_current_user`, `require_role(*roles)`) и роутер `backend/src/app/api/auth.py` (`/auth/login`, `/auth/logout`, `/auth/me`)
- [ ] T011 [P] Реализовать сервис аудита `backend/src/app/services/audit.py` (`log(user, action, object_type, object_id, details)`) и middleware логирования отказов в доступе (`403` → `audit.log("access_denied")`)
- [ ] T012 [P] Реализовать парсер классификатора `ml/dds_ml/data/parse_classifier.py`: TSV → список `EkpType` (индексы колонок, не заголовки; нормализация `карточка -112` → `card112`, `нет реагирования` → `no_reaction`; составные главные службы → массив; 23 группы по пустым п1–п3) и `build_reference.py` → `data/classifier/ekp.json`
- [ ] T013 [P] Написать тесты парсера классификатора в `ml/tests/test_parse_classifier.py` (1283 конечных типа, 23 группы, нормализация значений, пример «пожар: мусор» → главная служба MCHS, набор служб с `card112`)
- [ ] T014 [P] Подготовить `data/tickets/tickets.json` (перепечатка 96 задач из `docs/source/bilety_zadachi_112.pdf`; поля `ticket`, `n`, `situation`, `caller_name`, `caller_phone`, `address`, `address_note`) и парсер `ml/dds_ml/data/parse_tickets.py` с дедупликацией (1.3 = 16.2) + тест `ml/tests/test_parse_tickets.py`
- [ ] T015 [P] Подготовить справочник улиц `data/streets/moscow_streets.json` (выгрузка OSM на этапе разработки, скрипт `ml/scripts/fetch_streets.py` с пометкой «только для разработки») и загрузчик `ml/dds_ml/data/streets.py`
- [ ] T016 Создать `backend/src/app/main.py`: FastAPI app, подключение роутеров, CORS для dev, раздача `frontend/dist`, событие startup с ленивым прогревом моделей (`ml`/`ai`) и регистрацией статуса компонентов в `app.state.components` (для FR-030 и `/admin/system/status`)
- [ ] T017 Реализовать сервис импорта справочников в `backend/src/app/services/reference_import.py` (ЕКП → `ekp_type`, улицы → `street`, билеты → `ticket`; идемпотентно) и CLI-команду `backend/src/app/cli.py import-reference`
- [ ] T018 [P] Реализовать Pydantic-схемы в `backend/src/app/schemas/` (`scenario.py`, `event.py`, `assessment.py`, `report.py`, `user.py`, `session.py`) и контрактный тест `backend/tests/contract/test_schemas_match_contracts.py` (примеры из `contracts/examples/` проходят и Pydantic, и JSON Schema)
- [ ] T019 [P] Реализовать каркас фронтенда: `frontend/src/api/client.ts` (fetch с cookie, обработка 401/403), `frontend/src/api/ws.ts` (реконнект + polling-фолбэк), `frontend/src/pages/Login.tsx`, layout с навигацией по роли, роутинг `frontend/src/App.tsx`
- [ ] T020 Написать `deploy/seed-demo.sh` и `deploy/seed-demo.ps1`: миграции, `import-reference`, демо-пользователи (admin/teacher/student1/student2, группа «Группа 1», служба GKH)

**Checkpoint**: логин работает для трёх ролей, справочники в БД, контракты валидируются, фронтенд открывает пустые страницы по роли

---

## Phase 3: User Story 1 — Отработка карточки по полному жизненному циклу (Priority: P1) 🎯 MVP

**Goal**: обучаемый получает карточки в очередь, ведёт их по статусам с правилами памятки, события пишутся с серверным временем; режим «Действия с карточками»

**Independent Test**: занятие с 3 предзаготовленными карточками → все проходят до «Работы завершены», в журнале все события, карточки закрыты

### Tests for User Story 1

- [ ] T021 [P] [US1] Юнит-тесты графа переходов статусов в `backend/tests/unit/test_transitions.py` (все допустимые/недопустимые переходы из data-model.md, обязательный комментарий для rejected/refused, закрытие после done/refused)
- [ ] T022 [P] [US1] Интеграционный тест `backend/tests/integration/test_attempt_flow.py`: создать занятие (напрямую в БД), выдать карточку, пройти цикл через `POST /student/attempts/{id}/events`, проверить `409`/`422`, «Не оповещено» через 30 с (с подменой часов)

### Implementation for User Story 1

- [ ] T023 [US1] Реализовать `backend/src/app/services/attempt_recorder.py`: приём события, валидация перехода (граф), обязательный комментарий, проставление `seq`/`ts` сервером, обновление `attempt.current_reaction_status`, `first_status_at`, `completed_at`, `card_state` (для `field_changed`), закрытие попытки
- [ ] T024 [US1] Реализовать минимальный `backend/src/app/services/session_engine.py` (часть 1): очередь попыток обучаемого, выдача следующего сценария из списка занятия по темпу, фоновая задача «проверка 30 с» → событие `not_notified` + флаг; серверные таймеры
- [ ] T025 [US1] Реализовать роутер `backend/src/app/api/student.py`: `GET /student/queue`, `GET /student/attempts/{id}`, `POST /student/attempts/{id}/events` (владение проверяется; `409 InvalidTransition | AttemptClosed`, `422`)
- [ ] T026 [US1] Реализовать WebSocket `backend/src/app/ws/student.py` (`/ws/student/{user_id}`: `queue_update`, `card_injected`, `session_finished`) и хаб подписок `backend/src/app/ws/hub.py`
- [ ] T027 [P] [US1] Компонент карточки `frontend/src/components/IncidentCard.tsx` по полям FR-001 (шапка, телефоны, признаки-кнопки, заявитель, адресный блок, описание, опросная карта, список оповещения) с раскладкой по скриншотам памятки; редактируемые поля пишут `field_changed`
- [ ] T028 [P] [US1] Компоненты `frontend/src/components/Queue.tsx` (список с таймерами мм:сс и индикацией «нет первичного статуса»/«Не оповещено», звуковой сигнал) и `frontend/src/components/Timer.tsx` (серверное время поступления → локальный отсчёт)
- [ ] T029 [P] [US1] Компонент `frontend/src/components/StatusPicker.tsx`: доступные статусы по текущему состоянию (граф), обязательное поле комментария для «Не принята»/«Отказ», подтверждение перед «Работы завершены»
- [ ] T030 [US1] Страницы `frontend/src/pages/student/Queue.tsx` и `frontend/src/pages/student/Card.tsx`: подписка на WS, переключение между карточками с сохранением введённого (события `switched_away`/`switched_to`), режим «Действия с карточками» (текстовое поле → `action_text` → следующая карточка)
- [ ] T031 [US1] Добавить в `deploy/seed-demo.*` 3 демо-сценария из билетов (утверждённые) и демо-занятие для ручной проверки истории

**Checkpoint**: US1 работает без оценки — можно показать поток карточек и жизненный цикл

---

## Phase 4: User Story 2 — Автоматическая оценка и разбор попытки (Priority: P1)

**Goal**: после закрытия попытки считается объяснимая оценка по компонентам; разбор-таймлайн; правка преподавателя с аудитом

**Independent Test**: 5 размеченных журналов попыток → ожидаемые ошибки и баллы, воспроизводимо

### Tests for User Story 2

- [ ] T032 [P] [US2] Фикстуры `ml/tests/fixtures/attempts/` (5 попыток: эталонная, опоздание, без комментария, опечатка в адресе, неверное первичное решение) + сценарий с эталоном; тест `ml/tests/test_engine.py` (ожидаемые типы ошибок, диапазоны баллов, детерминизм при повторе)
- [ ] T033 [P] [US2] Юнит-тесты правил: `ml/tests/test_timing.py`, `test_statuses.py`, `test_comments.py`, `test_address.py` (Дубнинская/Дубининская → `similar_street`), `test_grammar.py`

### Implementation for User Story 2

- [ ] T034 [US2] Реестр правил `ml/dds_ml/assess/rules.py`: `Rule(id, error_type, source, text)`; заполнить из памятки (нарушения 1–7 → `MEMO-V1..V7`, правила проставления → `MEMO-R1..R4`), классификатора (`EKP-1`), Q&A (`QA-30S`, `QA-3MIN`, `QA-GRAMMAR`), решений команды (`TEAM-*`); тест, что у каждого правила непустой `source`
- [ ] T035 [P] [US2] `ml/dds_ml/assess/timing.py`: первичный статус vs норматив, полный цикл vs норматив, этапы с отклонениями → `timings` из assessment.schema.json
- [ ] T036 [P] [US2] `ml/dds_ml/assess/statuses.py`: правильность первичного решения по эталону (`expected_first_status`), недопустимые переходы, пропуски статусов хода работ, исправленные ошибки (`fixed=true`), `refused_core_incident`
- [ ] T037 [P] [US2] `ml/dds_ml/assess/semantic.py`: загрузка эмбеддера из `MODELS_DIR` (rubert-tiny2), `similarity(a, b)`, `best_match(text, candidates, threshold)`; graceful-fолбэк `available=False`
- [ ] T038 [US2] `ml/dds_ml/assess/comments.py`: наличие комментария; смысловая полнота `required_comment_elements` (парафразы элементов + эмбеддинги + простые извлечения: «передано в …», «дубль», «КП №»); ошибки `no_comment`/`incomplete_comment`
- [ ] T039 [P] [US2] `ml/dds_ml/assess/address.py`: нормализация адреса, сопоставление со справочником улиц (rapidfuzz), `address_typo` и `similar_street` как отдельные типы
- [ ] T040 [P] [US2] `ml/dds_ml/assess/grammar.py`: symspellpy с русским словарём + доменным словарём (`data/streets`, службы, аббревиатуры); опциональный LanguageTool за флагом; ошибки `spelling`/`grammar` только для ручного ввода (комментарии, действия, изменённые поля)
- [ ] T041 [P] [US2] `ml/dds_ml/assess/fields.py`: сравнение `card_state` с `reference.expected_fields` (точно / нечётко / по справочнику ЕКП для типа и признаков) → `field_wrong`
- [ ] T042 [P] [US2] `ml/dds_ml/assess/multitask.py`: время реакции на каждую карточку в очереди при параллельных попытках, «залипание» → `multitask_neglect`; предупреждение `possible_guessing` по порогу чтения и `too_fast_progress`
- [ ] T043 [US2] `ml/dds_ml/assess/engine.py`: сборка компонент, веса из конфигурации (по умолчанию из research R14, перенормировка при недоступных компонентах), итоговый балл, `timeline` с вердиктами, `recommendations` по ошибкам; выход валиден по `contracts/assessment.schema.json`
- [ ] T044 [US2] Сервис `backend/src/app/services/assessment.py`: запуск `dds_ml.assess.engine` при закрытии попытки (и при завершении занятия для незавершённых), сохранение `assessment`, `components_available`, обработка недоступности моделей (FR-030); override с аудитом и записью примера в `data/labeled/overrides/`
- [ ] T045 [US2] Роутер `backend/src/app/api/assessments.py` (`POST /assessments/{id}/run`, `GET /assessments/{id}`, `POST /assessments/{id}/override`) и `GET /student/attempts/{id}/assessment` в `student.py`
- [ ] T046 [P] [US2] Компонент `frontend/src/components/Timeline.tsx` (шаги с цветами ok/late/wrong/missing, правило по клику) и страница `frontend/src/pages/student/Attempt.tsx` (балл, компоненты, ошибки с правилами, предупреждения, рекомендации)
- [ ] T047 [US2] Экран разбора для преподавателя `frontend/src/pages/teacher/AttemptReview.tsx`: тот же разбор + форма правки (балл, снять/добавить ошибку, обязательный комментарий) → `override`; отображение истории правок
- [ ] T048 [US2] Скрипт `ml/scripts/eval_assessor.py`: метрики согласия с `data/labeled/` (точность по типам ошибок, каппа Коэна, корреляция балла) с выводом таблицы в Markdown для документации

**Checkpoint**: полный MVP-цикл «карточка → отработка → оценка → разбор» демонстрируется

---

## Phase 5: User Story 3 — Проведение занятия преподавателем (Priority: P2)

**Goal**: создание и запуск занятия с параметрами, мониторинг в реальном времени, подкидывание событий, завершение, отчёт с экспортом, табло класса

**Independent Test**: занятие на 2 обучаемых × 2 карточки → отчёт с 4 попытками, CSV экспортируется

### Tests for User Story 3

- [ ] T049 [P] [US3] Интеграционный тест `backend/tests/integration/test_session_lifecycle.py`: create → start → события двух обучаемых → inject duplicate → finish → отчёт валиден по `session-report.schema.json`, незавершённые помечены

### Implementation for User Story 3

- [ ] T050 [US3] Расширить `backend/src/app/services/session_engine.py` (часть 2): параметры занятия (категории, профиль службы → фильтр по реакциям в ЕКП FR-017, сложность/адаптивно, темп и всплески, нормативы, веса), старт/финиш, inject (duplicate по адресу базовой попытки, vis_partial — обрезка признаков, repeat_call), пометка `interrupted/unfinished` при завершении
- [ ] T051 [US3] Роутер `backend/src/app/api/sessions.py`: `POST /sessions`, `/start`, `/finish`, `/inject`, `GET /monitor`, `GET /report`, `/report.csv`, `/report.pdf`
- [ ] T052 [US3] WebSocket `backend/src/app/ws/teacher.py` (`/ws/teacher/{session_id}` — push при событиях + heartbeat 2 с) и `backend/src/app/ws/board.py` (`/ws/board/{session_id}`)
- [ ] T053 [US3] Сервис отчёта `backend/src/app/services/reports.py`: сборка `SessionReport` (по обучаемым: ФИО, АРМ, этапы с отклонениями, ошибки по типам, балл; по группе: топ ошибок, тепловая карта категория × тип, инсайты-заглушки до US6), CSV через pandas, PDF через reportlab (таблица + matplotlib-диаграммы)
- [ ] T054 [P] [US3] Страница `frontend/src/pages/teacher/SessionSetup.tsx`: выбор группы/обучаемых, режим, категории ЕКП (мультивыбор из справочника), профиль службы, сложность или «адаптивно», темп, нормативы, веса компонент с значениями по умолчанию, порог успешности → создать → старт
- [ ] T055 [P] [US3] Страница `frontend/src/pages/teacher/Monitor.tsx`: сетка обучаемых (текущая карточка, статус, таймеры, очередь, красные «Не оповещено»), кнопки «Подкинуть дубль / ВИС / повторный звонок», «Завершить занятие»
- [ ] T056 [P] [US3] Страница `frontend/src/pages/teacher/Report.tsx`: таблица по обучаемым и попыткам, диаграммы (Recharts: баллы, отклонения по этапам, ошибки по типам), кнопки экспорта CSV/PDF, переход в разбор попытки
- [ ] T057 [P] [US3] Страница `frontend/src/pages/board/ClassBoard.tsx`: полноэкранное табло без управления (для внешнего монитора) по `/ws/board`

**Checkpoint**: преподаватель проводит занятие от настройки до отчёта

---

## Phase 6: User Story 4 — Генерация, предпросмотр и утверждение сценариев (Priority: P2)

**Goal**: банк сценариев из билетов, генерация вариаций локальной LLM с автоэталоном, фильтр качества, предпросмотр, утверждение/правка/перегенерация, импорт таблицы преподавателя

**Independent Test**: 5 вариаций «Запах газа» сложности 3 → ≥ 3 прошли фильтр; отклонение с комментарием → перегенерация учитывает его; утверждённые доступны в настройке занятия

### Tests for User Story 4

- [ ] T058 [P] [US4] Тесты построения эталона `ml/tests/test_reference_builder.py` (по `final_type` → список оповещения без `no_reaction`, ожидаемый статус для целевой службы, `needs_teacher_review` для типов без главной службы) и фильтра качества `ml/tests/test_quality.py` (дубликат по косинусу > 0.9, несовпадение категории)
- [ ] T059 [P] [US4] Тест генератора с мок-LLM `ai/tests/test_generate.py`: выход валиден по `scenario.schema.json`, повтор при невалидном JSON (до 2 раз), перегенерация включает комментарий в промпт

### Implementation for User Story 4

- [ ] T060 [US4] `ml/dds_ml/data/reference_builder.py`: билет/сгенерированная фабула + `ekp_code` + `target_service` → `reference` (notify_services, expected_first_status, required_comment_elements по ловушкам, traps по эвристикам: адрес вне Москвы, «03 не требуется», непрофильное, многослужбовое; report_checklist)
- [ ] T061 [P] [US4] Классификатор группы ЕКП `ml/dds_ml/classify/` (`train.py`: эмбеддинги + логрег на `data/synthetic/` + билеты; `predict.py`; артефакт `models/ekp_group_clf.joblib`) и скрипт `ml/scripts/eval_classifier.py` (accuracy, confusion matrix на 96 билетах — SC-003)
- [ ] T062 [P] [US4] Фильтр качества `ml/dds_ml/quality/filter.py`: подтверждение категории классификатором, дедуп по эмбеддингам (e5-small или rubert-tiny2 по метрике) против банка, причины отклонения → `scenario.quality`
- [ ] T063 [P] [US4] Клиент LLM `ai/dds_ai/llm.py` (Ollama, таймауты, JSON-режим) и генератор `ai/dds_ai/generate.py`: few-shot из билетов по группе, параметры (категория, локация, сложность, count), строгий JSON по схеме, валидация + повтор; `regenerate(scenario, comment)`
- [ ] T064 [US4] Сервис `backend/src/app/services/scenario_bank.py`: импорт билетов → сценарии (`origin=ticket`, эталон через `reference_builder`, `approval_status=pending`, дедуп), фоновая задача генерации (`job_id`, прогресс) → фильтр качества → сохранение, approve/partial/reject/regenerate (версии, `parent_id`, `scenario_comment`), ручная правка с `dds_ml.assess.grammar` и `confirm`, импорт таблицы «ситуация | адрес» (CSV/XLSX через pandas/openpyxl, DOCX-таблица через python-docx)
- [ ] T065 [US4] Роутер `backend/src/app/api/scenarios.py` по contracts/api.md (список с фильтрами, карточка сценария, import/tickets, import/table, generate + статус job, approve, reject, regenerate, PUT с `grammar_issues`)
- [ ] T066 [P] [US4] Страница `frontend/src/pages/teacher/ScenarioBank.tsx`: список с фильтрами (статус, группа ЕКП, служба, происхождение), кнопки «Импорт билетов», «Импорт таблицы», «Генерировать» (форма параметров + прогресс job), раздел «Отклонено фильтром» с причинами
- [ ] T067 [P] [US4] Страница `frontend/src/pages/teacher/ScenarioPreview.tsx`: карточка + эталон с подсветкой правильных ответов, «Утвердить / Частично / Отклонить», поле комментария → «Перегенерировать», ручная правка с подсветкой грамматических замечаний, история версий
- [ ] T068 [US4] Ограничить выбор сценариев в `session_engine` только `approved/partially_approved` (FR-014) и добавить в `SessionSetup.tsx` счётчик доступных сценариев по выбранным категориям/службе

**Checkpoint**: демо-путь «преподаватель готовит материалы» работает целиком

---

## Phase 7: User Story 5 — Голосовой доклад руководителю через софтфон (Priority: P3)

**Goal**: браузерный софтфон, ИИ-ответчик «Слушаю / Принято» с вариативными голосами, STT доклада, чек-лист в оценке, прослушивание записи, текстовый фолбэк

**Independent Test**: звонок по тестовой карточке без номера карточки → в оценке «не назван номер карточки», запись доступна

### Tests for User Story 5

- [ ] T069 [P] [US5] Тест `ml/tests/test_report_checklist.py`: транскрипты с парафразами («у нас на Дубининской, дом пять» ≡ адрес) → named/missing/wrong; скрипт `ml/scripts/eval_report_checklist.py` на `data/labeled/reports/` (SC-009)
- [ ] T070 [P] [US5] Тест конечного автомата ответчика `ai/tests/test_responder.py` (приветствие → запись → пауза 2 с / стоп → подтверждение; выбор голоса по службе)

### Implementation for User Story 5

- [ ] T071 [P] [US5] `ai/dds_ai/voice/stt.py` (Vosk streaming, доменная грамматика из улиц/служб/чисел), `ai/dds_ai/voice/tts.py` (Silero, кэш фраз «Слушаю», «Понял, информация принята» по голосам), `ai/dds_ai/voice/responder.py` (автомат, детекция паузы по энергии)
- [ ] T072 [P] [US5] `ml/dds_ml/assess/report_checklist.py`: сопоставление транскрипта с `reference.report_checklist` (эмбеддинги + нормализация чисел/адресов) → `report_checklist` и ошибки `report_item_missing/wrong`; подключить компонент `report` в `engine.py`
- [ ] T073 [US5] Сервис `backend/src/app/services/softphone.py` и WebSocket `backend/src/app/ws/softphone.py` (`/ws/softphone/{call_id}`: приём PCM16-чанков, стриминг в STT, отправка TTS, запись WAV в `var/recordings/`, финальный транскрипт → события `call_started`/`call_finished`); роутер `backend/src/app/api/softphone.py` (`/softphone/call`, `/text-report`)
- [ ] T074 [US5] Компонент `frontend/src/components/Softphone.tsx`: набор номера, `getUserMedia` + AudioWorklet → PCM16/16 кГц → WS, воспроизведение TTS, индикатор записи, кнопка «Завершить», фолбэк на текстовый доклад при отсутствии микрофона; встроить в `pages/student/Card.tsx`
- [ ] T075 [US5] В `pages/student/Attempt.tsx` и `teacher/AttemptReview.tsx` добавить блок доклада: плеер записи, транскрипт, чек-лист named/missing/wrong

**Checkpoint**: обучаемый докладывает голосом, доклад в оценке

---

## Phase 8: User Story 6 — Адаптивная сложность, аналитика и рекомендации (Priority: P3)

**Goal**: рейтинг обучаемого и сложность сценария, адаптивный подбор, аналитика преподавателя (радар, динамика, тепловая карта, топ ошибок, инсайт), кабинет обучаемого

**Independent Test**: после 6 попыток рейтинг сдвинулся ожидаемо, следующий сценарий в ожидаемом диапазоне сложности; тепловая карта отражает ошибки

### Tests for User Story 6

- [ ] T076 [P] [US6] Тест `ml/tests/test_adaptive.py`: расчёт сложности сценария по признакам, Эло-обновление (3 успеха → рост, провал → снижение), подбор с повышенной вероятностью слабой категории

### Implementation for User Story 6

- [ ] T077 [P] [US6] `ml/dds_ml/adaptive/` (`difficulty.py`: D по ловушкам/службам/адресу/темпу/источнику; `rating.py`: Эло-обновление, `weak_categories`; `select.py`: следующий сценарий из утверждённых) и сервис `backend/src/app/services/adaptive.py` (обновление `student_rating` после оценки, вызов из `session_engine` в режиме `adaptive`)
- [ ] T078 [P] [US6] `ml/dds_ml/analytics/` (радар компетенций из компонент оценки, динамика по занятиям, тепловая карта группа ЕКП × тип ошибки, топ ошибок, кластеризация комментариев преподавателя по эмбеддингам, детекция аномалий «слишком быстро и идеально») и шаблонные инсайты («N % группы не указывает, кому передана информация…»); при `ENABLE_LLM_JUDGE` — формулировка инсайта через `ai/dds_ai/judge.py`
- [ ] T079 [US6] Сервис `backend/src/app/services/analytics.py` + роутер `backend/src/app/api/analytics.py` (`GET /sessions/{id}/analytics`, `GET /student/me/progress`), заполнить `group_summary.insights` в `reports.py`
- [ ] T080 [P] [US6] Страница `frontend/src/pages/teacher/Analytics.tsx`: радар (Recharts), динамика, тепловая карта (кастомный компонент `frontend/src/components/Heatmap.tsx`), топ ошибок, инсайты
- [ ] T081 [P] [US6] Страница `frontend/src/pages/student/Profile.tsx`: баллы, время реакции, история ошибок, рекомендации с правилами, рейтинг и динамика; только свои данные

**Checkpoint**: «прогнозирование» и «наглядность диаграмм» закрыты

---

## Phase 9: User Story 7 — Администрирование и аудит (Priority: P4)

**Goal**: управление пользователями/группами, журнал аудита, статус системы, ручной бэкап; администратор не меняет оценки

**Independent Test**: администратор создаёт преподавателя и двух обучаемых в группе; преподаватель их видит; у администратора нет «изменить оценку»

### Tests for User Story 7

- [ ] T082 [P] [US7] Контрактный тест матрицы доступа `backend/tests/contract/test_rbac_matrix.py`: роль × ресурс (student не видит чужие попытки/отчёты, admin получает 403 на override и правку сценариев, teacher не видит `/admin/*`) — SC-010

### Implementation for User Story 7

- [ ] T083 [US7] Роутер `backend/src/app/api/admin.py`: users CRUD (роль, блокировка, АРМ, служба), groups CRUD, `GET /admin/audit` с фильтрами, `GET /admin/system/status` (из `app.state.components` + проверка БД/Ollama), `POST /admin/backup` (pg_dump в `var/backups/`, запись аудита)
- [ ] T084 [P] [US7] Страницы `frontend/src/pages/admin/Users.tsx`, `Groups.tsx`, `Audit.tsx` (фильтр по пользователю/периоду/действию), `System.tsx` (статус компонентов, кнопка «Создать резервную копию» со ссылкой на файл)
- [ ] T085 [P] [US7] Скрипты `deploy/backup.sh` / `deploy/backup.ps1` (pg_dump + gzip) — используются и кнопкой, и вручную

**Checkpoint**: все три роли полностью функциональны

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: валидация метрик, офлайн-проверка, документация и материалы сдачи

- [ ] T086 [P] Разметить калибровочную выборку `data/labeled/attempts/` (50–100 попыток: синтетика через `session_engine` + вручную испорченные), прогнать `ml/scripts/eval_assessor.py`, зафиксировать метрики (SC-002)
- [ ] T087 [P] Реализовать `ml/dds_ml/calibration/calibrate.py` (ridge по компонентам на разметке + `data/labeled/overrides/`) и `ml/scripts/calibrate.py`; записать веса по умолчанию в `backend/src/app/config.py`
- [ ] T088 [P] `deploy/prepare-models.sh` / `.ps1`: загрузка rubert-tiny2, e5-small, vosk-small-ru, silero, словарей symspell, `ollama pull`; проверка контрольных сумм; README с размерами и временем отклика на CPU (принцип I)
- [ ] T089 Проверка SC-008: пройти демо-путь с захватом трафика при отключённой сети, зафиксировать результат в `docs/methods.md`; проверка SC-004 (время оценки и отчёта на CPU) — скрипт `ml/scripts/bench_cpu.py`
- [ ] T090 [P] Документация сдачи: `docs/install.md` (из quickstart.md, Windows и Linux), `docs/architecture.md` (функциональная и компонентная архитектура, матрица доступа, как подключить SIP/TLS/бэкапы по расписанию при внедрении), `docs/methods.md` (методы обработки данных, модели, метрики, ограничения), перечень библиотек в `README.md`
- [ ] T091 [P] Юнит-тесты фронтенда (Vitest) для `StatusPicker` (доступные статусы по графу) и `Timer`; ручной чек-лист демо-пути в `docs/demo-checklist.md` по quickstart.md §4
- [ ] T092 Оптимизация: прогрев моделей при старте, кэш эмбеддингов эталонов, индексы БД по data-model.md; убедиться, что мониторинг обновляется ≤ 2 с при 20 обучаемых (нагрузочный скрипт `backend/tests/load/simulate_students.py`)
- [ ] T093 Записать скринкаст ≤ 5 мин по quickstart.md §4 и подготовить презентацию (pptx/pdf) со слайдами «достоверность» (метрики T086) и архитектурой

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → истории.
- **US1 (Phase 3)**: только Foundational.
- **US2 (Phase 4)**: US1 (события попытки — вход оценщика). ML-часть (T032–T043) может начинаться параллельно с US1 на фикстурах.
- **US3 (Phase 5)**: US1 (попытки) и US2 (отчёт содержит оценки).
- **US4 (Phase 6)**: Foundational (справочники); интеграция в занятие (T068) — после US3. Может идти параллельно с US1–US3 силами ИИ-инженера + ML.
- **US5 (Phase 7)**: US1 (попытка, карточка) и US2 (компонент `report` в оценке).
- **US6 (Phase 8)**: US2 (оценки) и US3 (занятия, отчёт).
- **US7 (Phase 9)**: Foundational; независима от остальных историй.
- **Polish (Phase 10)**: после нужных историй; T086–T088 можно начинать после US2/US4.

### Within Each User Story

- Тесты (где включены) пишутся первыми и должны падать до реализации.
- ML-модули (`ml/`) → сервисы бэкенда → роутеры → фронтенд.
- История завершена, когда её Independent Test из spec.md проходит.

### Parallel Opportunities (5 человек)

- **Бэкенд**: T007–T011, T016–T018, T020 → T023–T026 → T044–T045 → T050–T053 → T064–T065 → T073 → T079 → T083.
- **ML**: T012–T015 → T032–T043 → T048 → T058, T060–T062 → T069, T072 → T076–T078 → T086–T087.
- **ИИ-инженер**: T059, T063 → T070–T071 → синтетика для T061 → T078 (инсайты через judge).
- **Фронтенд**: T003, T019 → T027–T030 → T046–T047 → T054–T057 → T066–T067 → T074–T075 → T080–T081 → T084.
- **Пятый участник / общий**: T001–T002, T004–T006, T014 (перепечатка билетов), T031, T085, T088–T093.

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 → Phase 2.
2. Phase 3 (US1) и ML-часть Phase 4 параллельно; затем интеграция оценки.
3. **STOP and VALIDATE**: Independent Test US1 и US2; демо «карточка → оценка → разбор».

### Incremental Delivery

- + US3 → занятие и отчёт (главный экран для жюри).
- + US4 → генерация и утверждение (сценарий A ТЗ).
- + US5 → софтфон (сильный плюс на питче).
- + US6 → адаптивность и аналитика («прогнозирование», «диаграммы»).
- + US7 → администрирование (закрыть три роли).
- Polish: метрики, офлайн-проверка, документация, скринкаст — начинать не позже 27.09.

---

## Notes

- [P] = разные файлы, нет зависимостей.
- Каждая ошибка оценки обязана иметь `rule` с `source` (принцип II) — проверяется тестом T034.
- Никаких внешних сетевых вызовов в рантайме (принцип I) — проверяется T089.
- Изменение JSON-схем в `contracts/` — только с уведомлением команды и обновлением `scripts/check-contracts.py` (принцип V).
