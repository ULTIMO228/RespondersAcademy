---
description: "Задачи: поэтапное сведение всех веток в main (021)"
---

# Tasks: Поэтапное сведение всех веток в main

**Input**: `spec/021-branch-consolidation/` — spec.md, plan.md, research.md (R1–R11), data-model.md, contracts/merge-journal.md, quickstart.md

**Tests**: отдельных тестов фича не пишет. Проверка — быстрый гейт после каждого куска и полный гейт в конце (quickstart.md).

**Обозначения**: `WT` = worktree интеграционной ветки `../RespondersAcademy-merge`; `J` = `spec/021-branch-consolidation/merge-journal.md` в WT (формат — contracts/merge-journal.md). Каждый merge-коммит — только по прямой просьбе владельца (CLAUDE.md, «Git»). Коммиты в интеграционной ветке разрешены владельцем 2026-10-20; push и main — нет. Без `Co-Authored-By` и подписи агента.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Получить все ветки (`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`) и сверить вершины с data-model.md «Ветка-источник». Расхождение оформить новым куском в spec/021-branch-consolidation/spec.md (таблица «Куски»)
- [X] T002 Создать worktree `git worktree add ../RespondersAcademy-merge -b merge/021-branch-consolidation origin/main`, затем `npm ci` и `cd backend && uv sync --group dev` в WT
- [X] T003 Скопировать папку `spec/021-branch-consolidation/` в WT, создать журнал J с шапкой (база `ba1f7d8`, вершины из T001) и закоммитить первым коммитом `docs(021): спека и журнал слияния веток`. Дальше J коммитится вместе с каждым шагом

---

## Phase 2: Foundational (эталон до слияния — блокирует всё)

- [X] T004 Прогнать быстрый гейт (quickstart.md) на `origin/main` в WT и записать результат в J, раздел «Эталон»
- [X] T005 [P] Через `git worktree add --detach` во временную папку scratchpad (общий `node_modules` симлинком — `package.json` ни одна ветка не меняет; `uv sync` на каждую) прогнать быстрый гейт на вершинах `feat/011-dds-sasha`, `SASHA`, `fix/ai-connection-probe-timeout`, `feature/scenario-graph-builder` (остальные — их предки или без бэкенда; при неясном красном прогнать и их). Сохранить красные тесты каждой ветки в J, «Эталон», чтобы потом отличать унаследованные (L005). Субагент Haiku на прогоны, сводку проверяет интегратор. Временные worktree удалить `git worktree remove`
- [X] T006 [P] Проверить сетевые зависимости из R10: extras `speechkit` и `stt-local` в `backend/pyproject.toml` веток `develop` и `SASHA`, вызовы `yandexcloud` и GigaAM в `backend/ml/speech` и `backend/app/services`. Нужно ответить, включается ли сеть без явной переменной окружения. Итог записать в J. **Блокирует T011**: опция, включающая сеть по умолчанию, выключается в слиянии (В2)

**Checkpoint**: эталон записан, известны унаследованные красные тесты.

---

## Phase 3: User Story 1 — полная карта кусков (P1) 🎯 MVP

**Goal**: каждый коммит вне main отнесён к куску, у каждого куска есть вердикт.

**Independent Test**: сумма коммитов по K0–K12 = `git rev-list --no-merges --count $(git branch -r --format='%(refname:short)' | grep -v -e HEAD -e 'origin/main$') ^origin/main` (127 на 2026-10-20); дублей нет.

- [X] T007 [US1] Сгенерировать в J таблицу «коммит → кусок» для всех не-merge коммитов `origin/* ^origin/main` (правила кусков — spec.md «Куски»), проверить полноту числом
- [X] T008 [P] [US1] Разобрать сплющенный `98705b7` (182 файла): какие файлы к какой фиче относятся (016, 017, 007, 018, 009, 010 по R2), записать в J. Субагент Opus (medium), интегратор перепроверяет 3 выборочных файла
- [X] T009 [P] [US1] F4: сверка K5 с K4: `git diff 150d786 f219be2`, `git diff 50be798 57061d8`, `git diff 32e2160 d9ce4da`. Каждое отличие объяснить; если в K4 потеряна строка K5 — задача в J «вернуть». Формат — contracts «сверка без слияния»
- [X] T010 [P] [US1] F4: сверка K6 (`ce6c3dd`) с `57061d8` по всем 22 файлам вне `.ai/`. Ожидание из отчёта — отличается только поле `note` в `spec/000-фронт/mocks/users.json`. Вердикт записать в J

**Checkpoint**: карта полная, K5/K6 закрыты сверкой.

---

## Phase 4: User Story 3 — кластер ДДС поэтапно (P1)

**Goal**: K1, K2+K4, K3 влиты по одному, быстрый гейт после каждого.

**Independent Test**: в J по F1–F3 есть merge-коммит, таблица конфликтов и гейт; `git rev-list --no-merges --count HEAD..origin/SASHA` = 0 и `HEAD..origin/feat/011-dds-sasha` = 0.

- [X] T011 [US3] F1: в WT `git merge --no-ff origin/develop`, конфликтов не ожидается. Затем `cd backend && uv lock && uv sync --group dev` (новые `websockets` и extras), быстрый гейт. Запись в J
- [X] T012 [US3] F2: `git merge --no-ff origin/feat/011-dds-sasha`, перегенерировать `backend/tests/contract/expected_fields.json` (`uv run python scripts/extract_ts_fields.py`), `npm run test` (синк моков). Быстрый гейт, запись в J. Красные сверять с эталоном T005
- [X] T013 [US3] F3: `git merge --no-ff origin/SASHA`. Разрешить 6 конфликтов: `.ai/SESSIONS.md` (объединить по дате), `.ai/SESSION_STATE.md` (HEAD + уникальное SASHA), `backend/app/api/v1/__init__.py` (оба роутера `problem_reports` и `student_cards`). simulator-bar — задача T014. Запись в J
- [X] T014 [US3] F3 (P5, R7): в `src/widgets/simulator-bar/{index.ts,ui/SimulatorBar.tsx,ui/SimulatorBar.module.css}` оставить один механизм слота (Portal из SASHA или Slot из dds-sasha, выбрать по коду: меньше правок потребителей). Перевести `src/pages/operator112/ui/Operator112Session.tsx` и `src/pages/incident/ui/TrainerNorms.tsx`, сохранить `ReferenceToggle` справа. Тесты обеих сторон зелёные
- [X] T015 [US3] F3: `expected_fields.json` перегенерировать, `uv run alembic heads` (ожидается одна: `0007_problem_reports`), быстрый гейт + `npm run build` (гейт кластера). Запись в J

**Checkpoint**: кластер ДДС в интеграционной ветке, гейт зелёный или красное объяснено.

---

## Phase 5: User Story 4 — решения по дублям данных (P2)

**Goal**: решение владельца по P1 до слияния кластера seva.

**Independent Test**: в J записано решение В1 с датой; после T020 у пользователя один источник специализации.

- [X] T016 [US4] Подготовить для владельца сводку P1 на один экран (R5): обе модели, демо-учётки (ivanov, egorov, u-005, u-006, u-016, u-017), что теряется в каждом варианте. Положить в J, раздел «Решения», и задать вопрос В1. **Ждать ответа** перед T018

---

## Phase 6: User Story 3 + 5 — кластер seva и миграции (P1/P2)

**Goal**: K7+K9, затем K8 влиты; удаления K3 и правки seva сведены; одна голова alembic.

**Independent Test**: `git rev-list --no-merges --count HEAD..origin/fix/ai-connection-probe-timeout` = 0 и `HEAD..origin/codex/feature-007-learner-role-split` = 0; `uv run alembic heads` → одна; `test_alembic.py` зелёный.

- [X] T017 [US3] F5: пробный `git merge-tree --write-tree HEAD origin/fix/ai-connection-probe-timeout`, сохранить список конфликтов в J и разбить его на группы: бэкенд роли, бэкенд прочее, фронт роли, окно 112, точки регистрации, документы. Субагент Opus (medium) — анализ сторон по каждой группе, read-only
- [X] T018 [US4] F5: `git merge --no-ff origin/fix/ai-connection-probe-timeout`. Группа «роли» — по решению В1: одна модель в `backend/app/models/user.py`, `backend/app/api/compat/admin_users.py`, `backend/app/services/{assignment_service,attempts,chain_service}.py`, `backend/app/seed/load.py`, `src/shared/api/types/user.ts`, `src/app/layouts/*`, `spec/000-фронт/mocks/users.json`
- [X] T019 [US3] F5 (P4, R6): модификация против удаления. Принять удаления `src/widgets/operator112-softphone/ui/*`, `src/features/operator112-questionnaire`, `Operator112Workspace.tsx`. Правки seva в них перенести в новую реализацию `src/pages/operator112`, `src/widgets/operator112-*` или записать в J как отброшенные с причиной. `app/arm/(section)/operator112/layout.tsx` и `phone/layout.tsx` перенести в `app/arm/(operator112)/`. `backend/tests/integration/{test_ai_chain,test_seed_chain_demo}.py` удалить только после проверки, что сценарий покрыт другим тестом
- [X] T020 [US3] F5: остальные конфликты по списку T017 (ожидаемо: `backend/app/services/{operator112_service,recommendation_service,report_builder}.py`, `backend/app/api/v1/{__init__,operator112,recommendations}.py`, `backend/app/schemas/{admin,v1/operator112}.py`, `src/features/assignment-create/*`, `src/pages/{admin-users,student/assignments,teacher/students,teacher-report-session}`, `src/shared/api/types/{index,operator112,requests}.ts`, `src/widgets/platform-nav/*`, `src/widgets/simulator-bar/*`) — по содержимому обеих сторон, каждый файл в таблицу J
- [X] T021 [US5] F5: `cd backend && uv run alembic merge --rev-id 0011_merge_sasha_seva -m "merge sasha and seva heads" 0007_problem_reports 0010_ai_request_started_at` → новый файл в `backend/alembic/versions/`. Если по В1 колонка становится лишней — отдельная ревизия переноса данных после merge-ревизии. Затем `uv run alembic heads` → одна
- [X] T022 [US3] F5: `uv lock` (openpyxl), `expected_fields.json`, быстрый гейт и `npm run build`. Красные сверять с эталоном T005. Запись в J
- [X] T023 [US3] F5: `git merge --no-ff origin/codex/feature-007-learner-role-split`. Конфликт `src/pages/student/results/ui/StudentResults.test.tsx` — оставить оба describe (чат 020 и нормативы T053). Правки 971261d в удалённых или переименованных файлах — по правилу T019. Быстрый гейт, запись в J
- [X] T024 [US4] Проверить SC-005 на слитом дереве: демо-учётки обеих специализаций входят в свои зоны и получают отказ в чужих (`scripts/e2e-student.sh`, `scripts/e2e-teacher.sh`, `scripts/e2e-admin.sh` на свежем `next start -p 3130`). Результат в J

**Checkpoint**: кластеры ДДС и seva слиты, одна голова миграций.

---

## Phase 7: User Story 3 + 5 — конструкторы (P1/P2)

**Goal**: K10 и K11 влиты, оба конструктора работают на своих роутах (Q2, R8).

**Independent Test**: `HEAD..origin/claude/gracious-darwin-x0znyd` = 0, `HEAD..origin/feature/scenario-graph-builder` = 0; `/teacher/constructor` и вкладка «Граф» открываются; одна голова alembic.

- [X] T025 [US3] F6: `git merge --no-ff origin/claude/gracious-darwin-x0znyd` (это коммиты 8c992c6, без незакоммиченной spec/021). Конфликты: `.ai/*`, `AGENTS.md` (§3: слайсы и роуты обеих сторон), `spec/README.md` (все строки), `src/widgets/platform-nav/{config/navItems.ts,index.ts,ui/PlatformFrame.tsx}` (пункты «Конструктор» и «Сводная успеваемость», режим workspace). Быстрый гейт, запись в J
- [X] T026 [US3] F7: `git merge --no-ff origin/feature/scenario-graph-builder`. Конфликты: `backend/app/api/v1/__init__.py`, `backend/app/models/{ai_scenario,user}.py` (добавить `permissions` к модели из В1), `backend/app/services/{ai_scenario_service,scenario_service}.py`, `backend/scripts/run_frontend_e2e.sh`, `backend/tests/integration/test_alembic.py`, `src/features/assignment-create/*`, `src/features/scenario-builder/config/dictionaries.ts`, `src/shared/api/{index,endpoints/index,types/index,types/scenario}.ts`, `src/widgets/platform-nav/config/navItems.test.ts`, `.ai/LESSONS.md` (уроки L014–L017 второй стороны получают следующие свободные номера). Запись в J
- [X] T027 [US5] F7: `uv run alembic merge --rev-id 0012_merge_scenario_graph -m "merge scenario graph head" <текущая голова> 0009_scenario_run_result`, `uv run alembic heads` → одна. `expected_fields.json`, быстрый гейт и `npm run build`. Запись в J

**Checkpoint**: все вливаемые куски в интеграционной ветке.

---

## Phase 8: User Story 2 — единый реестр фич (P1)

**Goal**: уникальные номера фич (R2), ссылки исправлены.

**Independent Test**: `ls spec | cut -c1-3 | sort | uniq -d` пусто; каждая ссылка «спека NNN» / `spec/NNN-` указывает на существующую папку с тем же смыслом.

- [X] T028 [US2] Одним коммитом `git mv` 8 папок по таблице R2: 005-visual-scenario-builder→013, 005-live-caller→014, 005-scenario-graph-builder→015, 005-arm-reference-panel→016, 006-student-rating→017, 008-operator112-student→018, 007-learner-role-split→019, 010-ai-chat-assistant→020. В каждой README/spec первой строкой «прежний номер NNN, ветка X»
- [X] T029 [US2] Найти ссылки на старые номера (`grep -rnE "spec/0(05|06|07|08|10)-|спек[аиуе] 0?(05|06|07|08|10)\b|фич[аиуе] 0?(05|06|07|08|10)\b"` по `src app backend e2e scripts docs spec AGENTS.md .ai`) и исправить те, что указывают на перенумерованные фичи. Ссылки на сохранённые 005/006/007/008/010 не трогать. Субагент Haiku (xhigh) — сбор списка, правки и проверку смысла делает интегратор
- [X] T030 [US2] Переписать spec/README.md: 000–021, по каждой фиче исходная ветка, прежний номер, статус задач из её tasks.md без пересчёта
- [X] T031 [US2] Быстрый гейт после перенумерации (ссылки в тестах), запись в J

---

## Phase 9: User Story 6 — финал и передача (P3)

**Goal**: документы описывают слитую систему, полный гейт записан, отчёт владельцу.

**Independent Test**: каждое утверждение отчёта подтверждено командой с датой; отложенное названо.

- [X] T032 [US6] Обновить `AGENTS.md`: §2 (по решению В2), §3 (слайсы, роуты, миграции 0006–… с merge-ревизиями, число тестов не копировать), дрейф `mocks/` (в `.gitignore`, не закоммиченная копия)
- [X] T033 [US6] Обновить `.ai/SESSION_STATE.md` (перезапись), `.ai/SESSIONS.md` (дописать), `.ai/LESSONS.md` (уроки слияния), `.ai/PROJECT_MAP.md` — формат DenseCode (skill densecode)
- [X] T034 [US6] Полный гейт (quickstart.md, «Финальный гейт»): `npm run check`, `npm run mocks:validate`, `backend/scripts/run_frontend_e2e.sh`, `npm run e2e` (L015, L017). Числа и дата — в J и `docs/FINAL-GATE.md`. Непрогнанное — с командой и причиной
- [X] T035 [US6] Проверка полноты (quickstart.md, SC-001/SC-002) и итоговый отчёт в J: что влито, что отложено (K12, открытые задачи фич, 5 критических дефектов аудита 008), вопросы В2–В5, от какой точки продолжать каждому автору (SC-007)
- [ ] T036 [US6] Ревью финального диффа против `origin/main` (skill code-review), без `.env`, `backend/var/`, `.next/`, `public/icons/`, отчётов Playwright. Push интеграционной ветки и слияние в main — только по прямой просьбе владельца (FR-017)

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T006) → US1 (T007–T010) → US3 ДДС (T011–T015) → US4 решение В1 (T016, ждёт владельца) → US3/US5 seva (T017–T024) → конструкторы (T025–T027) → US2 перенумерация (T028–T031) → US6 (T032–T036).
- Порядок F1→F7 жёсткий (R4): каждый merge строится на предыдущем.
- T016 можно подготовить сразу после T004, но T018 без ответа В1 не начинается. F1–F3 и US1 от В1 не зависят.
- US2 идёт после всех слияний, чтобы переименования не пересекались с конфликтами (R2).

## Parallel Opportunities

- T005 и T006 параллельны (разные worktree, только чтение и прогоны).
- T008, T009, T010 параллельны (read-only сверки).
- T016 (сводка для владельца) параллельна T011–T015.
- Внутри шагов слияния параллелизма нет: один писатель на дерево (R11).

## Implementation Strategy

- **MVP**: Phase 1–3 (карта и эталон), без единого слияния. Уже это даёт владельцу полную картину и вердикты.
- **Инкремент 1**: кластер ДДС (Phase 4): конфликты почти только текстовые, проверяет механику журнала.
- **Инкремент 2**: после ответа В1 — кластер seva (Phase 6), самый рискованный.
- **Инкремент 3**: конструкторы и перенумерация, затем финал.
- Остановка в любой точке оставляет интеграционную ветку согласованной: каждый шаг заканчивается зелёным гейтом или откатом (`git revert -m 1 <merge>`).
