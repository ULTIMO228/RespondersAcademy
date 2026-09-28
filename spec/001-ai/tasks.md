# Задачи: локальный ИИ-контур тренажёра 112/ДДС

**Основа**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [ai-workflow.md](ai-workflow.md), [контракт v1](contracts/ai-workflow-v1.md), [сценарии проверки](quickstart.md).  
**Порядок**: подготовка → общие контракты → полный цикл `operator112` → полный цикл `dds` с передачей сохранённой карточки A→B → оценка и реестр → US5; US3 и сквозная проверка завершают выпуск. Номера US сохраняют нумерацию спецификации; P1 выполняются до P2.  
**Правило данных**: только синтетические и проверенные обезличенные материалы. Работа занятия не зависит от внешней сети. Существующие `/api/mock/*` и `src/shared/api/types/*` сохраняют форму.

## Фаза 1. Подготовка существующего контура

**Цель**: устранить дрейф путей к перенесённым мокам и зафиксировать исходное состояние контрактов. T001–T002 обходятся без новых зависимостей; T003 использует dev-only JSON Schema validator.

- [X] T001 Перенести все исполняемые чтения `spec/mocks` на `spec/000-фронт/mocks` в `backend/app/seed/load.py`, `backend/ml/classify/ekp_group_classifier.py`, `backend/ml/generate/scenario_generator.py`, `backend/ml/scripts/build_labeled.py`, `backend/ml/scripts/build_labeled_operator112.py`, `backend/ml/scripts/build_labeled_tickets.py`, `backend/ml/scripts/build_domain_words.py`, `backend/ml/scripts/eval_assessor.py` и `backend/tests/unit/test_*.py`; сохранить `mocks/local` и `mocks/admin`.
- [X] T002 Проверить пути подготовки данных отдельным регрессионным тестом для `SeedPaths` и генератора в `backend/tests/unit/test_seed_paths.py`; неверный корень должен явно давать ошибку, а существующие сиды — читаться. Проверено pytest вместе с контрактными тестами 2026-09-23.
- [X] T003 Зафиксировать четыре полных контракта `scenario.schema.json`, `event.schema.json`, `evaluation-state.schema.json`, `report.schema.json` из `spec/001-ai/contracts/` и совместимость прежнего `Evaluation` из `specs/002-two-mode-simulator/contracts/evaluation.schema.json` в `backend/tests/contract/test_ai_compatibility.py`; новые примеры и живой ответ старого API проходят валидацию без правки снимков.

## Фаза 2. Общая основа

**Цель**: единые версии, роли и состояние оценки для всех историй. Эта фаза блокирует новые endpoint'ы.

- [X] T004 Добавить общие Pydantic-схемы новых ресурсов в `backend/app/schemas/v1/ai.py`: `schemaVersion="ai-workflow/1"`, `mode: operator112 | dds`, версии сценария/эталона/оценщика и `modelReleaseId: null` при отсутствии LLM; валидировать enum и обязательные поля по `spec/001-ai/contracts/ai-extension.schema.json`.
- [X] T005 Добавить таблицы версий сценария, эталона, решений по полям и реестр утверждённых `SanitizedTicket` в `backend/app/models/ai_scenario.py` и экспорт в `backend/app/models/__init__.py`: хранить `sourceHash`, автора/время очистки и `createdBy` только из Viewer; ORM и SQLite запрещают изменение/удаление утверждённой версии, `init_db` идемпотентно ставит guards на существующую SQLite-базу. Guards PostgreSQL добавляются Alembic T109.
- [X] T006 Добавить таблицы `AssessmentJob`, `EvaluationRevision`, `SemanticReview` и `ErrorRecord` в `backend/app/models/ai_assessment.py` и экспорт в `backend/app/models/__init__.py`: одна активная задача (`queued|running`) на `attemptId+baseRevision`, четыре оси, append-only ревизии, проверка осей и `totalScore` на ORM/DB-границе, уникальность ошибки по `attemptId+ruleId+evidenceKey+etalonVersion`. Guards PostgreSQL добавляются Alembic T109.
- [X] T007 Реализовать строгий серверный доступ к попытке, сценарию и занятию по подписанной сессии в `backend/app/api/v1/ai_access.py`; новые маршруты дают 401 без сессии, 403 для чужого ресурса и не доверяют `teacherId` из тела. Студент получает доступ к сценарию только через назначение, созданное авторизованным преподавателем; доступ к занятию для студента включается только внутри проверки собственной попытки.
- [X] T008 Зарегистрировать реальные модули AI-маршрутов `/api/v1/ai/*` по мере реализации T014/T024/T030, без пропуска отсутствующих модулей; подтвердить HTTP-тестами 401/403/404 для обоих режимов. Проверки helper'ов в `backend/tests/contract/test_ai_access.py` не закрывают регистрацию маршрутов.

## Фаза 3. US1 — сценарий и эталон под контролем преподавателя (P1, первый MVP)

**Результат**: преподаватель получает вариацию, правит поля, проверяет и утверждает конкретную версию; курсант получает только утверждённое.  
**Независимая проверка**: один очищенный билет → черновик → частичная правка → проверка → утверждение; отклонённый код и черновик недоступны студенту, A→B переносит карточку с версией.

- [X] T009 [US1] Сначала описать контрактные сценарии draft/revise/approve/versions, повтора `requestId`, устаревшей `baseVersion`, доступа студента, отказа неочищенному источнику и происхождения сохранённой карточки A→B в `backend/tests/contract/test_ai_scenarios.py` и `backend/tests/integration/test_ai_chain.py`.
- [X] T010 [US1] Реализовать единый gate утверждённого `SanitizedTicket` в `backend/ml/source_gate.py` и использовать его в `backend/ml/generate/scenario_generator.py`: вариация из разрешённых `sourceTicketId`/`sourceSituationNo`, локальный шаблонный резерв; ни одна модель или генератор не получает исходный скан, код ЕКП/адрес/действия берутся из справочника и эталона.
- [X] T011 [US1] Сохранить `ScenarioVersion` и `EtalonVersion` с `sourceKind`, `cardSnapshot`, `semanticFacts`, `ruleSourceIds`, `classifierVersion` в `backend/app/services/scenario_service.py`; каждое обязательное действие ссылается на билет/ЕКП/памятку/решение команды, утверждённая версия неизменяема.
- [X] T012 [US1] Реализовать частичное принятие `acceptedFields[]`, комментарий и новую версию вместо правки утверждённой в `backend/app/services/ai_scenario_review.py`; черновик не публикуется.
- [X] T013 [US1] Реализовать структурную проверку кода, адреса, порядка действий и допустимости профиля ДДС в `backend/ml/generate/validator.py`; возвращать точную причину отказа, не принимать выдуманный моделью код ЕКП.
- [X] T014 [US1] Добавить `POST drafts`, `POST revise`, `POST approve`, `GET versions` в `backend/app/api/v1/ai_scenarios.py` с проверкой `count` от 1 до 5, gate источника до генерации, идемпотентным `requestId`, 409 на устаревшую версию и аудитом автора.
- [X] T015 [US1] На переходе A→B читать именно карточку, **сохранённую студентом** в режиме `operator112`, через `backend/app/services/operator112_service.py` и `backend/app/services/assignment_service.py`; создать вход `dds` в `backend/app/services/scenario_service.py` с `sourceAttemptId`, `sourceCardId`, `sourceCardVersion`, неизменным содержимым и тем же доменным ID. Требовать подтверждение применимости ДДС до выдачи; доказать тестом, что преподавательский `cardSnapshot` не подменяет результат студента.
- [X] T016 [US1] Подключить новые операции через `src/shared/api/endpoints/scenarios.ts` и типы в `src/shared/api/types/scenario.ts`; существующие вызовы мок-генерации остаются совместимыми.
- [X] T017 [US1] Показать версии, решения по полям, ошибки валидации и кнопку утверждения только преподавателю в `src/pages/teacher-scenario-editor/ui/ScenarioEditorScreen.tsx`; проверить сценарий в `src/pages/teacher-scenario-editor/ui/ScenarioEditor.test.tsx`.

## Фаза 4. US2 — проверяемая оценка карточки (P1)

**Результат**: попытка сохраняется до медленной семантики, четыре оси доступны отдельно, спор передаётся преподавателю, его решение окончательно.  
**Независимая проверка**: верный парафраз, неверный адрес, пропущенный статус, отсутствие эталона и сбой LLM; проверенный компонент остаётся, неизвестный общий балл отсутствует.

- [X] T018 [US2] Сначала покрыть `pending → preliminary|review_required → final`, запрет поздней перезаписи, повторы и отказ LLM в `backend/tests/contract/test_ai_assessment.py` и `backend/tests/unit/test_ai_semantic.py`.
- [X] T019 [US2] Расширить `backend/ml/assess/engine.py` и `backend/ml/assess/adapter.py` отдельными осями времени, корректности, грамматики и смысла для `operator112|dds`; проверять время, адрес, факты и статусы по событиям, не по объяснению LLM.
- [X] T020 [US2] Калибровать и версионировать границу спорной семантики на размеченной выборке в `backend/ml/assess/components/semantic.py` и `backend/ml/scripts/eval_assessor.py`; не выбирать числовой порог по holdout.
- [X] T021 [US2] Добавить порт `resolve_semantic_dispute` в `backend/app/ai_gateway.py` по `spec/001-ai/contracts/semantic-review-v1.schema.json`: передавать только очищенный текст, разрешённые `referenceFactIds`, режим и версии; принимать `decision`, `referenceFactIds`, `explanation` со ссылками лишь на переданные факты; timeout/невалидный ответ → `uncertain`.
- [X] T022 [US2] Сохранять попытку и `AssessmentJob` до запуска второго эшелона в `backend/app/services/evaluation_service.py`; ключ задачи — `attemptId+baseRevision`, ограниченная очередь не блокирует следующую карточку или завершение занятия.
- [X] T023 [US2] Сохранять `EvaluationRevision` и `SemanticReview` в `backend/app/services/ai_assessment.py`: четыре оси, версии и причина ручной проверки; `totalScore` лишь при известных применимых осях, поздний результат не меняет `final`.
- [X] T024 [US2] Реализовать `assessment-state`, `review`, `resolve` в `backend/app/api/v1/ai_assessments.py` и переиспользовать транзакционный путь `backend/app/services/evaluation_service.py`: `expectedRevision`, `requestId`, непустая причина, атомарные `TeacherOverride` + `CalibrationSample` + аудит; поздний ответ LLM не меняет `final`. Старый готовый `Evaluation` возвращать только при `preliminary|final`; покрыть повтор и rollback тестом.
- [X] T025 [US2] Доставлять преподавателю `attemptId+revision` по существующему каналу занятия в `backend/app/services/session_engine.py`, не удваивая оценку при повторном уведомлении.
- [X] T026 [US2] Добавить методы состояния и разбора в `src/shared/api/endpoints/training.ts`, типы в `src/shared/api/types/attempts.ts`; экран `src/pages/teacher-monitor/ui/MonitorScreen.tsx` показывает новое поступление, экран `src/pages/progress/ui/ProgressPage.tsx` показывает своему курсанту «Предварительно» или ожидание без фиктивного балла.

## Фаза 5. US4 — полный учёт обнаруженных ошибок (P1)

**Результат**: каждая доказанная причина хранится отдельно, групповые числа воспроизводятся по ID ошибок.  
**Независимая проверка**: одна попытка с просрочкой, неверным адресом и пропущенным статусом даёт три записи; повторная доставка не создаёт дубль, пустое занятие даёт нули.

- [X] T027 [US4] Сначала покрыть матрицу ошибок двух режимов, дедупликацию и сверку групповых чисел в `backend/tests/unit/test_ai_error_registry.py` и `backend/tests/contract/test_ai_errors.py`.
- [X] T028 [US4] Преобразовать проверки `backend/ml/assess/rules.py` и `backend/ml/assess/adapter.py` в `ErrorRecord` с `severity: critical|major|minor`, `fieldPath?`/`eventId?`, `observed`, `sourceRef`, `detector: rule|ml|llm_confirmed|teacher`, `etalonVersion`, `assessorVersion`, `fixed`; не превращать неопределённость LLM в ошибку.
- [X] T029 [US4] Сохранять канонический ID по `attemptId+ruleId+evidenceKey+etalonVersion`, объединять совпадение правила и LLM в `backend/app/services/ai_error_registry.py`; ручная запись сохраняет `teacherId`.
- [X] T030 [US4] Добавить `GET sessions/{id}/errors`, `GET sessions/{id}/error-summary` и `GET me/errors` в `backend/app/api/v1/ai_errors.py` с фильтрами `mode?`, `studentId?`, `type?`, `severity?`, `cursor?` и строгой изоляцией ролей.
- [X] T031 [US4] Строить `SessionReport.errorCounts`, `attemptIds`, `modeBreakdown`, `effectiveScores`, `reviewPendingCount` только из сохранённых записей в `backend/app/services/report_builder.py`; каждая частота содержит ID исходных ошибок, пустой отчёт не придумывает тенденции.
- [X] T032 [US4] Подключить единые агрегаты к экрану и экспорту CSV/PDF в `src/pages/teacher-report-session/ui/ReportSessionScreen.tsx` и `backend/app/api/v1/reports_export.py`; своё множество ошибок показывать курсанту через `src/pages/progress/ui/ProgressPage.tsx`.

## Фаза 6. US5 — проверенный выпуск ИИ-версии (P1, внутренний контур)

**Результат**: LangGraph-конвейер готовит разрешённые примеры сильной моделью, независимо проверяет оба ответа, оценивает промпт и выпускает модель только после контроля; базовый оценщик и шаблонный путь работают без неё.  
**Независимая проверка**: очистить синтетический билет, возобновить граф после ручной остановки без дубля вызова, разделить по исходным билетам, сравнить ответы независимым судьёй и правилами, повторить prompt-eval ≥3 раза, отклонить регрессию на закрытом holdout.

- [X] T033 [US5] Сначала добавить тесты общего `SanitizedTicket` gate, группового разделения, идемпотентного возобновления LangGraph, judge другой модельной семьи либо обязательного человека при совпадении, трёх повторов prompt-eval и отказа релиза в `backend/tests/unit/test_ai_dataset.py`, `backend/tests/unit/test_ai_pipeline.py`, `backend/tests/unit/test_ai_prompt_eval.py` и `backend/tests/unit/test_ai_release.py`.
- [X] T034 [US5] Проверить совместимые версии и добавить `langgraph`, `langchain-core`, локальный LangChain-адаптер и durable checkpointer в отдельную группу подготовки `backend/pyproject.toml` и `backend/uv.lock`; зафиксировать smoke импортов и локального вызова в `backend/tests/integration/test_ai_model_adapters.py`, без облачной телеметрии.
- [X] T035 [US5] Версионировать system prompt, рубрику независимого судьи и профиль рассуждения в `backend/ml/prompts/semantic_review_v1.md`, `backend/ml/prompts/judge_v1.md` и `backend/ml/prompts/manifest.json`; сохранить hashes текста и chat template, запретить правку утверждённой версии.
- [X] T036 [US5] Описать типизированное состояние и LangGraph-узлы в `backend/ml/pipeline/graph.py`, `backend/ml/pipeline/state.py`: локальный durable checkpoint, стабильный `thread_id`, `interrupt()` перед человеческим решением и идемпотентность `runId+node+inputHash+promptVersion`.
- [X] T037 [US5] Подключить общий `backend/ml/source_gate.py` к `backend/ml/pipeline/sanitize.py`: `sourceTicketId`, `situationNo`, `sanitizedText`, `piiCheck`, `reviewerId`, `reviewedAt`, `sourceHash`; без `piiCheck=passed` и человеческого утверждения ни генерация сценария, ни выборка, ни какая-либо модель не получают содержимое.
- [X] T038 [US5] Назначать train/validation/holdout целиком по `sourceTicketId` **до генерации** в `backend/ml/pipeline/split.py`; исключить доступ генератора, judge-подбора и настройки промпта к holdout, проверить оба режима.
- [X] T039 [US5] Подключить исходную локальную модель через LangChain chat adapter в `backend/ml/pipeline/models.py` и узел `baseline_small_model` в `backend/ml/pipeline/graph.py`; сохранять ответ, параметры, версию инструкции и краткое проверяемое основание без raw chain-of-thought.
- [X] T040 [US5] Добавить узел `teacher_generate` в `backend/ml/pipeline/graph.py` и адаптер выбранной сильной модели в `backend/ml/pipeline/models.py`: несколько исправленных и контрастных примеров по очищенной синтетике; данные экранировать как недоверенный ввод, внешняя передача выключена до явной конфигурации разрешённого канала.
- [X] T041 [US5] Проверять схему, ПДн, допустимые коды ЕКП/адреса/статусы, ссылки на эталон, дубли, циклы и обрывы в `backend/ml/pipeline/checks.py`; отклонённый кандидат не попадает в выборку.
- [X] T042 [US5] Реализовать LLM-судью в `backend/ml/pipeline/judge.py` по `spec/001-ai/contracts/judge-review-v1.schema.json`: отдельно оценивать исходный и исправленный ответы, скрывать вердикт генератора, проверить все fact/error ID. Для независимого подтверждения использовать иную модельную семью; при совпадении каждый пример требует человека. Критические и спорные случаи всегда требуют человека.
- [X] T043 [US5] Реализовать `human_adjudication` через checkpoint/interrupt в `backend/ml/pipeline/graph.py` и журнал решений в `backend/ml/pipeline/review.py`: спорные и критические случаи нельзя принять автоматически, повторное resume не удваивает пример или вызов модели.
- [X] T044 [US5] Собрать `TrainingExample` с происхождением, `baseOutput`, `teacherCandidate`, `correctedOutput`, `judgeReviewId`, `humanDecisionId?`, метками и проверками в `backend/ml/scripts/prepare_ai_dataset.py`; принятые файлы версионировать, raw reasoning и личные данные не экспортировать.
- [X] T045 [US5] Реализовать eval системных промптов в `backend/ml/scripts/eval_ai_prompts.py`: фиксированный набор, минимум три повтора каждого случая, полный manifest модели/рантайма/chat template/seed/параметров, все ответы, метрики точности, критических пропусков, ложных ошибок и разброса; контроль русских терминов/сокращений в обоих режимах; holdout закрыт до финального выпуска.
- [X] T046 [US5] Проверить thinking/non-thinking и runtime-specific ограничения в `backend/ml/pipeline/reasoning.py`: max tokens, timeout, streaming stop при повторе/цикле; измерить обрывы и задержку, не считать `/think`/`/nothink` официальным API Qwen3.5-0.8B.
- [X] T047 [US5] Провести локальный baseline и smoke точной ревизии Qwen3.5-0.8B с выбранным рантаймом в `backend/ml/scripts/eval_ai_release.py`; записать JSON-валидность, завершение и критические ошибки отдельно по режимам.
- [X] T048 [US5] Выполнить пилот QLoRA только после проверки памяти и выгоды против baseline в `backend/ml/scripts/train_ai_adapter.py`; сохранить конфигурацию и hashes, при недоступности оборудования зафиксировать отказ от обучения без ложного релиза.
- [X] T049 [US5] До доступа к holdout заполнить и утвердить манифест по `spec/001-ai/release-gates.md`: состав и hash групп, числовой CPU-бюджет, baseline, версии, знаменатели и пороги. Затем сравнить кандидата с baseline/предыдущим релизом по обоим режимам на замороженном holdout и CPU p50/p95/TTFT/RAM в `backend/ml/scripts/eval_ai_release.py`; незаполненный gate или регрессия означает `rejected`.
- [X] T050 [US5] Реализовать manifest `ModelRelease` и проверку `candidate → accepted|rejected → archived` в `backend/ml/release.py`: hashes базы/адаптера/датасета/промпта/артефакта, версии рантайма/chat template, `evalRunId`, `diskBytes`; активна только `accepted`.
- [X] T051 [US5] Подключать лишь принятый локальный manifest в `backend/app/ai_gateway.py`, сохранять `modelReleaseId` в оценке и оставлять проверяемый резерв без LLM; не менять оценки прошлых попыток при смене версии.


## Фаза 7. US3 — проверка ручного текста (P2)

**Результат**: замечания к текущей версии текста с полем и фрагментом, без автоматической правки и без LLM.  
**Независимая проверка**: опечатка, допустимое сокращение, неизвестная улица, пустой текст и повтор после правки.

- [ ] T052 [US3] Сначала покрыть русские учебные термины, адреса, сокращения, пустой ввод и повторную проверку в `backend/tests/unit/test_nlp.py` и `backend/tests/contract/test_ai_grammar.py`.
- [ ] T053 [US3] Расширить локальные словари и осторожную проверку адреса в `backend/ml/nlp/grammar.py` и `backend/data/domain_words.txt`: неизвестное слово не считать ошибкой без основания, не исправлять исходный текст автоматически.
- [ ] T054 [US3] Сохранить контракт `POST /api/mock/grammar-check`, привязать замечание к полю/фрагменту и текущей версии сценария в `backend/app/api/compat/grammar.py` и `backend/app/services/scenario_service.py`.
- [ ] T055 [US3] Показать повторную проверку после преподавательской правки в `src/pages/teacher-scenario-editor/ui/ScenarioEditorScreen.tsx` и проверить в `src/pages/teacher-scenario-editor/ui/ScenarioEditor.test.tsx`.


## Фаза 8. Сквозная проверка и документация

- [ ] T056 Проверить идемпотентность, 401/403/404/409/422, отсутствие необоснованного балла, изоляцию ролей, происхождение сохранённой карточки A→B и регрессию звонка B→C с утверждённой репликой/транскриптом по `spec/001-ai/quickstart.md` в `backend/tests/integration/test_ai_workflow.py`.
- [ ] T057 Проверить 20 одновременных сдач без потерь и снять фактические CPU p50/p95, TTFT, RAM и timeout в `backend/ml/scripts/eval_ai_release.py`; не менять числовые пороги по результату holdout.
- [ ] T058 Выполнить `uv run pytest -q` и `uv run ruff check .` в `backend/`, затем `npm run check`, `npm run test` и релевантный Playwright-сценарий; зафиксировать точные результаты в `spec/001-ai/quickstart.md`.
- [ ] T059 Обновить реестр и пользовательскую документацию фактического поведения в `spec/README.md`, `backend/README.md` и `README.md`; отдельно указать принятый релиз, измеренные ограничения CPU и резервный путь.
- [ ] T060 Записать демонстрационный скринкаст длительностью не более 5 минут по полному циклу `operator112 → dds → оценка → решение преподавателя → отчёт` в `docs/demo.mp4`; обновить фактический gate в `docs/FINAL-GATE.md` и убедиться, что запись не содержит ПДн.

## Фаза 9. Датасет дообучения смыслового разбора (US5, подготовка вне обучения)

**Результат**: упакованный версионированный набор `ai-semantic-review` (чат-JSONL train/validation/holdout, manifest, datasheet) для обучения Qwen3.5-0.8B на другом оборудовании; решения и ограничения — [dataset-spec.md](dataset-spec.md).  
**Независимая проверка**: `ml.dataset.validate` без жёстких ошибок, каждый принятый пример разобран, выборка человека просмотрена, `ml.dataset.pack` собирает выпуск и zip.

- [X] T061 [US5] Сначала покрыть тестами подмену ПДн, разбиение без утечки по `duplicateOf`, баланс меток плана и валидатор в `backend/tests/unit/test_ai_dataset_build.py`.
- [X] T062 [US5] Расширить реестр `SanitizedTicket` до 32 билетов с подменой ФИО, дат рождения и госномеров в `backend/ml/scripts/build_sanitized_tickets.py`, `backend/ml/dataset/identities.py`; утверждение человеком.
- [X] T063 [US5] Реализовать план датасета с истинными метками и рецептами в `backend/ml/dataset/plan.py`, `backend/ml/dataset/facts.py`; инструкция агенту — `backend/data/ai_dataset/v1/AGENT_BRIEF.md`.
- [X] T064 [US5] Сгенерировать тексты и объяснения агентами Haiku для train и validation, затем отдельно для закрытого holdout после заморозки состава (плюс 42 неопределённых примера, написанных Claude вручную).
- [X] T065 [US5] Реализовать детерминированный валидатор и материалы разбора в `backend/ml/dataset/validate.py`, `backend/ml/dataset/review.py`.
- [ ] T066 [US5] Смысловой разбор Claude выполнен по всем примерам, отклонённые перегенерированы (4 прохода); осталось просмотреть человеку выборку `backend/data/ai_dataset/v1/reviews/human-sample.md` (67 примеров) и исключить отклонённые.
- [X] T067 [US5] Реализовать упаковку выпуска и manifest в `backend/ml/dataset/pack.py`.
- [ ] T068 [US5] Выпуск `v1` собран (762 примера, zip в `backend/var/ai_dataset/`); критерии [dataset-spec.md](dataset-spec.md) §7 выполнены, кроме выборки человека: после просмотра пересобрать `ml.dataset.pack`.

## Зависимости и возможность параллельного выполнения

```text
T001–T003 → T004–T008 → US1 (T009–T017)
                                 ↓ gate: полный operator112, затем dds и сохранённая карточка A→B
                          US2 (T018–T026) → US4 (T027–T032)
                                 ↓ gate: проверяемая оценка и отчёт двух режимов
                          US5 (T033–T051)
US3 (T052–T055) после общего ядра; все истории → T056–T060
```

US2 использует существующий утверждённый эталон, но переход к нему требует доказанного полного цикла обоих режимов и A→B. US4 использует ревизии оценки US2. US5 начинается после готового демонстрируемого ядра; подготовка графа и датасета не обходит общий gate очистки. Внутри историй сначала выполняются тестовые задачи, затем код.

**План первого выпуска**: после общей основы завершить US1 и закрыть полный цикл первого, затем второго режима с передачей сохранённой карточки. US2 и US4 дают проверяемую оценку и реестр на существующем ML-пути. Лишь затем строится US5. Кандидат Qwen включается только после пилота и предзаписанных gates; US3 улучшает локальную проверку текста. Выпуск завершают сквозная проверка и скринкаст.
