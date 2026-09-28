# Tasks: Бэкенд + ML тренажёра (drop-in замена мок-API, затем режим 112 / экзамен / лобби)

**Input**: Design documents from `specs/002-two-mode-simulator/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md); контракт фронта `docs/mock-api.md`, `spec/05-data-models.md`, `src/shared/api/types/*.ts`; сиды `spec/mocks/`, `mocks/local/`, `mocks/admin/`.

**Tests**: включены — конституция требует pytest для оценщика и парсеров, FR-059 требует прохождения контрактных тестов и `scripts/e2e-*.sh`. Тесты пишутся в фазе истории до/вместе с реализацией.

**Organization**: волна A (фазы 1–9) — совместимый бэкенд, закрывает US1, US2, US5, US6, US9, US10, US11 существующими экранами; гейт — `scripts/e2e-*.sh`; волна B (фазы 10–16) — `/api/v1` для US3, US4, US5-экзамен, US6-валидация/аудио, US7, US8, US9-сообщения, US10-аудио.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (другие файлы, нет зависимостей от незавершённых задач)
- **[Story]**: US1…US11 из spec.md
- Пути — от корня репозитория `RespondersAcademy/`

## Path Conventions

- Бэкенд: `backend/app/` (FastAPI), `backend/ml/` (оценщик, NLP, генерация), `backend/tests/`, `backend/data/`, `backend/alembic/`
- Фронт: без изменений, кроме `next.config.ts` (T072)
- Сиды читаются из `spec/mocks/`, `mocks/local/`, `mocks/admin/` (корень репо), путь переопределяется `SEED_DIR`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: каркас `backend/`, зависимости, конфигурация, инструменты

- [X] T001 Create `backend/pyproject.toml` (uv; пакеты `app`, `ml`; deps: fastapi, uvicorn[standard], sqlalchemy[asyncio]>=2, aiosqlite, alembic, pydantic>=2, pydantic-settings, python-jose[cryptography], argon2-cffi, httpx, rapidfuzz, symspellpy, sentence-transformers, scikit-learn, numpy, reportlab, python-multipart; extras `pg` = asyncpg, `tts` = torch+silero deps, `stt` = vosk, `llm` = ollama client; dev: pytest, pytest-asyncio, ruff) и `backend/README.md` с командами из `specs/002-two-mode-simulator/quickstart.md`
- [X] T002 Create package skeleton with `__init__.py`: `backend/app/{db,models,schemas,schemas/v1,api,api/compat,api/v1,services,seed}/`, `backend/ml/{assess,assess/components,nlp,classify,generate,insights,speech,scripts}/`, `backend/tests/{contract,integration,unit}/`, `backend/data/{streets,labeled,kb}/`, `backend/var/.gitkeep`, `backend/alembic/versions/`
- [X] T003 [P] Create `backend/app/config.py` — `Settings` (pydantic-settings): `DATABASE_URL` (default `sqlite+aiosqlite:///./var/dev.db`), `JWT_SECRET`, `JWT_TTL_HOURS=24`, `TZ_OFFSET="+03:00"`, `MODELS_DIR`, `SEED_DIR` (default `../` → корень репо), `OLLAMA_URL` (optional), `API_PREFIXES=["/api/mock","/api/v1"]`, `TWO_FACTOR_STUB=True`; `.env.example`
- [X] T004 [P] Configure tooling: `backend/ruff.toml` (line-length 110, isort), `backend/pytest.ini` (asyncio_mode=auto, testpaths), `backend/.gitignore` (`var/`, `models/`, `.venv/`, `*.db`)
- [X] T005 [P] Add `backend/docker-compose.yml` (services: `postgres:14` с volume и healthcheck, `backend` build из `backend/Dockerfile`, профиль `llm`: `ollama/ollama`) и `backend/Dockerfile` (python:3.11-slim, uv sync --extra pg, uvicorn)
- [X] T006 [P] Append backend section to repo root `.gitignore` (`backend/var/`, `backend/models/`, `backend/.venv/`) and add `backend/` overview to root `README.md` («Бэкенд» раздел: запуск, `BACKEND_URL`, ссылка на `backend/README.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: БД, ошибки, viewer/RBAC, сиды, справочники, пользователи — без этого ни одна история не работает

**⚠️ CRITICAL**: все истории зависят от этой фазы

- [X] T007 Create `backend/app/db/base.py` — `Base` (DeclarativeBase), тип `JSONVariant = JSON().with_variant(JSONB, "postgresql")`, `TimestampTZ`, миксин `created_at/updated_at`; `backend/app/db/session.py` — async engine/sessionmaker из `Settings`, `get_db` dependency, `init_db()` (create_all для SQLite)
- [X] T008 [P] Create `backend/app/db/ids.py` — генераторы ID в форматах сидов: `next_id(session, prefix, width)` по максимальному номеру (`u-NNN`, `s-NNN`, `ses-NNN`, `att-NN`, `mat-NNN`, `audit-NNN`, `log-NNN`), `report_id(session_id, student_id)` → `rep-<хвост>-<student>`, `group_report_id`
- [X] T009 [P] Create `backend/app/api/errors.py` — `ApiError(status, code, message)`; коды `badRequest, validationFailed, unauthorized, accountBlocked, forbidden, notFound, evaluationPending, invalidTransition, conflict, internal`; exception handlers → `{ "error": { "code", "message" } }`; маппинг `RequestValidationError` → 400 `validationFailed` с именем поля по-русски; 500 без деталей
- [X] T010 [P] Create `backend/app/schemas/common.py` — `ApiModel` (alias_generator camelCase, `populate_by_name`, `extra="ignore"`, `ser_json_timedelta`), `PageResponse[T] { items, total, page, perPage }`, `parse_page(page, perPage: 1–100, default 10)`, `parse_multi(query, key, synonyms)` (повторный ключ, CSV не разбирается), `iso_msk(dt)` → ISO 8601 с `+03:00`
- [X] T011 Create models `backend/app/models/user.py` (`users`: id PK str, login unique, password_hash, full_name, role enum student/teacher/admin, arm_number int, is_active bool, group?, service?, assigned_groups JSON?, failed_logins int) and `backend/app/models/audit.py` (`audit_log`: id, at, user_id?, role, action, details, ip?) per data-model.md
- [X] T012 [P] Create models `backend/app/models/reference.py` (`reference`: key PK, value JSON) and `backend/app/models/classifier.py` (`classifier_entries`: code PK, group idx, sign1..3, extra_signs, final_type, ekp35_type, main_service, notifications JSON)
- [X] T013 Create `backend/app/api/deps.py` — `get_viewer(request)`: cookie `arm112_session` (URL-decoded JSON `AuthSession`) или `Authorization: Bearer`; проверка JWT HS256 (`sub`, `role`, `exp`); истёкший/битый → `None` (аноним); `require_role(*roles)` → 401/403; `require_admin_by_body(adminId)` — совместимый режим мока (роль администратора по `adminId` из тела, если viewer отсутствует)
- [X] T014 Create `backend/app/services/audit.py` — `record(session, action, user_id, role, details, ip=None)` с ID `audit-NNN`; `backend/app/services/security.py` — argon2 hash/verify, `issue_token(user)`, `AuthSession` builder (`token`, `twoFactorUsed`, `issuedAt`)
- [X] T015 Create `backend/app/seed/load.py` — идемпотентная загрузка (upsert по id) `spec/mocks/users.json` (пароли → argon2), `reference.json` (10 ключей + `classifierMeta` из `classifier.json.meta`), `classifier.json`, `mocks/local/addresses.json`, `mocks/admin/audit-log.json`; CLI `python -m app.seed.load [--reset]`; сводка счётчиков; остальные коллекции добавляются в задачах историй (T023, T041, T052, T062)
- [X] T016 Create `backend/app/api/compat/auth.py` — `POST /auth/login` (`{ login, password, armNumber, twoFactorCode? }` → 400/401 без уточнения/403 `accountBlocked`; тройка логин+пароль+АРМ; `lockAfterAttempts` из настроек; аудит `auth.login`; ответ `AuthSession`), `GET /auth/policy` (`AuthPolicy { twoFactorRequired, minPasswordLength, lockAfterAttempts }` из `system_settings.security`, до T062 — значения по умолчанию из `mocks/admin/system-settings.json`)
- [X] T017 [P] Create `backend/app/api/compat/reference.py` — `GET /reference` (объект из таблицы `reference` + `classifierRows: { $ref, rowCount, note }`) and `backend/app/api/compat/classifier.py` — `GET /classifier` (`group` точное совпадение, `code` → записи группы кода; без параметров — все 1283; заголовок `X-Classifier-Version` URL-encoded из `classifierMeta.version`)
- [X] T018 [P] Create `backend/app/api/compat/users.py` — `GET /users` (`role`, `group`; `PublicUser[]` без пароля; viewer-student → 403; мусорная роль → 400)
- [X] T019 Create `backend/app/main.py` — FastAPI app, регистрация error handlers, роутер `compat` монтируется под каждым префиксом из `API_PREFIXES`, роутер `v1` — только под `/api/v1`; `GET /api/v1/health`; startup: `init_db()` для SQLite; `backend/app/api/compat/__init__.py` собирает роутеры
- [X] T020 Create unit/contract tests for foundation: `backend/tests/conftest.py` (SQLite in-memory engine, seed loader fixture, `client` httpx AsyncClient, helpers `login_as(role)` → cookie `arm112_session`), `backend/tests/contract/test_auth_reference.py` (login 200/400/401/403, policy, reference keys, classifier `group`/`code` + заголовок, users 403 для student), `backend/tests/unit/test_ids.py`, `backend/tests/unit/test_errors.py`

**Checkpoint**: `uv run python -m app.seed.load` → 24 users / 1283 classifier; `curl /api/mock/reference` работает; тесты фазы зелёные

---

## Phase 3: User Story 1 — Режим диспетчера ДДС: приём карточки и решение (Priority: P1) 🎯 MVP

**Goal**: карточки (фикстуры + 96 учебных), действия по карточке с машиной статусов, попытки, занятия с лентой и управлением — всё, что фронт `/arm/*` и `/teacher/session` вызывает во время работы обучаемого

**Independent Test**: `scripts/e2e-student.sh` шаги «журнал → занятие → цикл статусов» проходят против бэкенда; в БД есть `attempts` с `statuses[]` и таймстампами; недопустимый переход → 409

### Tests for User Story 1

- [X] T021 [P] [US1] Unit tests `backend/tests/unit/test_dds_status_machine.py` — граф из `reference.ddsStatuses`: старт → accepted|notAccepted; notAccepted → только accepted; workRefused после accepted; `requiresComment` без комментария → validationFailed; вне графа → invalidTransition; неизвестный → badRequest
- [X] T022 [P] [US1] Unit tests `backend/tests/unit/test_cards_search.py` и `backend/tests/unit/test_session_feed.py` — те же примеры, что в `src/shared/api/mock/cards-list.test.ts`, `__tests__/cards-search.test.ts`, `routes/sessions*.test.ts` (окно `(since, at]`, порядок событий, `studentId`, изоляция)

### Implementation for User Story 1

- [X] T023 [US1] Extend `backend/app/seed/load.py` — загрузка `spec/mocks/cards.json` → `incident_cards`, `spec/mocks/fixtures/arm-cards.json` → `arm_card_fixtures`, `spec/mocks/sessions.json` → `sessions` + `card_flow_items` + `attempts` + `phone_calls` (+ `evaluations` из `cardEvents[].evaluation`); порядок загрузки с учётом FK
- [X] T024 [P] [US1] Create models `backend/app/models/card.py` — `incident_cards` (все поля `IncidentCard` + `created_by_student_id?`, `mode_origin`, `source_attempt_id?`), `arm_card_fixtures` (поля `ArmCardFixture` как JSON-колонки `phones, applicant, address, what, work_lines, notification_list, emergency`), `card_runtime` (card_id PK, `status_events JSON[]`, `work_lines JSON[]`, `reminders JSON[]`, `sms JSON[]`, `current_dds_status?`, `closed bool`)
- [X] T025 [P] [US1] Create models `backend/app/models/session.py` — `sessions` (teacher_id, student_ids JSON, scenario_ids JSON, mode demo/follow/practice, card_source generated/studentCreated/mixed, plan JSON?, state draft/configured/running/finished/reported, started_at?, finished_at?, paused, paused_at?, training_mode default `dds`, format default `training`, exam JSON?), `card_flow_items` (session_id, card_id, student_id, issued_at, level, issued_by), `attempts` (id att-NN, session_id, card_id, student_id, mode default `dds`, opened_at, primary_reaction_ms, statuses JSON[], services_called JSON, completed_at?, full_processing_ms?, entered_text JSON, status_mark?, card_snapshot JSON?), `phone_calls`
- [X] T026 [P] [US1] Create schemas `backend/app/schemas/cards.py` (`ArmCardFixture`, `IncidentCard`, `CardDetails { kind, resolvedFixtureId?, runtime: CardRuntimeState }`, `CardStatusRequest { ddsStatus, comment?, dutyNumber? }`, `CardStatusEvent`, `CardWorkLine(+Request)`, `CardReminder(+Request)`, `CardSms(+Request)`, `CardLinksResponse`, `CardSearchFilters`) — поля 1:1 с `src/shared/api/types/{arm-card,card-runtime,card-search,incident-card,requests}.ts`
- [X] T027 [P] [US1] Create schemas `backend/app/schemas/sessions.py` (`Session`, `CardFlowItem`, `CardEvent` с `calls[]`, `evaluation?`, `completedAt` как `""` для открытой, `SessionPlan`, `SessionCreateRequest`, `SessionControlRequest/Response`, `SessionFeedResponse`, `SessionFeedEvent` видов `cardIssued/cardOpened/statusChanged/cardCompleted/aiEvaluation`, `CardAttemptRequest/Response`, `AttemptProgressRequest`) — 1:1 с `src/shared/api/types/{session,attempts,teacher}.ts`
- [X] T028 [US1] Create `backend/app/services/dds_status_machine.py` — `apply_status(runtime, reference_dds_statuses, request)`: проверка графа/комментария (ошибки из T009), запись `CardStatusEvent`, `closed` на `workDone`/`workRefused`; `backend/app/services/fixture_map.py` — правило `group → fixture id` перенесено из `src/shared/api/mock/fixture-map.ts` (проверить те же соответствия тестом на все 96 карточек)
- [X] T029 [US1] Create `backend/app/services/cards_query.py` — расширенный поиск `GET /cards` (все поля `CardSearchFilters` из `docs/mock-api.md`: AND между полями, OR внутри повторных, регистр и ё/е не различаются, синонимы ключей `signs/arms/okrugs/services/channels/sources/cardStatuses/status`), `dataset` all/fixtures/training, `view` all/empty/sms, `sort` `-createdAt`/`createdAt`, мусор → 400; проекция учебных карточек поверх фикстуры (id, номер = цифры id, заявитель, АОН, адрес, фабула в «Описании», статус «Зарегистрирована», округ/район пустые); пагинация после фильтров
- [X] T030 [US1] Create `backend/app/api/compat/cards.py` — `GET /cards` (T029 → `PageResponse<ArmCardFixture>`), `GET /cards/{id}` (`card-*` / `c-NNN` → `CardDetails`, 404)
- [X] T031 [US1] Create `backend/app/api/compat/card_actions.py` — `POST /cards/{id}/status` (T028 + дописать статус в открытую попытку курсанта по карточке), `POST /cards/{id}/links` (`duplicate_of` → `chain[{cardId, role main|subordinate}]`, фикстуры → `[]`), `POST /cards/{id}/worklines` (201), `POST /cards/{id}/reminders` (201, `remindAt` ISO), `GET/POST /cards/{id}/sms` (входящие фикстуры + store, `direction: outgoing`, телефон по умолчанию АОН), `GET /cards/{id}/recordings` → `[]`
- [X] T032 [US1] Create `backend/app/services/session_engine.py` — `build_card_flow(session, plan, scenarios, cards, now)` по `SessionPlan` (темп, порядок, конвейер, категории, профили; без плана — шаг 3 мин) перенесено из `src/entities/session`; `feed(session, since, at, student_id, viewer)` окно `(since, at]` с порядком «выдача → открытие → статус → завершение → оценка ИИ, затем курсант, карточка» и изоляцией (teacher — свои занятия, student — своё занятие и свои события, иначе 403); `control(action)` pause/resume/issue (issue → `card_flow_items` «сейчас»)/report (переход `finished → reported`, вызов T046); `project_for_student(session, student_id)`
- [X] T033 [US1] Create `backend/app/api/compat/attempts.py` (часть 1) — `POST /cards/{id}/attempt` (`{ studentId, issuedAt? }`: идущее занятие курсанта, выдавшее карточку → любое идущее → новое занятие практики `mode: practice`; открытая попытка → та же, `created: false`, 200; иначе 201; viewer-student с чужим `studentId` → 403), `POST /attempts/{id}/progress` (`status?`, `enteredText?`, `completedAt?` → завершение вычисляет `fullProcessingMs` и вызывает оценку T045 при наличии эталона)
- [X] T034 [US1] Create `backend/app/api/compat/sessions.py` — `GET /sessions` (фильтры `teacherId/studentId/state`; student → проекция, чужой `studentId` → 403, аноним со `studentId` → 401), `POST /sessions` (201, `configured`), `POST /sessions/{id}/start` (409 не из `configured`; T032 build_card_flow), `POST /sessions/{id}/stop` (409 не из `running`; открытые попытки помечаются), `GET /sessions/{id}/feed`, `GET/POST /sessions/{id}/control`
- [X] T035 [US1] Create contract tests `backend/tests/contract/test_cards.py`, `backend/tests/contract/test_sessions.py` — коды и обязательные поля по строкам 5–16, 31–37 `specs/002-two-mode-simulator/contracts/compat-endpoints.md`; примеры из `docs/mock-api.md` «Примеры» (`okrug=ЮАО&cardStatus=registered`, `notAccepted` без комментария → 400, feed с `at`)

**Checkpoint**: обучаемый через фронт с `BACKEND_URL` открывает карточку, ставит статусы, переключается между карточками; преподаватель запускает занятие и видит ленту

---

## Phase 4: User Story 2 — Автоматическая оценка и разбор попытки (Priority: P1)

**Goal**: реальный оценщик режима B за `AiGateway`: `Evaluation` по попытке, правки преподавателя с аудитом, отчёты занятия (живые и статические), журнал отчётов, обратная связь

**Independent Test**: `uv run python -m ml.scripts.eval_assessor` на `backend/data/labeled/` даёт согласие ≥ 0,85 и корреляцию ≥ 0,8; `GET /attempts/att-01/evaluation` отдаёт `Evaluation` с непустыми `errors[].message` вида «… — правило»; `POST /attempts/{id}/evaluation` пишет `evaluation.override` в аудит и меняет `Report.score`

### Tests for User Story 2

- [X] T036 [P] [US2] Unit tests `backend/tests/unit/test_assess_dds.py` — 5 размеченных попыток из spec US2 Independent Test (эталонная; опоздание > 30 с; `notAccepted` без «кому передано»; «Дубнинская» vs «Дубининская»; неверное первичное решение) → ожидаемые типы ошибок и диапазоны баллов; детерминизм при повторе
- [X] T037 [P] [US2] Unit tests `backend/tests/unit/test_nlp.py` — `grammar.check` (опечатка → `GrammarError{type: spelling}`), `address.match` («ул. Дубнинская» → `addressLookalike` ratio ≥ 85), `semantic.similar` («территория ЖКХ Басманного района, передано в ОДС-3» ≈ «причина + кому передано» ≥ порога, «не обслуживаем» < порога)
- [X] T038 [P] [US2] Create labeled dataset `backend/data/labeled/attempts/*.json` (≥ 50 попыток режима B: синтетика из `spec/mocks/sessions.json` + намеренно испорченные варианты) с разметкой `{ expectedErrors: [type], expertScore }` и `backend/data/labeled/README.md` (правила разметки)

### Implementation for User Story 2

- [X] T039 [P] [US2] Create `backend/ml/nlp/embedder.py` (lazy-load `cointegrated/rubert-tiny2` из `MODELS_DIR`, `encode(texts)`, кэш), `backend/ml/nlp/semantic.py` (`similarity(a, b)`, `covers_key_phrases(text, phrases, threshold=0.62)`), `backend/ml/nlp/grammar.py` (symspellpy с ru-словарём + доменный словарь `backend/data/domain_words.txt`; выход `GrammarError { field, fragment, wrong, expected, type }`), `backend/ml/nlp/address.py` (нормализация адреса, `rapidfuzz.token_set_ratio` по `backend/data/streets/moscow_streets.json`, `lookalike` при 85 ≤ ratio < 100)
- [X] T040 [P] [US2] Create `backend/data/streets/moscow_streets.json` — справочник улиц (генератор `backend/ml/scripts/build_streets.py` из OSM-выгрузки на машине с интернетом; в репо — готовый файл ≥ 3 000 записей `{ name, norm, type, okrug?, raion? }`, включая «Дубнинская улица» и «Дубининская улица»)
- [X] T041 [US2] Extend `backend/app/seed/load.py` — `spec/mocks/scenarios.json` → `scenarios` (нужны эталоны для оценки), `spec/mocks/reports.json` → `reports` (`static=true`) + `group_reports`
- [X] T042 [P] [US2] Create models `backend/app/models/evaluation.py` — `evaluations` (attempt_id PK, assessor_version, time/correctness/grammar/semantic/total scores int 0–100, grammar_errors JSON[], errors JSON[], ai_comment, components JSON, generated_at, passed?), `teacher_overrides` (attempt_id, teacher_id, score 0–100, comment non-empty, at, previous_score), `calibration_samples`; `backend/app/models/report.py` — `reports`, `group_reports` (session_id unique), `report_feedback` (report_id PK) per data-model.md
- [X] T043 [US2] Create `backend/ml/assess/rules.py` — реестр `Rule(id, error_type, severity, source, text)` для режима B: 7 нарушений памятки (`v1 noPrimaryStatus` … `v7 noContact`, source «памятка стр. 26–31, нарушение №N»), тайминги (Q&A 30 с / 3 мин), решение/служба-получатель (ЕКП), адрес (Q&A «Дубнинская/Дубининская»), угадывание (решение команды); тест `backend/tests/unit/test_rules.py`: у каждого правила непустой `source`
- [X] T044 [US2] Create `backend/ml/assess/components/{timing,decision,statuses,comments,fields,grammar,address,multitask,report}.py` — каждая `run(ctx) -> ComponentResult { score 0..1, errors[{ruleId, type, severity, message, step, fixed}], warnings, available }`; `backend/ml/assess/engine.py` — `assess(attempt, scenario, cards, reference, weights) -> AssessmentResult` (веса по умолчанию: время 0,25; решение 0,2; статусы 0,15; комментарии 0,15; поля 0,1; грамотность 0,1; многозадачность 0,05; доклад 0,1 при наличии, нормировка), детерминированный `ai_comment` из шаблонов, начинающийся с «ИИ-оценка:»; `backend/ml/assess/adapter.py` — `to_evaluation(result) -> dict` по `contracts/evaluation.schema.json` (`timeScore=timing`, `correctnessScore=decision+statuses+fields+multitask`, `grammarScore=grammar+address`, `semanticScore=comments+report`), `assessor_version`
- [X] T045 [US2] Create `backend/app/ai_gateway.py` — интерфейс как у фронта (`evaluate_attempt`, `generate_scenario`, `check_grammar`, `group_insights`, `call_reply`) и `backend/app/services/evaluation_service.py` — `get_or_create_evaluation(attempt_id, viewer)`: готовая оценка (override приоритетен) → иначе `engine.assess` по `Scenario.etalon` + `IncidentCard.expected*` + `timeNorms`; нет эталона → 404 `evaluationPending`; при недоступной модели — детерминированные компоненты, семантические `available=false` (FR-043); сохраняет `evaluations`
- [X] T046 [US2] Create `backend/app/services/report_builder.py` — сборка `Report` по завершённым попыткам курсанта (`timeMetrics` два этапа против `timeNorms` с `deviationMs`, `grammarErrors`/`errors` с `cardId`, `score` среднее с учётом overrides, `charts.byStage/byErrorType/dynamics`, `aiComment`; без попыток — «Нет данных по попыткам…»), `GroupReport` (`groupInsights` из `ai_gateway.group_insights`, три графика), идемпотентность по `group_reports.session_id`, `generatedAt` не меняется; `static` отчёты не пересобираются; `backend/ml/insights/group_insights.py` — детерминированные инсайты «N % группы: <тип ошибки>»
- [X] T047 [US2] Create `backend/app/api/compat/attempts.py` (часть 2) — `GET /attempts/{id}/evaluation` (T045; student чужой → 403), `POST /attempts/{id}/evaluation` (`{ teacherId, score 0–100, comment }` → `teacher_overrides`, `Evaluation.teacherOverride`, аудит `evaluation.override` «было → стало» + ФИО, `calibration_samples`)
- [X] T048 [US2] Create `backend/app/api/compat/reports.py` — `GET /reports` (`sessionId`/`studentId`, хотя бы один → иначе 400; ленивая сборка для `finished/reported`; незавершённое → `reports: [], groupReport: null`; student — только свои, `groupReport: null`, чужой `studentId` → 403), `GET /reports/journal` (фильтры `teacherId/studentId/group/category/from/to` включительно; `buildSec = generatedAt − finishedAt`; student → 403), `POST /reports/feedback` (201, upsert; `reportId` статического или рантайм-отчёта; 404)
- [X] T049 [US2] Create `backend/ml/scripts/eval_assessor.py` — прогон `engine.assess` по `backend/data/labeled/attempts/`: согласие по типам ошибок, каппа Коэна, корреляция Пирсона/Спирмена; запись в `backend/var/metrics.json`; `backend/ml/scripts/calibrate.py` — ridge-подбор весов по разметке + `calibration_samples`
- [X] T050 [US2] Create contract + integration tests `backend/tests/contract/test_evaluation_reports.py` (строки 39–43 контракта) и `backend/tests/integration/test_session_to_report.py` — «мастер → start → attempt → statuses → progress complete → stop → control report → GET /reports → POST evaluation override → POST feedback»: балл отчёта пересчитан, аудит содержит `evaluation.override`, `generatedAt` стабилен при повторе

**Checkpoint**: `/arm/progress` показывает реальную оценку с бейджем «ИИ»; `/teacher/reports/[sessionId]` показывает отчёт, правка балла работает; `eval_assessor` ≥ 0,85 / 0,8

---

## Phase 5: User Story 5 — Преподаватель: занятие, мониторинг, аналитика группы (Priority: P2, волна A)

**Goal**: всё, что остаётся для экранов `/teacher`, `/teacher/session`, `/teacher/reports` сверх T034/T048: экспорт CSV/PDF, состояние контроля, пользователи для мастера

**Independent Test**: `scripts/e2e-teacher.sh` шаги «мастер занятия → мониторинг → отчёт → правка оценки» проходят; экспорт CSV содержит по строке на попытку

### Implementation for User Story 5

- [X] T051 [P] [US5] Create `backend/app/services/report_export.py` — CSV (`csv` stdlib, UTF-8 BOM; колонки: обучаемый, АРМ, режим, формат, сценарий/карточка, времена по этапам, отклонения, ошибки по типам, балл, сдал/не сдал) и PDF (reportlab, шрифт DejaVu из `backend/data/fonts/`, таблица + графики как таблицы) и endpoints `GET /api/v1/reports/{id}/export.csv|.pdf` в `backend/app/api/v1/reports_export.py` (фронт волны A экспортирует на клиенте — это дополнение, не ломает контракт)
- [X] T052 [P] [US5] Extend `backend/app/seed/load.py` — `PROFILE_MAPPING_SEED` перенести из `src/shared/config` в `backend/app/seed/profile_mapping_seed.py` и загружать в `profile_mapping`; переиспользована существующая model `backend/app/models/teacher.py::ProfileMappingRow` (id, profile, group_name?, service_ids JSON[], incident_groups JSON[], updated_by?, updated_at), см. решение US5 в research.md
- [X] T053 [US5] Create `backend/app/api/compat/profile_mapping.py` — `GET /profile-mapping` (`studentCount` по `users.service`), `PUT /profile-mapping` (`{ rows: [{ id, incidentGroups }], savedBy }`, 404 на неизвестный id, аудит `profileMapping.save`)
- [X] T054 [US5] Wire `session_engine.build_card_flow` profile/category filters to `profile_mapping` (FR-031: в поток режима B попадают только карточки, где у службы профиля есть реакция в классификаторе — `classifier_entries.notifications[].service ↔ reference.services[].classifierName`) and add unit test `backend/tests/unit/test_card_flow_profiles.py`
- [X] T055 [US5] Create contract tests `backend/tests/contract/test_teacher.py` — строки 28–29, 36–38 контракта; сценарий «занятие с планом (темп, порядок, категории) → start → `cardFlow` соответствует плану → control pause/resume/issue»

**Checkpoint Phase 5**: `uv run pytest -q` — 64 passed; `uv run ruff check .` — PASS. Шаги мастера/мониторинга/контроля/отчётов проверены через ASGI-контрактные и интеграционные тесты; PDF отрисован и проверен на 5 страницах и пустом отчёте; wheel включает шрифт и лицензию. Полный `scripts/e2e-teacher.sh` остаётся в T074: зависит от фаз 6/8; ограничение его категории по умолчанию зафиксировано в research.md.

---

## Phase 6: User Story 6 — Сценарии: создание, генерация, валидация, утверждение (Priority: P2, волна A)

**Goal**: банк сценариев с workflow валидации, генерация через реальный `AiGateway` (шаблонный путь + Ollama), проверка грамматики, материалы, учебные карточки

**Independent Test**: `POST /scenarios/generate {category:"запах газа"}` возвращает 2–3 сценария `pending/generated` с `validation_report`, повтор не дублирует; `POST /scenarios/{id}/validate {action:"approve"}` → `approved`; `POST /grammar-check` находит опечатку

### Tests for User Story 6

- [X] T056 [P] [US6] Unit tests `backend/tests/unit/test_scenario_generator.py` (шаблонный генератор: категория соблюдена, адрес из справочника, дедупликация по `title`, ловушки по параметрам) и `backend/tests/unit/test_validator.py` (6 критериев на 10 корректных + 10 дефектных билетах из `backend/data/labeled/tickets/`)

### Implementation for User Story 6

- [X] T057 [P] [US6] Create models `backend/app/models/scenario.py` — `scenarios` (все поля `Scenario` + `mode?`, `updated_by`, `updated_at`, `deleted`, `validation_report JSON?`, `history JSON[]`; `difficulty` 1–5 → `level` beginner 1–2 / advanced 3–5), `training_materials` (id mat-NNN, name, size_bytes?, format DOCX/PDF/MP3 по расширению, uploaded_by, uploaded_at)
- [X] T058 [P] [US6] Create schemas `backend/app/schemas/scenarios.py` — `Scenario`, `Etalon`, `ScenarioCreateRequest`, `ScenarioUpdateRequest` (`timeNorms.* > 0`, `maxGrammarErrors` целое ≥ 0, `difficulty` 1–5), `ScenarioValidateRequest { action: submit|approve|approvePartial|reject, reviewedBy, comment?, fields? }`, `ScenarioGenerateRequest { category, requestedBy }`, `TrainingMaterial(+UploadRequest)`, `ProfileMappingRow(+SaveRequest)`, `GrammarCheckRequest`, `AiResponse[T] { origin: "ai", provider: "service", data }`
- [X] T059 [P] [US6] Create `backend/ml/classify/ekp_group_classifier.py` — эмбеддинги rubert-tiny2 + LogisticRegression на `reference.incidentGroups`; обучение `backend/ml/scripts/train_classifier.py` (96 карточек + синтетика `backend/data/labeled/synthetic_groups.json`), артефакт `backend/models/ekp_group_lr.joblib`; `predict(text) -> (group, confidence)`; `backend/ml/scripts/eval_classifier.py` (accuracy на 96 задачах, confusion) → `metrics.json`
- [X] T060 [US6] Create `backend/ml/generate/validator.py` — `validate(ticket, existing) -> ValidationReport { checks: [category(confidence ≥ 0,6 иначе needsReview), address(справочник), requiredFields, duplicate(e5 cos ≥ 0,92), grammar, consistency(пострадавшие/03/регион)], passed, needsReview }` и `backend/ml/generate/scenario_generator.py` — `generate(category, cards, addresses, count=3, traps=None)`: шаблонные вариации (карточки той же группы + новый адрес + ловушка), при `OLLAMA_URL` и health-ok — LLM-путь с JSON-схемой и ≤ 2 повторами; выход `Scenario` без id (`source: generated`, `validation.status: pending`, `etalon` из классификатора)
- [X] T061 [US6] Create `backend/app/services/scenario_service.py` — CRUD + машина валидации (`draft → pending → approved|rejected`, `submit` из `rejected` разрешён, иначе 409), `PATCH` частичное с пересчётом `level` и `history`, `DELETE` запрет для `template` и используемых в `sessions.scenario_ids` (409 `conflict`), генерация через `ai_gateway.generate_scenario` с дедупликацией по `title` и прогоном валидатора, аудит `scenario.update/delete/generate/submit/approve/approvePartial/reject`
- [X] T062 [US6] Create `backend/app/api/compat/scenarios.py` (`GET/POST /scenarios`, `GET/PATCH/DELETE /scenarios/{id}`, `POST /scenarios/{id}/validate`, `POST /scenarios/generate` 201, `GET /training-cards`), `backend/app/api/compat/materials.py` (`GET/POST /materials`, аудит `material.upload`), `backend/app/api/compat/grammar.py` (`POST /grammar-check` → `AiResponse<GrammarError[]>` через `ai_gateway.check_grammar`, для адресных `field` — плюс `address.lookalike`)
- [X] T063 [US6] Create contract tests `backend/tests/contract/test_scenarios.py` — строки 18–30 контракта; 409 на удаление шаблона; workflow валидации; генерация идемпотентна

**Checkpoint Phase 6**: `uv run pytest -q` — 87 passed; `uv run ruff check .` — PASS. T057 закрыт существующими моделями `Scenario`/`TrainingMaterial` (схема БД не менялась). Классификатор: `train_classifier` → `models/ekp_group_lr.joblib` (git-ignored, собирается локально), `eval_classifier` — accuracy 1,0 на 96 (SC-006, в обучении) и 0,57 на 5-блочной кросс-валидации; без артефакта — режим прототипов. Валидатор на `data/labeled/tickets/` (20+20): 20/20 и 20/20. Генерация проверена на живом сервере (`/api/mock/scenarios/generate`); полный `scripts/e2e-teacher.sh` остаётся в T074 (на Windows curl из Git Bash портит кириллицу в argv — прогон только через Next или Linux).

---

## Phase 7: User Story 10 — Голосовые собеседники, текстовый контур (Priority: P4, волна A)

**Goal**: софтфон фронта B→C работает: вызовы пишутся в попытку, ИИ-абонент отвечает репликами

**Independent Test**: `POST /cards/c-063/calls` → 201 с `attemptId` попытки курсанта; `POST /calls/reply {toNumber:"101", turn:"answer"}` → `AiResponse<CallReply { text:"Слушаю", voice, speakerTitle }>`; неизвестный номер → 404 «Абонент не найден»

### Implementation for User Story 10

- [X] T064 [P] [US10] Create `backend/ml/insights/call_responder.py` — конечный автомат ответчика: `answer` → «Слушаю» (по `reference.internalNumbers[].title`), `reply` → «Понял, информация принята» (+ вариации по службе), `voice` male/female детерминированно по номеру, `speakerTitle`; при `text` доклада — сверка с чек-листом (номер карточки, адрес, тип, пострадавшие, решение) → сохраняется в попытку для компонента `report`
- [X] T065 [US10] Create `backend/app/api/compat/calls.py` — `POST /cards/{id}/calls` (`{ studentId, toNumber, startedAt, endedAt, transcript }` → `phone_calls` попытки курсанта по карточке, идущее занятие приоритетно, 404 карточка/номер/нет попытки, 201), `POST /calls/reply` (`{ toNumber, turn, text? }` → T064; 400 мусор, 404 номер)
- [X] T066 [US10] Create contract tests `backend/tests/contract/test_calls.py` — строки 16–17 контракта

**Checkpoint Phase 7**: `uv run pytest -q` — 97 passed; `uv run ruff check .` — PASS. Ответчик — фолбэк за `AiGateway.call_reply` (заглушка команды ИИ остаётся); сверка доклада хранится в `attempts.calls[i].report` и питает компонент `report` оценщика (`dds-1.1.0`); unit-тесты `tests/unit/test_call_responder.py`.

---

## Phase 8: User Story 11 — Администрирование, безопасность, мониторинг (Priority: P4, волна A)

**Goal**: экраны `/admin/users` и `/admin/system` на бэкенде: пользователи, аудит, сервисы, настройки с нормативами, журналы, мониторинг, статистика, бэкап

**Independent Test**: `scripts/e2e-admin.sh` проходит; `PATCH /admin/system/settings {backup:{periodHours:48}}` → 422 с перечнем полей; `POST /admin/users` с занятым логином → 409

### Implementation for User Story 11

- [X] T067 [P] [US11] Create models `backend/app/models/system.py` — `system_services` (id, name, state running/stopped/degraded, uptime_sec, critical, description, started_at?), `system_settings` (id=1, settings JSON с секциями telephony/database/backup/logging/security/performance/autoRecovery), `system_logs` (id log-NNN, at, level INFO/WARN/ERROR, source, message), `system_static` (key: monitoring|usageStats, value JSON) and extend `backend/app/seed/load.py` для `mocks/admin/{system-services,system-settings,system-logs,monitoring,usage-stats}.json`
- [X] T068 [P] [US11] Create schemas `backend/app/schemas/admin.py` — `PublicUser`, `AdminUserCreateRequest` (логин латиница без пробелов, `armNumber` целое > 0, роль ∈ 3), `AdminUserUpdateRequest`, `AdminUserActionRequest { adminId }`, `AdminUserPasswordResetResponse { user, temporaryPassword }`, `AuditLogEntry(+Query)`, `SystemService`, `SystemServicesResponse { services, integrity }`, `SystemSettings(+Patch: database не принимается)`, `SystemLogEntry`, `SystemMonitoring`, `UsageStats` — 1:1 с `src/shared/api/types/{admin,user}.ts`
- [X] T069 [US11] Create `backend/app/api/compat/admin_users.py` — `GET /admin/users` (`role/state/group/q`), `POST` (201; 409 логин занят; argon2; аудит `user.create`), `PATCH /admin/users/{id}` (ролевые поля приводятся к новой роли; аудит `user.update`/`user.roleChange`), `POST …/block|unblock|toggle-active` (сам себя → 409; аудит), `POST …/reset-password` (временный пароль один раз; аудит `user.passwordReset`); доступ — viewer admin или `adminId` в теле (403 иначе)
- [X] T070 [US11] Create `backend/app/api/compat/admin_system.py` — `GET /admin/services`, `GET /admin/settings`, `GET /admin/audit` (фильтры `type` из 7 типов, `operator` ФИО/логин/АРМ, `card`, `from/to`, `q`, пагинация, новые первыми), `GET /admin/system/services` (+ `integrity`: БД доступна, модели в `MODELS_DIR`, каталоги `var/`), `POST /admin/system/services/{id}/action` (start/stop/restart; 409 критичный при идущем занятии; аудит `service.action`; `system_logs`), `GET/PATCH /admin/system/settings` (422 при `backup.periodHours > 24`, `logging.retentionMonths < 6`, `performance.sessionLimit < 20`; аудит `settings.update`; `backup.run` → `backend/app/services/backup.py`: `pg_dump` при PostgreSQL / копия файла при SQLite в `backend/var/backups/`, обновляет `backup.lastAt`), `GET /admin/system/logs` (`level`), `GET /admin/system/monitoring`, `GET /admin/system/usage-stats` (`period` week|month, мусор → 400)
- [X] T071 [US11] Create contract tests `backend/tests/contract/test_admin.py` — строки 44–60 контракта; матрица доступа роль × ресурс (SC-013): student/teacher на `/admin/*` → 403

**Checkpoint Phase 8**: `uv run pytest -q` — 117 passed; `uv run ruff check .` — PASS. `system_settings` осталась в `models/reference.py` (её читает политика входа), новые `system_services/system_logs/system_static` — в `models/system.py`; бэкап реальный (`services/backup.py`: sqlite backup API / `pg_dump`), `lastAt` — как передан; `integrity.ok` не зависит от наличия моделей (FR-043). `scripts/e2e-admin.sh` — в гейте T074.

---

## Phase 9: Волна A — интеграция с фронтом и гейт (cross-cutting)

**Purpose**: подключить фронт к бэкенду и пройти его сквозные проверки — критерий приёмки волны A

- [X] T072 Add rewrite to `next.config.ts` — `async rewrites() { return { beforeFiles: process.env.BACKEND_URL ? [{ source: "/api/mock/:path*", destination: `${process.env.BACKEND_URL}/api/mock/:path*` }] : [] } }`; документировать в root `README.md` («Реальный бэкенд: `BACKEND_URL=http://localhost:8000 npm start`»); `npm run check` остаётся зелёным
- [X] T073 Create `backend/scripts/extract_ts_fields.py` — извлечение обязательных полей из `src/shared/api/types/*.ts` → `backend/tests/contract/expected_fields.json`; параметризованный тест `backend/tests/contract/test_response_shapes.py` сверяет ответы всех GET-эндпоинтов таблицы с обязательными полями
- [X] T074 Create `backend/scripts/run_frontend_e2e.sh` (и `.ps1`) — поднять бэкенд с `--reset` сидом, `npm run build`, `BACKEND_URL=http://localhost:8000 npx next start -p 3130`, прогнать `scripts/e2e-student.sh`, `scripts/e2e-teacher.sh`, `scripts/e2e-admin.sh`; исправить расхождения в бэкенде до PASS всех трёх (правки фронта запрещены, кроме T072)
- [X] T075 Add `backend/app/seed/load.py --reset` (truncate + reload) и `backend/tests/integration/test_demo_path.py` — демо-путь `docs/demo-script.md` через HTTP: admin создаёт группу/пользователя → teacher генерирует и утверждает сценарий → занятие на 2 обучаемых → попытки → отчёт → правка → обратная связь → `/arm/progress` данные
- [X] T076 Run quickstart §1–§6 на чистом окружении (SQLite) и зафиксировать результат в `backend/README.md` («Проверено 2026-MM-DD: e2e PASS, метрики …»)

**Checkpoint (гейт волны A)**: три `scripts/e2e-*.sh` — PASS; `pytest` зелёный; фронт без правок кроме `next.config.ts`

**Checkpoint Phase 9 (2026-09-21)**: `uv run pytest -q` — 146 passed; `uv run ruff check .` — PASS. `backend/scripts/run_frontend_e2e.sh` (Git Bash, Windows): e2e-student 40/40, e2e-teacher 96/96, e2e-admin 140/140, EXIT=0; фронт без правок кроме T072. Правки бэкенда ради гейта (research.md, «Решения реализации гейта волны A»): мягкий фолбэк профиля в `filter_cards_for_student` с WARN в `system_logs`, сгенерированный сценарий = новая карточка + исходная (`cardIds` из двух), `/admin/audit` читает и преподаватель, фоновый прогрев ML при старте (`ML_WARMUP`). T076 (2026-09-22): quickstart §1–§6 пройден на свежем клоне — сиды, curl-проверки, 146 passed, e2e 40/96/140, метрики (классификатор 1,0; оценщик согласие 1,0, Pearson 0,93, Spearman 0,76; валидатор 20/20 + 20/20) — таблица в `backend/README.md`; quickstart приведён к факту (Alembic → T109, `eval_validator`/`metrics/ml` → волна B, `prepare_models` качает только rubert-tiny2).

---

## Phase 10: User Story 3 — Режим специалиста-112 по аудиозаписи (Priority: P1, волна B)

**Goal**: билет → аудиозапись обращения (TTS) → вызов → карточка с нуля через `/api/v1/operator112/*` → оценка режима A с `fieldDiff`

**Independent Test**: задание `operator112` из 2 билетов: `POST /operator112/attempts` → `answer` → события → `notification-list` по опросной карте → `submit` → `evaluation` с `fieldDiff`; повторное прослушивание считается; аудио недоступно → расшифровка с пометкой

### Tests for User Story 3

- [X] T077 [P] [US3] Unit tests `backend/tests/unit/test_assess_operator112.py` — 5 карточек из spec US2 (эталонная; неверный тип; потерян «дом газифицирован»; опечатка улицы; не выставлен «пострадавшие») → ожидаемые `wrongFinalType/lostFact/addressLookalike/missingSign`
- [X] T078 [P] [US3] Create labeled dataset `backend/data/labeled/operator112/*.json` (≥ 30 карточек с разметкой типов ошибок) и расширить `backend/ml/scripts/eval_assessor.py` режимом A (SC-004)

### Implementation for User Story 3

- [X] T079 [P] [US3] Create models `backend/app/models/ticket_audio.py` (`ticket_audio`: card_id PK, path, transcript, voice, duration_ms, generated_at, status pending/ready/failed) and `backend/app/models/street.py` (`streets`: id, name_norm idx, name, type, okrug?, raion?; сид из `backend/data/streets/moscow_streets.json` в `seed/load.py`)
- [X] T080 [P] [US3] Create `backend/ml/speech/tts.py` — Silero v4 ru (torch CPU, lazy, голоса `aidar/eugene` male, `baya/kseniya` female; `auto` по ФИО заявителя), `synthesize(text, voice) -> wav path` в `backend/var/audio/{card_id}.wav`; `backend/ml/generate/call_script.py` — разговорная реплика заявителя из билета (фабула + ФИО + телефон + адрес + уточнения, шаблоны по группе), сохраняется как `transcript`
- [X] T081 [P] [US3] Create `backend/ml/assess/operator112.py` — компоненты режима A (FR-036): `answer_timing`, `final_type` (опросная карта ↔ `IncidentCard.expectedTags`/классификатор → список оповещения, перечень пропущенных служб), `address` (справочник, опечатки, lookalike), `description_facts` (обязательные факты билета через `semantic.covers_key_phrases`), `signs_flags`, `applicant_phone`, `grammar`; правила в `rules.py` с источниками (ЕКП, памятка стр. 15, Q&A, решение команды); адаптер в `Evaluation` + `fieldDiff`
- [X] T082 [US3] Create schemas `backend/app/schemas/v1/operator112.py` (`Ticket`, `TicketAudio`, `OperatorAttempt { id, cardId, aon, incidentNumber, createdAt, answeredAt?, state }`, `OperatorEvent { type: fieldChanged|signSelected|serviceAdded|replay|hintShown, payload }`, `NotificationListResponse`, `CardDraft`, `OperatorEvaluation = Evaluation + fieldDiff[]`, `Street`) per `contracts/v1-endpoints.md`
- [X] T083 [US3] Create `backend/app/services/operator112_service.py` — создание попытки (mode `operator112`, `aon` из билета, номер происшествия), `answer` (норматив 30 с → событие «вызов не принят вовремя»), события с «было/стало», `notification_list(signs)` через `classifier_entries` (auto) + ручные (`manual`, удалять нельзя), `submit(draft)` → `card_snapshot`, новая `incident_cards` (`created_by_student_id`, `mode_origin=operator112`, `source_attempt_id`), запуск `ml.assess.operator112`; подсказки при простое ≥ порога (список шагов по этапам)
- [X] T084 [US3] Create `backend/app/api/v1/tickets.py` (`GET /tickets`, `POST /tickets`, `POST/GET /tickets/{id}/audio` 202 + фоновая задача TTS через `BackgroundTasks`, `GET /tickets/{id}/audio/file` с проверкой доступа и счётчиком `replays` в экзамене) и `backend/app/api/v1/operator112.py` (`POST /operator112/attempts`, `…/answer`, `…/events`, `GET …/notification-list`, `POST …/submit`, `GET …/evaluation`, `GET /streets?q=&limit=`)
- [X] T085 [US3] Hook TTS generation into scenario/ticket approval (`scenario_service` approve → задача `tts` для всех `card_ids` без готовой записи) и add `GET /api/v1/tickets/{id}/audio` fallback: при `failed` — `transcript` с пометкой `emergency: true`
- [X] T086 [US3] Create contract tests `backend/tests/contract/test_v1_operator112.py` — таблицы «Билеты и аудио», «Режим специалиста-112» из `contracts/v1-endpoints.md`

**Checkpoint**: полный цикл режима A через API; `eval_assessor --mode operator112` ≥ 0,85

**Checkpoint Phase 10 (2026-09-22)**: `uv run pytest -q` — 167 passed; `uv run ruff check .` — PASS. Полный цикл режима A через `/api/v1/operator112/*` проверен контрактными тестами (`tests/contract/test_v1_operator112.py`, TTS выключен → аварийный режим с расшифровкой) и на живом сервере с реальным синтезом Silero (28 с речи по билету c-010, `GET /tickets/c-010/audio/file` → WAV). `eval_assessor --mode operator112` на 58 размеченных карточках: согласие 1,0, κ 1,0, Pearson 0,97, Spearman 0,83, MAE 11 (`var/metrics.json`, раздел `assessorOperator112`). Решения (research.md, «Решения реализации US3»): модели `assignments`/`assignment_attempts` без API (сид `asg-001` тренировка, `asg-002` экзамен); `prepare_models --only tts`; `AiGateway.call_script` → шаблон; подсказки — `hints` в ответе попытки, таймер на фронте.

---

## Phase 11: User Story 6 (волна B) — Валидация билетов и создание вручную через `/api/v1`

**Goal**: единый банк билетов с отчётом валидации и ручным созданием

- [X] T087 [US6] Create `backend/app/api/v1/validation.py` — `POST /tickets/{id}/validate` → `ValidationReport` (T060), сохранение в `scenarios.validation_report`/`incident_cards`; `backend/ml/scripts/eval_validator.py` (SC-005: 20 корректных + 20 дефектных из `backend/data/labeled/tickets/`) → `metrics.json`
- [X] T088 [US6] Extend `POST /api/v1/tickets` (T084) — ручное создание: эталон по `group` через классификатор (`expectedServices`, `expectedTags`), грамматика, `difficulty`; аудит `ticket.create`

---

## Phase 12: User Story 5 (волна B) — Задания и экзамен (Priority: P2)

**Goal**: назначение билетов (выбранные/случайные) в режиме и формате; экзамен без подсказок и повторов с порогом «сдал/не сдал»

**Independent Test**: экзамен `dds` из 5 случайных билетов категории «Водоснабжение» порог 70 для 2 обучаемых → 10 попыток, `passed` по каждому, повторный `start` по билету → 409, истечение `timeLimitSec` завершает попытку принудительно

- [X] T089 [P] [US5] Create models `backend/app/models/assignment.py` — `assignments` (teacher_id, student_ids JSON, training_mode dds/operator112/chain, format training/exam, card_ids JSON? | random_rule JSON?, params JSON {norms, hints, passThreshold?, timeLimitSec?}, due_at?, state assigned/in_progress/completed), `assignment_attempts` (assignment_id, student_id, card_id, attempt_id FK, replays int, hints_shown int, state, passed?)
- [X] T090 [P] [US5] Create schemas `backend/app/schemas/v1/assignments.py` — `AssignmentCreateRequest`, `Assignment`, `AssignmentProgress`, `StartResponse` per `contracts/v1-endpoints.md`
- [X] T091 [US5] Create `backend/app/services/assignment_service.py` — создание (случайный набор фиксируется при создании для экзамена; фильтр по профилю службы для `dds`), `start` (следующий билет в нужном режиме: `dds` → занятие практики + `attempts`, `operator112` → T083; экзамен: одна попытка на билет → 409, `replays` запрещены, подсказки выключены, таймер `timeLimitSec` — принудительное завершение при следующем обращении), `finish`, расчёт `passed` по `passThreshold` и запись `evaluations.passed`; аналитика экзаменов отдельно от тренировок
- [X] T092 [US5] Create `backend/app/api/v1/assignments.py` — `POST/GET /assignments`, `GET /assignments/{id}` (+ progress), `POST /assignments/{id}/start`, `POST /assignments/{id}/finish`; student видит только свои
- [X] T093 [US5] Create tests `backend/tests/contract/test_v1_assignments.py` и `backend/tests/integration/test_exam_flow.py`

---

## Phase 13: User Story 4 — Лобби обучаемого (Priority: P2, волна B)

**Goal**: `/me/*`, справочник по ситуациям, история и аналитика — данные для лобби

**Independent Test**: у обучаемого с 3 оценёнными попытками `GET /me/history` → 3 записи, `GET /me/analytics` → динамика и топ-3 ошибок, `GET /kb/articles?group=запах газа` → статья с 5 разделами; чужие данные → 403

- [X] T094 [P] [US4] Create model `backend/app/models/kb.py` (`kb_articles`: id, group, title, sections JSON {signs, notification, clarify, ddsDecision, typicalErrors}, updated_by?, updated_at) and generator `backend/ml/scripts/build_kb.py` — статьи из `classifier_entries` (признаки, список оповещения по группе), памятки (`specs/kb/04-domain/*`) и билетов (типичные ситуации) → `backend/data/kb/*.json`; сид в `seed/load.py`
- [X] T095 [P] [US4] Create `backend/app/services/analytics.py` — агрегаты по попыткам (FR-045): по обучаемому (`byMode`, `reactionMs`, `topErrors`, `dynamics`), по группе/категории/режиму/формату; используется лобби и преподавателем
- [X] T096 [US4] Create `backend/app/api/v1/lobby.py` — `GET /me`, `GET /me/history` (`PageResponse<HistoryItem>`, фильтры `mode/format`), `GET /me/analytics`, `GET /kb/articles`, `GET/PATCH /kb/articles/{id}` (PATCH — teacher) и schemas `backend/app/schemas/v1/lobby.py`
- [X] T097 [US4] Create contract tests `backend/tests/contract/test_v1_lobby.py` (изоляция: student → только свои; аноним → 401)

---

## Phase 14: User Story 7 — Рекомендательная система и адаптивная сложность (Priority: P3, волна B)

**Goal**: персональные рекомендации с причинами, рейтинг по режимам, адаптивный подбор, профиль обучаемого и групповые инсайты для преподавателя

**Independent Test**: после 6 попыток с ошибками в «Запах газа» `GET /me/recommendations` содержит билеты этой категории и статью с `reason { errorType, count }`; 3 успешных подряд → следующий адаптивный билет сложнее; `eval_recommender` — 100 % попадание худшей категории в топ-3

- [X] T098 [P] [US7] Create models `backend/app/models/recommendation.py` — `recommendations` (student_id, kind card/category/article/mode, target_id, reason JSON {errorType, count, ruleId}, created_at, accepted_at?), `student_ratings` (student_id + mode PK, rating, history JSON, weak_groups JSON)
- [X] T099 [P] [US7] Create `backend/ml/insights/rating.py` — Эло-подобное обновление (R10: `E = 1/(1+10^((D−R)/400))`, `S = score/100 × norm_ok`, `R += K(S−E)`; сложность билета `D` из `difficulty`, ловушек, числа служб) and `backend/ml/insights/recommender.py` — профиль ошибок (тип × категория × режим, экспоненциальное затухание), ранжирование билетов/статей, «сильнее в A/B», понижение выданных/принятых; `backend/ml/scripts/eval_recommender.py` (10 синтетических историй → `metrics.json`)
- [X] T100 [US7] Wire adaptive selection into `backend/app/services/session_engine.py` (`build_card_flow`: план `adaptive: true` → следующий билет `D ≈ R + δ`, повышенная вероятность слабых категорий) и `backend/app/services/assignment_service.py` (`start`); обновление рейтинга после каждой оценки в `backend/app/services/evaluation_service.py`
- [X] T101 [US7] Create `backend/app/api/v1/recommendations.py` — `GET /me/recommendations`, `POST /me/recommendations/{id}/accept`, `GET /teacher/students/{id}/profile`, `GET /teacher/groups/{id}/insights` (`{ insights: [{share, errorType, text}], suggestedGroup }`) и tests `backend/tests/contract/test_v1_recommendations.py`, `backend/tests/unit/test_rating.py`

---

## Phase 15: User Story 8 — Цепочка A → B и ловушки (Priority: P3, волна B)

**Goal**: карточка оператора попадает в очередь диспетчера профильной службы; эталон B по исходному билету; ловушки от преподавателя/генератора

**Independent Test**: обучаемый 1 (`operator112`) отправляет карточку «запах газа» с намеренно неверным типом → обучаемый 2 (Мосгаз, `dds`) получает её ≤ 5 с; эталон ожидает «Не принята, передано в Мосводоканал»; в отчёте попытки связаны; без адресата — «нет адресата» у преподавателя

- [ ] T102 [US8] Create `backend/app/services/chain_service.py` — при `submit` в задании `chain`/занятии с `cardSource=studentCreated|mixed`: выбор обучаемого режима B, чья `users.service` есть в списке оповещения карточки → `card_flow_items` (`issued_by=chain`, признак «сформирована обучаемым» через `incident_cards.created_by_student_id`); нет адресата → пометка `noRecipient` в задании; эталон B из исходного билета (`source_attempt_id` → `incident_cards` оригинал): верная классификация → `accepted`, ошибочная → `notAccepted` + «не профильное, передано в <служба по билету>» (FR-028)
- [ ] T103 [US8] Extend `POST /sessions/{id}/control {action:"issue"}` and `scenario_generator` traps — ловушки `wrongType/addressTypo/outOfZone/duplicate` (FR-029): генерация карточки-ловушки из исходной, эталон ожидает распознавание (правила `trapNotDetected` в `rules.py` с источником); `cardSource=studentCreated|mixed` в `build_card_flow` берёт пул `incident_cards.created_by_student_id`
- [ ] T104 [US8] Create tests `backend/tests/integration/test_chain.py` (сценарий Independent Test) и `backend/tests/unit/test_traps.py`

---

## Phase 16: User Story 9 + US10 (волна B) — Сообщения о ходе работ и аудио-доклад (Priority: P3–P4)

**Goal**: расписание сообщений о ходе работ с проверкой своевременности статусов; распознавание голосового доклада

- [ ] T105 [P] [US9] Create model `backend/app/models/work_message.py` (`card_work_messages`: attempt_id, kind departed/arrived/started/done, at, expected_status) and `backend/app/services/work_messages.py` — расписание по категории билета (интервалы из `params`), выдача при `accepted`; компонент `statuses` оценщика учитывает «статус после информации» (FR-050, нарушение №6, «статус без основания»)
- [ ] T106 [US9] Create `backend/app/api/v1/work_messages.py` — `GET /attempts/{id}/work-messages?since=` и tests `backend/tests/unit/test_work_messages.py`
- [ ] T107 [P] [US10] Create `backend/ml/speech/stt.py` — Vosk small-ru (lazy, `MODELS_DIR`, доменная грамматика: улицы, службы, числа), `transcribe(wav) -> text`; `POST /api/v1/attempts/{id}/report-audio` (multipart wav → транскрипт → чек-лист T064 → `phone_calls` + компонент `report`), `GET /cards/{id}/recordings` волны A начинает отдавать записи докладов
- [ ] T108 [US10] Create tests `backend/tests/unit/test_report_checklist.py` (20 тестовых транскриптов → ≥ 80 % пунктов, SC-012) и `backend/data/labeled/reports/*.json`

---

## Phase 17: Polish & Cross-Cutting Concerns

- [ ] T109 [P] Create `backend/alembic/env.py` + initial migration `backend/alembic/versions/0001_initial.py` (PostgreSQL, JSONB) и проверить `alembic upgrade head` + сид на PostgreSQL 14 (docker-compose или локальная установка)
- [ ] T110 [P] Create `backend/ml/scripts/prepare_models.py` — скачивание rubert-tiny2, multilingual-e5-small, symspell-словаря, (флаги `--tts`, `--stt`, `--llm`) в `backend/models/`, проверка контрольных сумм; `GET /api/v1/health` показывает загруженные модели; `GET /api/v1/metrics/ml` отдаёт `backend/var/metrics.json`
- [ ] T111 [P] Write `backend/docs/architecture.md` (функциональная и компонентная архитектура, матрица доступа роль × ресурс, путь внедрения TLS/SIP/бэкапов по расписанию — принцип IV) и `backend/docs/ml-methods.md` (методы обработки данных, метрики, калибровка — требование платформы хакатона)
- [ ] T112 [P] Offline acceptance per quickstart §8: запуск без сети, захват исходящих соединений, шаблонная генерация без Ollama; результат в `backend/docs/offline-check.md`
- [ ] T113 Performance check: оценка попытки ≤ 5 с, отчёт 20 × 5 ≤ 30 с, feed ≤ 200 мс при 20 параллельных клиентах (скрипт `backend/scripts/perf_smoke.py` на httpx), фиксация в `backend/README.md`
- [ ] T114 Security hardening: rate-limit `/auth/login`, `JWT_SECRET` обязателен вне dev, заголовки безопасности, тест матрицы доступа `backend/tests/contract/test_access_matrix.py` (SC-013: 0 утечек между обучаемыми)
- [ ] T115 Update `specs/002-two-mode-simulator/quickstart.md` и `backend/README.md` по фактическим командам; синхронизировать `docs/mock-api.md` пометкой «реализовано бэкендом, см. backend/README.md» (без изменения контракта)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** — блокирует всё
- **US1 (3)** после 2; **US2 (4)** после 3 (нужны попытки и занятия); **US5-A (5)** после 3–4; **US6-A (6)** после 2 (модели сценариев нужны T041 — выполнить T057 до T041 или загрузить сценарии в T023); **US10-A (7)** после 3; **US11-A (8)** после 2; **Гейт (9)** после 3–8
- **Волна B**: **US3 (10)** после 9 (использует оценщик T044/T045, `incident_cards`); **US6-B (11)** после 6 и 10; **US5-B (12)** после 10; **US4 (13)** после 4 и 12; **US7 (14)** после 13; **US8 (15)** после 10 и 12; **US9/US10-B (16)** после 4; **Polish (17)** — в конце
- Примечание к порядку внутри волны A: T057 (модель `scenarios`) нужна раньше T041 — при последовательном выполнении делать T057 сразу после T025

### Parallel Opportunities

- Phase 1: T003–T006 параллельно
- Phase 2: T008, T009, T010, T012 параллельно; T017, T018 параллельно после T011–T015
- Phase 3: T021, T022 (тесты), T024–T027 (модели и схемы) параллельно
- Phase 4: T036–T040, T042 параллельно; T043 → T044 → T045 последовательно
- Phase 6: T056–T059 параллельно
- Phase 8: T067, T068 параллельно
- Волна B: T077–T081, T089–T090, T094–T095, T098–T099, T105/T107 параллельно внутри фаз; фазы 13–16 могут идти параллельно разными людьми после 10–12
- Polish: T109–T112 параллельно

---

## Parallel Example: User Story 1

```bash
# Тесты и модели US1 вместе:
Task: "Unit tests dds status machine in backend/tests/unit/test_dds_status_machine.py"
Task: "Unit tests cards search / session feed in backend/tests/unit/test_cards_search.py, test_session_feed.py"
Task: "Models card.py in backend/app/models/card.py"
Task: "Models session.py in backend/app/models/session.py"
Task: "Schemas cards.py in backend/app/schemas/cards.py"
Task: "Schemas sessions.py in backend/app/schemas/sessions.py"
# Затем последовательно: T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035
```

---

## Implementation Strategy

### MVP First (Phases 1–3)

1. Setup + Foundational → `/api/mock/reference`, `/classifier`, `/auth/login` на реальной БД
2. US1 → обучаемый работает с карточками через фронт с `BACKEND_URL`, преподаватель видит ленту
3. **STOP and VALIDATE**: `scripts/e2e-student.sh` до шага оценки

### Incremental Delivery (волна A)

4. US2 → реальная оценка и отчёты → `/arm/progress`, `/teacher/reports`
5. US5-A, US6-A, US10-A, US11-A → полные `scripts/e2e-teacher.sh`, `e2e-admin.sh`
6. Гейт (Phase 9): три e2e PASS, `pytest` зелёный — демо на реальном бэкенде готово

### Волна B

7. US3 (режим 112 по аудио) → US6-B/US5-B (валидация, экзамен) → US4 (лобби) → US7 (рекомендации) → US8 (цепочка) → US9/US10-B; фронтендеры подключают экраны по `contracts/v1-endpoints.md` и OpenAPI `/api/docs`

### Parallel Team Strategy

- Разработчик A: US1 → US2 → гейт; Разработчик B (после Phase 2): US11-A, US6-A, US10-A; ML: T036–T040, T043–T044, T059–T060 параллельно с бэкендом; волна B — по фазам разными людьми

---

## Notes

- Контракт волны A менять нельзя: любое расхождение с `docs/mock-api.md` чинится в бэкенде, не во фронте
- Каждое правило оценщика — с `source`; тест T043 это проверяет
- Сиды загружаются идемпотентно; `--reset` перед повторным e2e
- Коммит после каждой фазы; PR по волнам
