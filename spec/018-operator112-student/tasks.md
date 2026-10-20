# Tasks: Учётка ivanov — чистый специалист системы-112

**Input**: `spec/018-operator112-student/` — plan.md, spec.md, research.md (R1–R8), data-model.md, contracts/api.md, quickstart.md
**Prerequisites**: plan.md, spec.md

**Tests**: включены — конституция («Рабочий процесс и качество») требует pytest для серверных правил, а plan.md и quickstart.md называют файлы тестов.

**Organization**: по историям spec.md (US1 P1, US2 P1, US3 P2). Ветка — `007-arm-one-to-one`; рабочее дерево общее с незакоммиченными 005/006/007 — коммитить выборочно, никогда `git add .`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: зафиксировать базу и найти тесты, которые сломаются от смены профиля ivanov.

- [X] T001 Прогнать базовые тесты до изменений и сохранить результат в `spec/018-operator112-student/baseline.txt`: `cd backend && pytest -q` и `npx vitest run` (известные красные — см. `docs/FINAL-GATE.md`, 3 pytest).
- [X] T002 Составить список тестов, где ivanov (`u-005`, логин `ivanov`, фикстура `student` в `backend/tests/conftest.py:32`) получает задание/занятие режима `dds`: `grep -rln "u-005\|ivanov" backend/tests e2e src | xargs grep -ln "dds\|ДДС"`; записать в `spec/018-operator112-student/affected-tests.md` с пометкой по каждому: «назначение ДДС ivanov» (упадёт) или «только мок-данные» (не упадёт).

---

## Phase 2: Foundational (блокирует все истории)

**Purpose**: поле профиля, миграция, сиды, тип фронта и единое правило.

- [X] T003 Добавить в `backend/app/models/user.py` колонку `training_profile: Mapped[str | None] = mapped_column(String(16), nullable=True)`; в `to_public()` отдавать `"trainingProfile"` только если задан (как `group`/`service`). Допустимые значения: `"operator112" | "dds"`; `None` = «не задан».
- [X] T004 Создать миграцию `backend/alembic/versions/0006_user_training_profile.py` (down_revision — ревизия `0005_error_map_verdicts`): `ADD COLUMN training_profile VARCHAR(16) NULL`; data-шаг `UPDATE users SET training_profile='operator112', service='ЦОВ системы-112' WHERE login='ivanov'`; downgrade — `drop_column` (службу не восстанавливать). Проверить `alembic upgrade head` на копии `backend/var/demo.db` в scratch-каталоге, не на оригинале.
- [X] T005 [P] В `spec/000-фронт/mocks/users.json` у `u-005` добавить `"trainingProfile": "operator112"` и заменить `"service"` на `"ЦОВ системы-112"`; логин, пароль, ФИО, `armNumber: 1`, `group: "ДДС-01"` не менять. Дописать в `meta.note`: «trainingProfile — профиль режима обучаемого (spec/018); у ivanov — специалист-112». Затем `npm run mocks:sync`, чтобы обновилась копия `mocks/users.json`.
- [X] T006 В `backend/app/seed/load.py` (функция загрузки пользователей, ~стр. 110–127) переносить `"training_profile": user.get("trainingProfile")`.
- [X] T007 [P] В `src/shared/api/types/user.ts` добавить `export type TrainingProfile = "operator112" | "dds";` и `trainingProfile?: TrainingProfile` в `User` с комментарием `[расширение 018] профиль режима; нет поля — «не задан», доступны оба режима; только role = student`; экспортировать тип через `src/shared/api/types/index.ts`.
- [X] T008 [P] В `src/shared/config/` добавить `trainingProfile.ts` с `TRAINING_PROFILE_TITLES = { operator112: "Специалист системы-112", dds: "Диспетчер ДДС" }`, `NO_PROFILE_TITLE = "Не задан"`, `PROFILE_SHORT = { operator112: "112", dds: "ДДС" }` и функцией `allowsMode(user: { trainingProfile?: TrainingProfile }, mode: "dds" | "operator112"): boolean` (нет профиля или профиль == режим); экспортировать из `src/shared/config/index.ts`.
- [X] T009 Перегенерировать `backend/tests/contract/expected_fields.json` скриптом `backend/scripts/extract_ts_fields.py`; убедиться, что в диффе только `trainingProfile` (плюс уже незакоммиченные поля 005, если скрипт их подтянет — отметить в коммите).
- [X] T010 Создать `backend/app/services/training_profile.py`: `PROFILE_TITLES = {"operator112": "специалиста-112", "dds": "диспетчера ДДС"}`, `MODE_TITLES = {"operator112": "112", "dds": "ДДС"}`; `allows(user: User, mode: str) -> bool` (`user.training_profile is None or user.training_profile == mode`; для `mode == "chain"` — True); `blocked_message(user, mode) -> str` → «Задание режима ДДС недоступно для учётной записи специалиста-112»; `create_rejection(users, mode) -> str` → «Задание режима ДДС нельзя назначить: профиль специалиста-112 — Иванов С. П.» (ФИО сокращать как «Фамилия И. О.», через запятую); `split_by_profile(users, mode) -> tuple[list[User], list[User]]`.
- [X] T011 [P] Юнит-тесты `backend/tests/unit/test_training_profile.py`: `allows` для None / совпадения / несовпадения / chain; тексты `blocked_message` и `create_rejection` (в т.ч. два курсанта, сокращение ФИО); `split_by_profile` сохраняет порядок.
- [X] T012 Перевести фикстуры из списка T002 с пометкой «упадёт» на другого курсанта (petrova `u-006` / логин `petrova`, `student112`): в `backend/tests/conftest.py` добавить фикстуру/константу `dds_student` и использовать её в тестах режима ДДС; поведение `student` (ivanov) оставить для тестов 112. Правило не ослаблять.

**Checkpoint**: `pytest tests/unit/test_training_profile.py tests/contract -q` зелёный; `GET /api/v1/me` под ivanov возвращает `trainingProfile: "operator112"` и `service: "ЦОВ системы-112"`.

---

## Phase 3: User Story 1 — ivanov работает только как специалист-112 (P1) 🎯 MVP

**Goal**: курсант с профилем 112 не видит и не может запустить ничего режима ДДС; режим 112 работает как раньше.

**Independent Test**: под ivanov «Задания», главная, рекомендации — 0 элементов ДДС; прямая ссылка на задание ДДС → 403 с текстом; задание 112 проходит до разбора (quickstart №1–3, №10).

### Tests

- [X] T013 [P] [US1] Интеграционные тесты `backend/tests/integration/test_operator112_profile.py` (часть US1): создать (в обход правила — прямой вставкой `Assignment` в БД, т.к. API её отклонит) задание `dds` с ivanov и задание `operator112` с ivanov; под ivanov `GET /api/v1/assignments` возвращает только 112; `GET /api/v1/assignments/{dds_id}` и `POST …/start` → 403 «Задание режима ДДС недоступно для учётной записи специалиста-112»; под morozova то же задание `dds` видно в списке с прогрессом (FR-007); `/me/history` и `/me/analytics` под ivanov без строк `dds`; рекомендации без `kind == "mode"` с `target_id == "dds"` и без карточек из истории `dds`; занятие `dds` с ivanov (вставка в БД) не возвращается в `list_sessions` для ivanov.

### Implementation

- [X] T014 [US1] `backend/app/services/assignment_service.py`: в `list_rows` для `viewer.is_student` загрузить `User` курсанта и отфильтровать строки, где `not training_profile.allows(user, row.training_mode)`; в `detail` и `start` при `viewer.is_student` (и в `start` при запуске преподавателем с `studentId` такого курсанта) — `raise forbidden(training_profile.blocked_message(user, row.training_mode))` до остальных проверок. Задания `chain` не трогать (`LEGACY_CHAIN_MESSAGE` остаётся).
- [X] T015 [US1] `backend/app/services/session_engine.py`: в `list_sessions` при `viewer.is_student` пропускать занятия, где профиль курсанта не допускает `row.training_mode`; в точках, где курсант получает/открывает карточку занятия (`_issue` и выдача карточки курсанту, ~стр. 720–740, и `project_for_student`), — `forbidden(blocked_message)`; в `filter_cards_for_student` при профиле `operator112` не вызывать `resolve_student_profile` (служба ДДС не вычисляется).
- [X] T016 [US1] `backend/app/services/recommendation_service.py::generate`: загрузить `User`; если профиль задан — оставить в `history` только строки `row["mode"] == profile` до вычисления `weak_categories`, не добавлять предложение R10 (`kind "mode"`) к запрещённому режиму.
- [X] T017 [US1] `backend/app/api/v1/lobby.py`: в `/me/history` и `/me/analytics` для курсанта с профилем фильтровать `analytics.rows(...)` по `item["mode"] == profile` (если в запросе `mode` противоречит профилю — пустой результат, не ошибка).
- [X] T018 [P] [US1] `src/pages/student/home/ui/StudentHomeScreen.tsx`: брать `trainingProfile` текущего пользователя (как экран уже получает пользователя/сессию — `/me`); при заданном профиле подпись счётчиков (`112: … · ДДС: …`, ~стр. 221) показывать только по разрешённому режиму; колонку «Режим» в истории оставить. Обновить `StudentHomeScreen.test.tsx`: кейс с `trainingProfile: "operator112"` — нет текста «ДДС:».
- [X] T019 [P] [US1] `src/pages/student/assignments/ui/StudentAssignmentsScreen.tsx`: при ответе 403 на открытие/старт показать `message` сервера в `Alert` (проверить, что существующая обработка ошибок уже это делает; если да — только тест). Тест в `StudentAssignmentsScreen.test.tsx` на текст «недоступно для учётной записи специалиста-112».

**Checkpoint**: T013 зелёный; quickstart №1–3 и №10 проходят вручную.

---

## Phase 4: User Story 2 — преподаватель не может назначить ivanov задание ДДС (P1)

**Goal**: мастер помечает курсантов с профилем и исключает несовместимых с пояснением; сервер отклоняет обход.

**Independent Test**: quickstart №4–7.

### Tests

- [X] T020 [P] [US2] Дополнить `backend/tests/integration/test_operator112_profile.py`: `POST /api/v1/assignments` под morozova с `trainingMode: "dds"`, `studentIds: ["u-005"]` → 400 с «Иванов С. П.»; `["u-005", "u-006"]` → 400 (сервер не исключает молча); `trainingMode: "operator112"`, `["u-005"]` → 201; создание занятия `trainingMode: "dds"` с `u-005` → 400; курсант без профиля (`u-006`) — оба режима 201 (SC-005).
- [X] T021 [P] [US2] Юнит-тест `src/features/assignment-create/model/students.test.ts`: `splitByMode(students, mode)` → `{ allowed, skipped }` для профилей none / operator112 / dds.

### Implementation

- [X] T022 [US2] `backend/app/services/assignment_service.py::create`: после проверки `students` (~стр. 104–106) — `allowed, blocked = training_profile.split_by_profile(students, body["trainingMode"])`; если `blocked` — `raise validation_failed(training_profile.create_rejection(blocked, body["trainingMode"]))`.
- [X] T023 [US2] `backend/app/services/session_engine.py::create_session`: после цикла проверки курсантов (~стр. 251–254) и вычисления `training_mode` — та же проверка `split_by_profile` → `validation_failed(create_rejection(...))`.
- [X] T024 [US2] `src/features/assignment-create/model/students.ts`: добавить `splitByMode(students: PublicUser[], mode: AssignableMode): { allowed: PublicUser[]; skipped: PublicUser[] }` на основе `allowsMode` из `@/shared/config`.
- [X] T025 [US2] `src/features/assignment-create/ui/StepStudents.tsx`: рядом с ФИО курсанта с профилем — `Tag` с `PROFILE_SHORT[trainingProfile]` и `title`/подсказкой `TRAINING_PROFILE_TITLES[...]`.
- [X] T026 [US2] `src/features/assignment-create/ui/StepMode.tsx`: принять выбранных курсантов (`PublicUser[]`, уже есть в мастере через `onLoaded`); при выбранном режиме и непустом `skipped` — `Alert` «Пропущены (профиль специалиста-112): Иванов С. П.» (подпись профиля зеркально для ДДС); если `allowed` пуст — ошибка шага «Нет обучающихся для режима ДДС: у выбранных профиль специалиста-112».
- [X] T027 [US2] `src/features/assignment-create/ui/AssignmentWizard.tsx` и `model/validate.ts`: при сборке запроса передавать `studentIds` только из `allowed`; валидация шага «Режим и формат» — ошибка из T026, если `allowed` пуст; `StepReview.tsx` — показывать состав из `allowed` и строку «Пропущены: …» при наличии.
- [X] T028 [US2] Обновить `src/features/assignment-create/ui/AssignmentWizard.test.tsx`: сценарии quickstart №4 (ivanov + petrova → ДДС: предупреждение, в запросе только `u-006`), №5 (только ivanov → ДДС: ошибка шага), №7 (ivanov → 112: в запросе `u-005`). Проверить `initialFromQuery.test.ts` — deep-link с `mode=dds` и ivanov в составе тоже исключает его.

**Checkpoint**: T020, T021, T028 зелёные; quickstart №4–7 вручную.

---

## Phase 5: User Story 3 — профиль виден и меняется администратором (P2)

**Goal**: admin видит/меняет профиль; изменение в аудите.

**Independent Test**: quickstart №8.

### Tests

- [X] T029 [P] [US3] Тесты в `backend/tests/contract/` (рядом с существующими тестами `admin/users`, найти `grep -rln "admin/users" backend/tests`): `PATCH /admin/users/u-006 {"trainingProfile": "operator112"}` → 200, `trainingProfile` в ответе, запись аудита содержит `профиль «Не задан» → «Специалист системы-112»`; `{"trainingProfile": null}` — сброс; `{"trainingProfile": "chain"}` → 400 «Профиль режима: специалист системы-112, диспетчер ДДС или не задан»; смена роли на teacher обнуляет профиль; после смены профиля u-006 на operator112 `POST /assignments` dds с ним → 400.

### Implementation

- [X] T030 [US3] `backend/app/schemas/admin.py`: в схемы создания и изменения пользователя (~стр. 169 и 223) добавить `training_profile: Literal["operator112", "dds"] | None = None` с `field_validator(mode="before")`: пустая строка → None, иное значение вне набора → `ValueError("Профиль режима: специалист системы-112, диспетчер ДДС или не задан")`. Для PATCH различать «не передано» и `null` (сброс) — тем же способом, каким схема уже различает это для `group`/`service`, если различает; иначе через `model_fields_set`.
- [X] T031 [US3] `backend/app/api/compat/admin_users.py`: `_apply_role_fields` — `user.training_profile` только для `role == "student"`, иначе `None`; в `before` (~стр. 153) сохранять `training_profile`; в `_changes` добавить `профиль «{старое}» → «{новое}»` с подписями «Специалист системы-112» / «Диспетчер ДДС» / «Не задан».
- [X] T032 [P] [US3] Мок-слой `app/api/mock/admin/users/route.ts` и `app/api/mock/admin/users/[id]/route.ts`: принимать и сохранять `trainingProfile` (`"operator112" | "dds" | null`), та же валидация и строка аудита, что в T030–T031.
- [X] T033 [P] [US3] `src/pages/admin-users/model/user-form.ts` (+ `types.ts`): поле `trainingProfile: TrainingProfile | ""` в значениях формы, перенос в тело запроса (`""` → `null`); `user-form.test.ts` — кейсы.
- [X] T034 [US3] `src/pages/admin-users/ui/UserFormFields.tsx`: для роли «Обучающийся» — `select` «Профиль режима» с вариантами «Не задан» / «Специалист системы-112» / «Диспетчер ДДС» (подписи из `@/shared/config`), рядом с полем «Служба» (~стр. 94); подключить в `UserCreateModal.tsx` и `UserEditModal.tsx`. Обновить `AdminUsersPage.test.tsx`: редактирование ivanov показывает «Специалист системы-112».

**Checkpoint**: T029, T033 и тесты админки зелёные; quickstart №8.

---

## Phase 6: Polish & Cross-Cutting

- [X] T035 [P] `backend/scripts/demo_up.sh` (~стр. 232–239): строка учётки «Обучающийся (специалист-112): логин: ivanov пароль: student112 (АРМ 1)»; шаг 3 демо-сценария не предлагать назначать ДДС ivanov — «назначить задание режима ДДС другому курсанту (например, petrova)».
- [X] T036 [P] `README.md`: в списке демо-учёток отметить ivanov как специалиста-112 и сослаться на `spec/018-operator112-student/`.
- [X] T037 [P] Перевести e2e из списка T002 (пометка «упадёт»), где ivanov проходит режим ДДС, на petrova: `e2e/*.spec.ts`, `backend/scripts/run_frontend_e2e.sh`.
- [X] T038 Полный прогон: `cd backend && ruff check . && pytest -q`, `npx vitest run`, `npx tsc --noEmit`, `npm run mocks:validate`; сравнить с `baseline.txt` (T001) — новых красных нет; записать итог в `spec/018-operator112-student/quickstart.md` (раздел «Результаты прогона», дата).
- [X] T039 Пройти ручные сценарии `quickstart.md` №1–10 на стенде `demo_up.sh` и отметить результат в том же разделе; SC-004 — сравнить оценки 5 прогонов 112 под ivanov с базой (если эталонных прогонов нет — отметить «не проверено», не выдумывать).
  - Частично (2026-10-20): API-сценарии 1, 2, 3, 6, 8, 9 — ✅ на свежей базе (:8008); 4, 5, 7 — только компонентными тестами (второй `next dev` не стартует, :3000 занят чужим процессом); SC-004 не сравнивался — эталонных прогонов нет. См. quickstart.md «Результаты прогона».
  - Закрыто (2026-10-20): 4, 5, 7, 1, 10 — в браузере на стенде demo-up; SC-004 ✅ — 5 одинаковых прогонов до/после 008 совпали (96/81/81/89/86). См. quickstart.md «Дополнительный прогон».
  - ❌ Найдено при №10: «Открыть АРМ» в кабинете ivanov ведёт в журнал ДДС `/arm` — задача T041.
- [X] T041 [US1] Закрыть ivanov журнал и карточку ДДС: `/arm`, `/arm/card/[cardId]`, `/arm/phone` для профиля `operator112`. Решение владельца 2026-10-20: «у 112 по сути нет ничего кроме окна со звонками — скрой».
  - Сделано: пункт «Открыть АРМ» получил `requiresMode: "dds"` (`src/widgets/platform-nav/config/navItems.ts`), рамка кабинета фильтрует пункты через `visibleNavEntries` (`src/widgets/platform-nav/model/visibleNav.ts`); `requireSessionUser(role, mode?)` + `isModeForbidden` (`src/entities/user/model/route-access.ts`) → `/forbidden`; режим `dds` у `ArmJournalLayout`, `ArmCardLayout` и новый вложенный `ArmDdsGuardLayout` для `/arm/phone`. `/arm/operator112` не затронут.
  - Проверено 2026-10-20: vitest `route-access.test.ts` + `visibleNav.test.ts` (8 новых), tsc, eslint, steiger; браузер на стенде demo-up: ivanov — пункта нет, `/arm`, `/arm/card/c-095`, `/arm/phone` → `/forbidden`, «Начать» задание 112 → `/arm/operator112`; tarasova (без профиля) — пункт есть, все три экрана открываются.
  - Ограничение: проверка — в серверном лэйауте (как гвард роли); данные ДДС на API для профиля 112 не закрываются (Next docs «Layouts and auth checks»). Для «скрыть» достаточно; закрытие данных — отдельной задачей, если понадобится.
- [X] T040 Обновить `.ai/SESSION_STATE.md` (Features: 018 и статус) и удалить временные `baseline.txt`/`affected-tests.md`, если они не нужны владельцу (спросить). — Владелец 2026-10-20: файлы оставить.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (T003 → T004, T006, T009; T007 → T008, T009; T010 → T011, все US).
- **US1 (Phase 3)** и **US2 (Phase 4)** зависят только от Phase 2; бэкенд-задачи US1 и US2 правят одни файлы (`assignment_service.py`, `session_engine.py`) — выполнять последовательно: T014 → T022, T015 → T023.
- **US3 (Phase 5)** зависит только от Phase 2 и не пересекается по файлам с US1/US2 — можно параллельно.
- **Phase 6** — после всех историй.

### Parallel Opportunities

- Phase 2: T005, T007, T008 параллельно (разные файлы); T011 — после T010.
- US1: T013 (тест) пишется первым; T018 и T019 (фронт) параллельно с T014–T017 (бэкенд).
- US2: T020 и T021 параллельно; фронт T024–T028 параллельно с бэкендом T022–T023.
- US3 целиком параллельно с US1/US2: T029, T032, T033 — [P].
- Phase 6: T035, T036, T037 параллельно.

### Parallel Example: User Story 2

```text
Бэкенд:  T020 (тест) → T022 → T023
Фронт:   T021 (тест) → T024 → T025 → T026 → T027 → T028
```

## Implementation Strategy

### MVP (US1)

1. Phase 1–2 (поле, миграция, сиды, правило).
2. Phase 3 — ivanov в кабинете видит только 112, ДДС недоступен.
3. Проверить quickstart №1–3 — демо «войти ivanov → задание 112» уже чистое.

### Инкрементально

1. + US2 — преподаватель не может выдать ivanov ДДС (закрывает вход правила).
2. + US3 — профиль управляется из админки (готовит механизм для будущей учётки ДДС).
3. Phase 6 — демо-подсказки, e2e, полный прогон.

## Notes

- Учётка диспетчера ДДС — вне фичи (решение владельца 20.10.2026); `trainingProfile: "dds"` поддерживается правилом, но никому в сидах не ставится.
- Экраны АРМ не меняются (spec/007 FR-001; память «ARM screens = exact replica»).
- Не сбрасывать `backend/var/*.db` без владельца; миграцию проверять на копии.
- Коммиты выборочные по файлам задач; без подписи агента, если это противоречит `.ai/SESSION_STATE.md` (там: «never Co-Authored-By/agent signature in commits»).
