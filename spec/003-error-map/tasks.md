---
description: "Список задач фичи 003: Карта ошибок — «схема приёма вызова»"
---

# Задачи: Карта ошибок — «схема приёма вызова»

**Вход**: документы из `spec/003-error-map/` — [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/error-map-endpoints.md](contracts/error-map-endpoints.md), [quickstart.md](quickstart.md)

**Принятые решения (владелец, 2026-10-19)**: D1 — таблица «правило → этап» принимается как черновик; D2 — карта работает только со стендом бэкенда («требуется сервер» в автономном фронте); D3 — подсказка по билетам в мастере, подбор билетов по этапу не делаем; D4 — источник ошибок `Evaluation.errors`.

**Правки по анализу (2026-10-19)**: добавлен T019 (демо-набор данных), нумерация последующих задач сдвинута; FR-028 сужен до «администратор — API и настройки»; создана трассировка `01-requirements-map.md`.

**Тесты**: включены — AGENTS §11 и конституция требуют автотестов на новую логику (happy path + краевой случай + неавторизованный сценарий).

**Организация**: по пользовательским историям спеки; каждая история независимо проверяема.

## Формат: `[ID] [P?] [Story] Описание с путём файла`

- **[P]** — можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]** — история спеки (US1…US7); у задач Setup, Foundational и Polish метки истории нет
- Пути — относительно корня репозитория `/Users/seva/Projects/RespondersAcademy`

## Правила, действующие для всех задач

- Перед любым кодом фронта прочитать релевантный гайд в `node_modules/next/dist/docs/` (AGENTS: Next.js здесь не «тот»).
- Стили — только CSS-модули и токены платформы `--pf-*`; `src/shared/ui/platform` в симулятор (`/arm/*`) не импортировать.
- Импорты FSD — только вниз; публичный API слайса — `index.ts` без `export *`; `npm run steiger` — обязательный гейт.
- Каждый асинхронный экран — состояния loading / empty / error / success.
- Уровень никогда не передаётся одним цветом: всегда цвет + значок + слово (FR-002).
- Язык интерфейса, сообщений и коммитов — русский. Коммиты — только по просьбе владельца, без `git add .`.

---

## Фаза 1: Подготовка и проверка допущений

**Цель**: закрыть пункты «не проверено» из `research.md`, прежде чем на них опираться.

- [X] T001 Проверить, что у сидовых оценок в `Evaluation.errors` есть поле `ruleId` и значения совпадают с идентификаторами из `backend/ml/assess/rules.py` (скрипт-проверка через `uv run python`, результат записать в `spec/003-error-map/research.md` R1; если `ruleId` отсутствует — зафиксировать в R1 и предложить источник-замену, не продолжать фазу 2 без решения владельца)
- [X] T002 [P] Проверить сидовые данные прав: заполнено ли `User.assigned_groups` у преподавателей (`backend/app/models/user.py`), какие группы есть у обучающихся, сколько оценённых попыток на группу и режим в демо-сиде; итог записать в `spec/003-error-map/research.md` R4 (правило доступа преподавателя к группе окончательно фиксируется здесь)
- [X] T003 [P] Проверить `mocks/reference.json` и `spec/000-фронт/mocks/reference.json`: какие статьи справочника есть и какие подходят под этапы из `data-model.md` §3; составить таблицу «этап → articleId» (пустые допустимы) в `spec/003-error-map/research.md` R8
- [X] T004 [P] Прочитать в `node_modules/next/dist/docs/` гайды по App Router, динамическим сегментам и `params` как Promise (по образцу `app/teacher/groups/[groupId]/page.tsx`) и записать выводы в 3–5 строк в `spec/003-error-map/research.md` R11
- [X] T005 [P] Проверить, куда мастер `AssignmentWizard` получает начальные значения и как страница `/teacher/assignments/new` его монтирует (`src/features/assignment-create/ui/AssignmentWizard.tsx`, `src/pages/teacher/assignments/`); результат — в `research.md` R12 (нужен для US2)

**Контрольная точка**: все «не проверено» либо подтверждены, либо исправлены в документах.

---

## Фаза 2: Основание (блокирует все истории)

**Цель**: общие данные, расчёт и каркас, без которых ни одна история не работает.

**⚠️ ВАЖНО**: до завершения фазы работу над историями не начинать.

### Данные и контракты

- [X] T006 Создать `backend/app/services/error_map_stages.py`: этапы режимов `dds` и `operator112` с полями `id`, `order`, `title`, `mode`, `articleId` по таблицам `spec/003-error-map/data-model.md` §3; словарь «правило → этап» (реальные ID из `backend/ml/assess/rules.py`), этап `other` («Прочее») для неотнесённых; словарь `RULE_PLAIN` — по одной формулировке простыми словами на каждое правило, ≤ 90 символов, без жаргона; причинные связи с подписями; соответствие этап → `articleId` из T003
- [X] T007 [P] Тест полноты `backend/tests/unit/test_error_map_stages.py`: каждое правило из реестра оценщика (`ml.assess.rules`) отнесено ровно к одному этапу или явно к `other`; у каждого правила есть `RULE_PLAIN` не длиннее 90 символов; порядок этапов без пропусков; причинные связи идут только вперёд по `order`; все `articleId` существуют в сиде справочника
- [X] T008 Создать `backend/app/schemas/error_map.py`: Pydantic-модели в camelCase 1:1 с формами из `spec/003-error-map/contracts/error-map-endpoints.md` (`ErrorMapStage`, `ErrorMapStageLevel`, `ErrorMapHeadline`, `ErrorMapResponse`, `ErrorMapTypicalError`, `ErrorMapChainLink`, `ErrorMapExplanation`, `ErrorMapStageDetail`, `ErrorMapJournalResponse`, `ErrorMapVerdictRequest`, `MyFocusResponse`, `ErrorMapSettings`); литералы: режим `operator112 | dds`, период `2w | 1m | all`, уровень `rare | sometimes | often | noData`, сравнение `better | same | worse`
- [X] T009 [P] Создать `src/shared/api/types/error-map.ts` с теми же типами (TS-эскиз из контракта) и экспортировать из `src/shared/api/types/index.ts`; затем выполнить `cd backend && uv run python scripts/extract_ts_fields.py` и убедиться, что `tests/contract/expected_fields.json` обновлён и `test_expected_fields_are_fresh` зелёный
- [X] T010 [P] Добавить клиент `src/shared/api/endpoints/error-map.ts` (функции: `listErrorMapGroups`, `getErrorMapGroup`, `getErrorMapStage`, `getErrorMapJournal`, `getErrorMapStudent`, `getErrorMapStudentStage`, `saveErrorMapVerdict`, `getMyFocus`, `getErrorMapSettings`, `saveErrorMapSettings`, `errorMapPdfUrl`) по образцу `src/shared/api/endpoints/lobby.ts` и клиентов T046; экспорт из `src/shared/api/endpoints/index.ts` и `src/shared/api/index.ts`; тест `src/shared/api/endpoints/error-map.test.ts` по образцу `teacher-v1.test.ts`
- [X] T011 Добавить настройки: `backend/app/services/error_map_settings.py` — чтение/запись раздела `errorMap` в `SystemSettings.settings` (`backend/app/models/reference.py`) со значениями по умолчанию `sometimesFrom 0.10`, `oftenFrom 0.30`, `minAttemptsGroup 5`, `minAttemptsStudent 3`, `sameBandPoints 10` и проверкой `0 < sometimesFrom < oftenFrom < 1`, `sameBandPoints` 0–50, минимумы ≥ 1; отсутствующий раздел заменяется умолчаниями; тест `backend/tests/unit/test_error_map_settings.py`

### Расчёт и доступ

- [X] T012 Создать `backend/app/services/error_map_service.py` — чистое ядро расчёта (без БД): по списку попыток `{attemptId, studentId, mode, at, errors[]}` считает для режима `StageLevel` по этапам (одна попытка учитывается на этапе один раз, FR-003), слово уровня по порогам (`rare` < `sometimesFrom`; `sometimes` от `sometimesFrom` до `oftenFrom` включительно; `often` > `oftenFrom`), `noData` при числе попыток меньше минимума, `other` для неотнесённых правил (FR-007); сортировка для вывода — по `share` ↓, при равенстве по `order`
- [X] T013 [P] Эталонный набор и тесты ядра `backend/tests/unit/test_error_map_levels.py`: синтетический набор с заранее посчитанными значениями (граничные 10% и 30%, несколько ошибок в одной попытке, попытка без ошибок, правило без отнесения → `other`, попыток меньше минимума → все `noData`); результаты сверить с независимо вычисленными числами в тесте (SC-005)
- [X] T014 Добавить загрузчик данных в `backend/app/services/error_map_service.py`: один запрос по `Attempt`/`Evaluation` для списка студентов группы (`User.group == groupId`, `role == "student"`) и периоду (`Evaluation.generated_at`; `2w` и `1m` от текущей даты по МСК через `app/services/time.py`, `all` без границы), без цикла по студентам (N+1 недопустим, R10); учитывать только оценённые попытки выбранного режима
- [X] T015 Создать `backend/app/services/error_map_access.py` — проверки доступа по правилу, зафиксированному в `research.md` R4: `teacher` — своя группа/свой обучающийся, `admin` — всё (чтение), иначе `forbidden("Нет доступа к группе / обучающемуся")`; несуществующая группа/обучающийся — `not_found`; по образцу `backend/app/api/v1/ai_access.py`; тест `backend/tests/unit/test_error_map_access.py` (своя группа — ок, чужая — 403, админ — ок, обучающийся — 403, несуществующая — 404)
- [X] T015a Применить решения D5 и D7 к сидам (`spec/003-error-map/research.md`, раздел «Решения владельца»): в `spec/000-фронт/mocks/users.json` задать `assignedGroups` (u-002 → `["ДДС-01"]`, u-003 → `["ДДС-02"]`, u-004 пусто); пересчитать сидовые попытки штатным оценщиком, чтобы в `Evaluation.errors` появился `ruleId`; `npm run mocks:sync && npm run mocks:validate`, `cd backend && uv run python -m app.seed.load --reset`; привести фронт (`TeacherStudentsScreen.tsx`: пусто = нет групп) и затронутые тесты; `uv run pytest -q` и `npm run test` по затронутому
- [X] T016 Создать роутер `backend/app/api/v1/error_map.py` с пустым каркасом (общий разбор параметров `mode`/`period`: неизвестные значения → 400 на русском, умолчания `dds` / `1m`) и зарегистрировать в `backend/app/api/v1/__init__.py`; в `tests/contract/` проверить, что роутер подключён и OpenAPI содержит префикс `/error-map`

### Каркас фронта

- [X] T017 [P] Добавить маршруты в `src/shared/config/routes.ts`: `teacherErrorMap`, `teacherErrorMapGroup(groupId)`, `teacherErrorMapJournal(groupId)`, `teacherErrorMapStudent(studentId)`, `teacherErrorMapPresent(groupId)` (параметры фильтров — в query)
- [X] T018 [P] Создать слайс `src/entities/error-map/` (`index.ts`, `model/levels.ts`, `model/levels.test.ts`): подписи уровней («редко», «иногда», «часто», «мало данных»), значок каждого уровня — четыре различимых по форме символа (✓ — «редко», ~ — «иногда», ! — «часто», ○ — «мало данных»), встроенные символы или inline-SVG без внешних файлов, словесные подписи сравнения («лучше группы», «как у группы», «хуже группы»); тест: у каждого уровня есть и значок, и слово, и цветовой токен

### Демо-данные

- [X] T019 Создать детерминированный демо-набор для карты ошибок `backend/scripts/seed_error_map_demo.py` (по образцу `backend/scripts/seed_chain_demo.py`): синтетические группы, попытки, оценки и ошибки с реальными `ruleId` из `backend/ml/assess/rules.py` для обоих режимов — группа без «часто»-этапов; группа с двумя «часто»-этапами; группа с более чем тремя «часто»-этапами; группа с числом попыток ниже `minAttemptsGroup`; обучающийся, который хуже группы на одном этапе и лучше на другом; обучающийся с числом попыток ниже `minAttemptsStudent`; скрипт идемпотентен, не затирает остальные сиды, подключён в `scripts/demo-up.sh` и описан в `spec/003-error-map/quickstart.md` (демо без ручной подготовки — принцип IV конституции); персональных данных нет

**Контрольная точка**: контракты зафиксированы, ядро расчёта проверено на эталоне, права готовы — можно делать истории.

---

## Фаза 3: История 1 — Увидеть слабое место группы за секунды (P1) 🎯 MVP

**Цель**: преподаватель открывает карту группы: фраза-вывод и лента этапов со светофором.

**Независимая проверка**: на синтетическом наборе открыть карту группы — цвета, значки, слова и вывод совпадают с эталоном; случаи «Критичных проблем нет», «больше трёх проблемных» и «мало данных» ведут себя по спеке.

### Тесты истории 1

- [X] T020 [P] [US1] Интеграционный тест `backend/tests/integration/test_error_map_group.py`: `GET /api/v1/error-map/groups` и `GET /api/v1/error-map/groups/{groupId}` — своя группа 200 и форма ответа, чужая 403, без сессии 401, обучающийся 403, несуществующая 404, неверные `mode`/`period` 400; вывод: два проблемных этапа названы, нет проблем → «Критичных проблем нет», проблемных больше трёх → в выводе ровно три, мало данных → `kind: noData`
- [X] T021 [P] [US1] Компонентные тесты `src/widgets/error-map/ui/StageStrip.test.tsx` и `Headline.test.tsx`: каждая плитка содержит название, слово уровня и значок (не только цвет); серая плитка подписана «мало данных»; вывод показывает фразу «Критичных проблем нет», когда проблем нет; плитки доступны с клавиатуры и имеют `aria-label` с уровнем

### Реализация истории 1

- [X] T022 [US1] Реализовать в `backend/app/services/error_map_service.py` функцию `group_map(db, viewer, group_id, mode, period)`: загрузка (T014), уровни (T012), `Headline` (≤ 3 этапов `often`; `clean` — «Критичных проблем нет»; `noData` — «Данных пока мало…»), список этапов режима плюс `other`, только если на нём есть ошибки
- [X] T023 [US1] Реализовать эндпоинты `GET /error-map/groups` (список доступных групп с числом обучающихся) и `GET /error-map/groups/{groupId}` в `backend/app/api/v1/error_map.py` с проверкой доступа (T015); ответ — `ErrorMapResponse`
- [X] T024 [P] [US1] Создать компоненты в `src/widgets/error-map/ui/`: `StageTile.tsx` (плитка: название, слово, значок, число, кнопка с высотой ≥ 44 px, шрифт ≥ 16 px), `StageStrip.tsx` (лента 8 плиток со стрелками между ними на SVG), `Headline.tsx` (крупная фраза-вывод), стили `ErrorMap.module.css` только на токенах `--pf-*`; публичный API в `src/widgets/error-map/index.ts`
- [X] T025 [P] [US1] Создать панель фильтров `src/widgets/error-map/ui/Filters.tsx`: ровно три фильтра — группа/обучающийся, период («2 недели», «месяц», «всё время»), режим («ДДС», «специалист-112»); значения хранятся в query-параметрах URL, чтобы «Назад» возвращал на тот же экран
- [X] T026 [US1] Создать страницу `src/pages/teacher/error-map/` (`index.ts`, `api/errorMapApi.ts`, `ui/ErrorMapScreen.tsx`, `ui/ErrorMapScreen.test.tsx`): карта выбранной группы через `ResourceView` с состояниями загрузка / нет данных («Пока нет данных за этот период») / ошибка / успех; у преподавателя без групп — понятное сообщение; в автономном режиме без бэкенда — состояние «требуется сервер» (решение D2)
- [X] T027 [US1] Добавить тонкие роуты-обёртки `app/teacher/error-map/page.tsx` и `app/teacher/error-map/[groupId]/page.tsx` (реэкспорт слайса, `params` как Promise — по образцу `app/teacher/groups/[groupId]/page.tsx`) и пункт «Карта ошибок» в `src/widgets/platform-nav/config/navItems.ts` для роли `teacher`; ссылка «Карта ошибок группы» на странице `src/pages/teacher/groups/ui/TeacherGroupScreen.tsx`; убедиться, что `proxy.ts` и гварды ролей закрывают `/teacher/error-map/**` для остальных ролей (экранов карты для администратора в v1 нет — FR-028: администратору доступны API и настройки порогов)
- [X] T028 [US1] Админ-настройка порогов: эндпоинты `GET/PUT /error-map/settings` в `backend/app/api/v1/error_map.py` (только `admin`, запись в аудит `error_map.settings` со старыми и новыми значениями через `backend/app/services/audit.py`), тест `backend/tests/integration/test_error_map_settings_api.py` (преподаватель 403, неверные значения 400, аудит создан); секция «Карта ошибок» на вкладке настроек `src/pages/admin-system/ui/SettingsTab.tsx` (или в `settings/`) с тестом

**Контрольная точка**: история 1 работает сама по себе — это MVP; можно показывать эксперту.

---

## Фаза 4: История 2 — Понять причину и назначить тренировку (P1)

**Цель**: клик по плитке раскрывает разбор, из него — переход в мастер назначения.

**Независимая проверка**: из карты группы с красным этапом дойти до созданного задания за ≤ 3 клика.

### Тесты истории 2

- [X] T029 [P] [US2] Интеграционный тест `backend/tests/integration/test_error_map_stage.py`: `GET /error-map/groups/{groupId}/stages/{stageId}` — не более трёх типовых ошибок, отсортированных по числу обучающихся ↓ затем по тяжести; список имён только из доступной группы; пример попытки принадлежит группе; без статьи — поле `articleId` отсутствует; цепочка содержит только связи, исходящие из этапа; чужая группа 403; неизвестный этап 404
- [X] T030 [P] [US2] Компонентные тесты `src/widgets/error-map/ui/StageDetail.test.tsx` и `ChainHint.test.tsx`: разбор показывает типовые ошибки простыми словами, имена, ссылку на отчёт занятия, ссылку на статью (скрыта, если нет), кнопку «Назначить тренировку по этому этапу»; пунктир цепочки сопровождается подписью словами (не только линия)
- [X] T031 [P] [US2] Тест `src/features/assignment-create/ui/AssignmentWizard.test.tsx` (дополнить): мастер с начальными значениями из карты стартует с выбранными обучающимися, режимом и названием «Тренировка: <этап>», подсказкой на шаге билетов; без начальных значений работает как раньше

### Реализация истории 2

- [X] T032 [US2] Реализовать в `backend/app/services/error_map_service.py` функцию `stage_detail(...)`: типовые ошибки (≤ 3) из `RULE_PLAIN`, студенты (id и имя), пример реальной попытки (`exampleAttemptId`, `exampleSessionId`), цепочка из `error_map_stages.py`, `articleId`; `explanation` пока `null` (заполняется в US6)
- [X] T033 [US2] Реализовать эндпоинт `GET /error-map/groups/{groupId}/stages/{stageId}` в `backend/app/api/v1/error_map.py` (ответ — `ErrorMapStageDetail`)
- [X] T034 [P] [US2] Создать `src/widgets/error-map/ui/StageDetail.tsx` и `ChainHint.tsx`: разбор раскрывается под плиткой по клику и закрывается кнопкой; пунктир цепочки на SVG с подписью; ссылка «Открыть пример» ведёт на `/teacher/reports/[sessionId]` (проверить существование маршрута в `src/shared/config/routes.ts`); статья — ссылка на `/reference` (формат ссылки на статью проверить в `src/pages/reference/`)
- [X] T035 [US2] Добавить начальные значения в `src/features/assignment-create`: тип `WizardInitial` в `model/types.ts`, применение в `createDraft` (обучающиеся, режим, название), подсказка «Подберите билеты на тему «<этап>»» на шаге `StepTickets.tsx` (решение D3 — билеты не подбираются автоматически); страница `/teacher/assignments/new` (`src/pages/teacher/assignments/`) читает query-параметры `studentIds`, `mode`, `title`, `focusStage` и передаёт их мастеру
- [X] T036 [US2] Создать `src/features/error-map-assign/` (`index.ts`, `ui/AssignButton.tsx`, тест): кнопка «Назначить тренировку по этому этапу» формирует ссылку на мастер с query-параметрами из T035; высота ≥ 44 px
- [X] T037 [US2] Подключить разбор к странице `src/pages/teacher/error-map/ui/ErrorMapScreen.tsx`: выбранный этап хранится в query-параметре `stage`, при выборе подсвечиваются связанные этапы пунктиром, состояния loading/empty/error/success разбора; проверить, что создание задания пишет аудит `assignment.create` (`backend/app/services/assignment_service.py:153`) и что название задания позволяет увидеть происхождение «из карты ошибок» — это покрывает FR-029 для создания задания; записать вывод в `spec/003-error-map/contracts/error-map-endpoints.md` (раздел «Аудит», строка `error_map.assign`) и убрать из контракта отдельное действие, если оно не нужно

**Контрольная точка**: истории 1 и 2 вместе дают полный цикл «увидел → понял → назначил».

---

## Фаза 5: История 3 — Карта отдельного обучающегося (P2)

**Цель**: та же лента для одного человека со сравнением «лучше / как у группы / хуже».

**Независимая проверка**: открыть обучающегося с заведомо слабым этапом — подпись «хуже группы»; «Назад» возвращает к карте группы на тот же этап.

- [X] T038 [P] [US3] Интеграционный тест `backend/tests/integration/test_error_map_student.py`: `GET /error-map/students/{studentId}` и `.../stages/{stageId}` — подпись сравнения по зоне `sameBandPoints`; при попыток меньше `minAttemptsStudent` поле `comparison` отсутствует и уровень `noData`; обучающийся чужой группы 403; ответ не содержит данных других обучающихся, кроме агрегата группы для сравнения
- [X] T039 [P] [US3] Тест `src/pages/teacher/error-map/ui/StudentMapScreen.test.tsx`: подписи «лучше группы» / «как у группы» / «хуже группы» на плитках, «мало данных» без сравнения, «Назад» возвращает к карте группы с тем же фильтром и выбранным этапом
- [X] T040 [US3] Реализовать в `backend/app/services/error_map_service.py` функции `student_map(...)` и `student_stage_detail(...)`: уровни по порогу `minAttemptsStudent`, сравнение с долей группы (разница в процентных пунктах, зона «как у группы» ±`sameBandPoints`), те же `Headline` и разбор, но по одному человеку
- [X] T041 [US3] Реализовать эндпоинты `GET /error-map/students/{studentId}` и `GET /error-map/students/{studentId}/stages/{stageId}` в `backend/app/api/v1/error_map.py`
- [X] T042 [US3] Создать страницу `/teacher/error-map/students/[studentId]`: `src/pages/teacher/error-map/ui/StudentMapScreen.tsx` и роут-обёртка `app/teacher/error-map/students/[studentId]/page.tsx`; под плиткой подпись сравнения словами; в карточке разбора группы у каждого имени — ссылка на карту этого обучающегося; ссылка «Карта ошибок» на странице `src/pages/teacher/students/` (профиль обучающегося)

**Контрольная точка**: преподаватель переходит группа → этап → человек и обратно.

---

## Фаза 6: История 4 — Журнал группы (P2)

**Цель**: таблица «обучающиеся × этапы» со светофором.

**Независимая проверка**: ячейки журнала совпадают с картами обучающихся; клик по ячейке открывает разбор этапа для этого человека.

- [X] T043 [P] [US4] Интеграционный тест `backend/tests/integration/test_error_map_journal.py`: `GET /error-map/groups/{groupId}/journal` — все обучающиеся группы и все этапы режима, значения совпадают с `student_map` для каждого обучающегося; чужая группа 403
- [X] T044 [P] [US4] Тест `src/widgets/error-map/ui/Journal.test.tsx`: в каждой ячейке цвет, значок и слово; таблица имеет подписи столбцов и строк для чтения скринридером; клик по ячейке вызывает переход на разбор «этап → обучающийся»
- [X] T045 [US4] Реализовать `journal(...)` в `backend/app/services/error_map_service.py` и эндпоинт `GET /error-map/groups/{groupId}/journal` в `backend/app/api/v1/error_map.py` (один проход по данным группы, без вызова `student_map` в цикле)
- [X] T046 [US4] Создать `src/widgets/error-map/ui/Journal.tsx` (таблица на `DataTable` из `src/shared/ui/platform`, с режимом для печати: уровни различимы без цвета), страницу `/teacher/error-map/[groupId]/journal` (`src/pages/teacher/error-map/ui/JournalScreen.tsx`) и роут-обёртку `app/teacher/error-map/[groupId]/journal/page.tsx`; переключатель «Карта / Журнал» на странице группы

**Контрольная точка**: два взгляда на данные — «по этапам» и «по людям».

---

## Фаза 7: История 5 — Показ на экране и печать (P2)

**Цель**: разбор на занятии через проектор или бумагу.

**Независимая проверка**: режим показа читается с 3 м на мониторе 24″; PDF содержит фильтры, ленту и вывод и различим в чёрно-белой печати.

- [X] T047 [P] [US5] Интеграционный тест `backend/tests/integration/test_error_map_pdf.py`: `GET /error-map/export.pdf` для `scope=group|student|journal` — ответ `application/pdf`, начало файла `%PDF`, в данных документа есть группа/обучающийся, период, режим, дата; чужая группа 403; нет `groupId`/`studentId` — 400; PDF строится без сети и со встроенным локальным шрифтом
- [X] T048 [P] [US5] Тест `src/widgets/error-map/ui/PresentMode.test.tsx`: одна тема на экран, кнопки «Дальше» / «Назад» работают с клавиатуры и мышью, на первом шаге нет «Назад», на последнем нет «Дальше», «Выйти из показа» возвращает на прежний экран с теми же фильтрами
- [X] T049 [US5] Создать `backend/app/services/error_map_pdf.py` на основе общих утилит `backend/app/services/report_export.py` (локальный кириллический шрифт, `landscape(A4)`): заголовок с группой/обучающимся, периодом, режимом и датой, лента этапов (уровень = слово + значок-символ, без опоры на цвет), вывод, для журнала — таблица; эндпоинт `GET /error-map/export.pdf` в `backend/app/api/v1/error_map.py`
- [X] T050 [US5] Создать режим показа `src/widgets/error-map/ui/PresentMode.tsx` и страницу `/teacher/error-map/[groupId]/present` (`src/pages/teacher/error-map/ui/PresentScreen.tsx`, роут `app/teacher/error-map/[groupId]/present/page.tsx`): шаги — вывод, затем по одному проблемному этапу с разбором; шрифт крупнее обычного (токены размера в `--pf-*`, при их отсутствии добавить в `src/shared/ui/styles/tokens-platform.css`), параметр шага `step` в query
- [X] T051 [US5] Добавить кнопки «Показать на экране» и «Распечатать» (PDF) в `src/pages/teacher/error-map/ui/ErrorMapScreen.tsx`, `StudentMapScreen.tsx`, `JournalScreen.tsx`; высота ≥ 44 px; скачивание PDF — обычная ссылка на `errorMapPdfUrl(...)`

**Контрольная точка**: материал для занятия готов в двух форматах.

---

## Фаза 8: История 6 — Предположение ИИ и решение преподавателя (P3)

**Цель**: короткое пояснение причины с бейджем и вердикт «Согласен / Не согласен».

**Независимая проверка**: вердикт сохраняется после обновления страницы и виден в аудите; при недоступной модели показан шаблон «справочное пояснение»; ИИ не меняет уровни.

### Хранение

- [X] T052 [US6] Создать модель `backend/app/models/error_map.py` — `ErrorMapVerdict`, таблица `error_map_verdicts`: `id` String(32) PK (формат `emv-NNN`, добавить префикс в `backend/app/db/ids.py` `PREFIX`); `teacher_id` String(16) index; `group_id` String(64) index; `student_id` String(16) NOT NULL, по умолчанию `''` (пустая строка = вердикт по группе; NULL недопустим, иначе уникальность не срабатывает); `mode` String(16) с CHECK `mode IN ('operator112','dds')`; `stage_id` String(32); `period` String(8); `source` String(12); `text_hash` String(64); `verdict` String(8) с CHECK `verdict IN ('agree','disagree')`; `created_at` String(32); уникальность `(teacher_id, group_id, student_id, mode, stage_id, text_hash)`; импорт в `backend/app/models/__init__.py`
- [X] T053 [US6] Создать миграцию `backend/alembic/versions/0005_error_map_verdicts.py` (создание таблицы и ограничений из T052; откат удаляет таблицу), проверить `uv run alembic upgrade head` на чистой БД и тест `backend/tests/integration/test_alembic.py` (сверить фактическое число таблиц до и после (число 44 из AGENTS не считать истиной) и обновить счётчик в тесте, если он есть; по возможности прогнать миграцию на PostgreSQL (`--extra pg`), иначе назвать это ограничением в отчёте); после правки моделей выполнить `uv run python -m app.seed.load --reset`

### ИИ-пояснение

- [X] T054 [P] [US6] Тесты `backend/tests/unit/test_error_map_explain.py`: шаблонный текст по доминирующей ошибке этапа ≤ 2 фраз, `source == "template"`, `textHash` устойчив при том же тексте; при подмене шлюза на реализацию, возвращающую текст, `source == "ai"`; при исключении шлюза — шаблон; сетевых обращений нет (в тесте `socket.socket.connect` подменён на исключение, пояснение при этом формируется на обоих путях); пояснение не меняет `level` и `share`
- [X] T055 [US6] Добавить в Protocol `AiGateway` необязательный метод `explain_stage(...)` в `backend/app/ai_gateway.py`; `LocalAiGateway` возвращает `None` (фолбэк на шаблон); подробности контракта (вход: режим, этап, топ ошибок, число обучающихся; выход: текст ≤ 2 фраз или `None`) описать в docstring модуля рядом с `call_reply`/`call_script`; внешних вызовов не добавлять (конституция I)
- [X] T056 [US6] Создать `backend/app/services/error_map_explain.py`: формирование пояснения (шлюз → шаблон), `textHash`, чтение текущего вердикта преподавателя; подключить к `stage_detail`/`student_stage_detail` — поле `explanation` (при `noData` — `null`)

### Вердикты и интерфейс

- [X] T057 [P] [US6] Интеграционный тест `backend/tests/integration/test_error_map_verdicts.py`: `PUT /error-map/verdicts` сохраняет вердикт; повторный запрос меняет значение, а не дублирует запись (в том числе для вердикта по группе без `studentId` — вторая строка не создаётся); при следующем `GET` разбора виден `verdict`; в аудите появляется `error_map.verdict` с группой, этапом, источником и вердиктом; чужая группа 403; неверное значение `verdict` 400
- [X] T058 [US6] Реализовать эндпоинт `PUT /error-map/verdicts` в `backend/app/api/v1/error_map.py` и сервис записи вердикта с аудитом `error_map.verdict` через `backend/app/services/audit.py`
- [X] T059 [P] [US6] Тест `src/widgets/error-map/ui/AiExplain.test.tsx`: блок с бейджем «ИИ» при `source: "ai"` и подписью «справочное пояснение» при `template`; кнопки «Согласен» / «Не согласен» с `aria-pressed`, текущий вердикт подсвечен значком и словом; после клика вызывается сохранение и состояние обновляется
- [X] T060 [US6] Создать `src/widgets/error-map/ui/AiExplain.tsx` (бейдж «ИИ» по образцу существующих бейджей в `src/shared/ui/platform`; кнопки ≥ 44 px) и встроить в `StageDetail.tsx`

**Контрольная точка**: решение остаётся за преподавателем, ИИ — только подсказка.

---

## Фаза 9: История 7 — «Над чем поработать» у обучающегося (P3)

**Цель**: блок из трёх этапов в кабинете обучающегося без сравнения с другими.

**Независимая проверка**: обучающийся с ошибками видит ровно три своих этапа, без данных группы и чужих имён.

- [X] T061 [P] [US7] Интеграционный тест `backend/tests/integration/test_error_map_focus.py`: `GET /me/focus` — до трёх этапов по доле ошибок обучающегося; в JSON нет полей `students`, `comparison`, `affectedStudents`, имён и групповых долей; без ошибок — `message` «Пока замечаний нет»; мало попыток — `message` «Пройдите ещё несколько тренировок…»; преподаватель и админ получают 403 (эндпоинт только `student`)
- [X] T062 [P] [US7] Тест `src/widgets/my-focus/ui/MyFocus.test.tsx`: три пункта с подсказкой и ссылкой на материал; формулировки нейтральные (проверить отсутствие слов «хуже», «часто», «слабый»); пустое и «мало данных» состояния
- [X] T063 [US7] Реализовать `my_focus(db, viewer)` в `backend/app/services/error_map_service.py` и эндпоинт `GET /me/focus` в `backend/app/api/v1/error_map.py` (роль `student`, режим — тот, где у обучающегося больше оценённых попыток; подсказки — нейтральные шаблоны на основе этапа)
- [X] T064 [US7] Создать `src/widgets/my-focus/` (`index.ts`, `ui/MyFocus.tsx`, `ui/MyFocus.module.css`) и встроить в `src/pages/student/home/ui/StudentHomeScreen.tsx`; клиент `getMyFocus` из T010; в автономном режиме без бэкенда блок скрыт без сообщения об ошибке

**Контрольная точка**: все семь историй работают.

---

## Фаза 10: Доводка и сквозные проверки

**Цель**: доступность, документация, проверки и приёмка по критериям успеха.

- [X] T065 [P] Тест доступности `src/widgets/error-map/ui/a11y.test.tsx`: на карте, журнале и режиме показа у каждого уровня есть и значок, и слово; размеры интерактивных элементов ≥ 44 px и основного текста ≥ 16 px проверены по CSS-модулям (парсинг токенов); контраст пар «текст/фон» уровней по токенам `--pf-*` не ниже WCAG AA (расчёт контраста в тесте); в тексте интерфейса нет слов «кластер», «Парето», «граф», «агрегат» (grep по разметке и константам); в разметке и CSS новых слайсов нет обработчиков drag/pinch, нет `onMouseEnter` и `:hover` как единственного способа показать информацию, нет атрибута `title` как единственной подсказки (FR-024)
- [X] T066 [P] Проверка локального контура: `grep -rn "http" src/widgets/error-map src/widgets/my-focus src/pages/teacher/error-map backend/app/services/error_map_*.py` не находит внешних URL; обновить `docs/offline-check.md` (раздел фичи 003) и убедиться, что `docs/LIBRARIES.md` не требует изменений (новых зависимостей нет — подтвердить `git diff package.json backend/pyproject.toml` пустым)
- [X] T067 [P] Проверка неизменности симулятора: `git diff --stat -- src/app/layouts src/pages/operator112 src/pages/journal src/pages/incident src/pages/phone` пуст по новым правкам; запустить `npx vitest run src/app/layouts/simulatorBoundary.test.ts`; `npx playwright test e2e/simulator-visual.spec.ts` (если Chromium Playwright недоступен — назвать команду и причину в отчёте, не считать пройденным; SC-010)
- [X] T068 Создать отдельный HTTP-сценарий `scripts/e2e-error-map.sh` (существующие `scripts/e2e-teacher.sh` и `scripts/e2e-student.sh` ходят в мок-API и не меняются): шаги карты группы, разбора этапа, журнала, PDF, `GET /me/focus` под обучающимся, 403 на чужую группу и на карту под обучающимся; подключить как опцию `--only error-map` в `backend/scripts/run_frontend_e2e.sh` (бэкенд на чистой `var/e2e.db`, свежие серверы на каждый прогон, демо-набор из T019)
- [X] T069 Измерить производительность карты и журнала на демо-данных (SC-004: ≤ 2 с до готовности значений); если замер превышает — добавить индекс по `(student_id, generated_at)` или оптимизировать запрос из T014; результат замера записать в `spec/003-error-map/quickstart.md`
- [X] T070 [P] Обновить документацию: строку статуса фичи в `spec/README.md`, раздел «Фронт/Бэкенд» и список роутов в `AGENTS.md` §3 (маршруты `/teacher/error-map/**`, `/me/focus`, таблица `error_map_verdicts`, число миграций), матрицу ТЗ в `docs/COMPLIANCE.md`, доказательства в `docs/FINAL-GATE.md`; актуализировать `spec/003-error-map/01-requirements-map.md` (создан на этапе анализа) по фактическим задачам и результатам проверок
- [X] T071 Полный прогон проверок: `cd backend && uv run pytest -q && uv run ruff check .`; `npm run check` (lint + prettier + steiger + tsc + build); `npm run test`; `npm run mocks:validate`; зафиксировать фактические результаты и счётчики тестов в `AGENTS.md` §3 только если они изменились; не писать «пройдено» для непрогнанного
- [ ] T072 Проверка удобства по `spec/003-error-map/quickstart.md` (SC-001…SC-003, SC-006): прогон не менее чем на 3 преподавателях целевого возраста (или сотрудниках не из команды), замер «5 секунд до названия проблемного этапа» и «≤ 3 клика и ≤ 1 минута до тренировки», проверка чтения режима показа с 3 м; записать результаты и правки формулировок в `docs/FINAL-GATE.md`; если людей нет — прямо записать, что SC-001…SC-003 и SC-006 не проверены
- [ ] T073 Прогнать сценарии ручной проверки 1–14 из `spec/003-error-map/quickstart.md` на стенде `./scripts/demo-up.sh`, отметить факт результата по каждому в `quickstart.md`; финально просмотреть `git status` и `git diff` — в изменении нет `.env`, `backend/var/`, `.next/`, `public/icons/`, отчётов Playwright

---

## Зависимости и порядок выполнения

### Между фазами

- **Фаза 1 (проверки)** — без зависимостей; T001 блокирует фазу 2 при отрицательном результате.
- **Фаза 2 (основание)** — блокирует все истории.
- **Истории 3–9** — после фазы 2; приоритет: US1 → US2 (оба P1, вместе — MVP) → US3, US4, US5 (P2) → US6, US7 (P3).
- **Фаза 10** — после нужных историй.

### Между историями

- **US1** — независима после фазы 2.
- **US2** — использует карту US1 (`ErrorMapScreen`) и ядро фазы 2; сервис разбора и мастер можно делать параллельно с US1.
- **US3** — использует `stage_detail` из US2 (общий код разбора), но проверяется отдельно.
- **US4** — независима от US2/US3, использует ядро фазы 2.
- **US5** — PDF и показ используют готовые ответы US1/US3/US4; режим показа проще начинать после US2 (нужен разбор этапа).
- **US6** — встраивается в разбор US2; хранение (T052–T053) можно делать раньше, параллельно.
- **US7** — независима от US2–US6, использует ядро фазы 2.

### Внутри истории

- Тесты пишутся и падают до реализации; модели → сервисы → эндпоинты → интерфейс; история завершается проверкой до перехода к следующей.

## Параллельные возможности

- Фаза 1: T002–T005 параллельно.
- Фаза 2: T007 (после T006), T009, T010, T017, T018 — параллельно после T008; T019 (сид) — после T006.
- US1: T020, T021 → затем T024, T025 параллельно с T022–T023.
- US2: T029, T030, T031 → T034 параллельно с T032–T033.
- US6: T052–T053 (хранение) параллельно с T055 (шлюз) и T054 (тесты).
- US3, US4, US7 после фазы 2 могут идти параллельно разными исполнителями (файлы разные, кроме `error_map_service.py` и `error_map.py` — их правки делать последовательно или в отдельных функциях с аккуратным слиянием).

### Пример параллельного запуска: US1

```text
Одновременно:
  T020 тест эндпоинтов  backend/tests/integration/test_error_map_group.py
  T021 тесты плиток     src/widgets/error-map/ui/StageStrip.test.tsx, Headline.test.tsx
Затем одновременно:
  T024 компоненты       src/widgets/error-map/ui/{StageTile,StageStrip,Headline}.tsx
  T025 фильтры          src/widgets/error-map/ui/Filters.tsx
  T022–T023 сервис и эндпоинты бэкенда
```

## Стратегия реализации

### Сначала MVP (US1 + US2)

1. Фаза 1 → фаза 2 (основание).
2. US1: карта группы и вывод. **Остановиться и проверить на эталонном наборе** (SC-005).
3. US2: разбор этапа и переход в мастер. Показать эксперту — это уже цикл «увидел → понял → назначил».

### Инкрементальная поставка

1. Основание + US1 → демонстрация карты.
2. + US2 → полный цикл с тренировкой (MVP).
3. + US3 / US4 / US5 → индивидуальная работа, журнал, занятие с проектором и бумагой.
4. + US6 → ИИ-подсказка с решением преподавателя.
5. + US7 → кабинет обучающегося.
6. Фаза 10 — доводка и проверка удобства.

### Правила остановки

- Любой результат T001/T002, противоречащий `plan.md` (нет `ruleId`, нет закреплённых групп) — остановиться и вернуть владельцу решение, а не подгонять допущение.
- Пороги и таблица этапов — черновик (D1): правки таблицы не должны менять код, только `error_map_stages.py`.

## Заметки

- [P] — разные файлы и нет зависимостей.
- Метка [Story] связывает задачу с историей спеки (трассировка).
- Не коммитить без просьбы владельца; стейджить только конкретные файлы (AGENTS §12).
- Избегать задач «заодно»: нет автоматического подбора билетов по этапу (D3), нет мок-обработчиков для автономного фронта (D2), нет внешних провайдеров ИИ.
