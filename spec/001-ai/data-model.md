# Модель данных фичи 001

Документ описывает расширения к `specs/002-two-mode-simulator/data-model.md` и действующим моделям `backend/app/models/`. Существующие поля `Scenario`, `Attempt`, `Evaluation`, `TeacherOverride`, `CalibrationSample` не удаляются. Канонические четыре сущности конституции — сценарий, событие, оценка и отчёт; новые вложения описаны в [контракте](contracts/ai-workflow-v1.md).

## Общие правила

- Все документы имеют `schemaVersion`, а сценарий, событие и оценка — `mode: operator112 | dds` (отчёт хранит режим в каждой строке попытки или список режимов для смешанного занятия).
- Идентификатор попытки стабилен при повторах доставки; ссылки на `scenarioVersion`, `etalonVersion`, `assessorVersion`, `modelReleaseId` дают воспроизводимый снимок. Отсутствие LLM обозначается `modelReleaseId: null`, а не фиктивной версией.
- Время событий — UTC timestamp; норматив считается по монотонному времени/сохранённым длительностям и не вычисляется из текста модели.
- Все примеры, логи и объяснения используют только разрешённые обезличенные значения. `rawSourcePath` остаётся локальным указателем карантина. Общий `SanitizedTicket` gate обязателен как для генерации учебного сценария, так и для подготовки датасета.
- Утверждённые `ScenarioVersion` и все `EvaluationRevision` append-only: ORM и SQLite блокируют изменение/удаление; запуск `init_db` идемпотентно устанавливает guards и на существующую SQLite-базу. PostgreSQL trigger DDL должен быть включён в Alembic T109 до запуска фичи на PostgreSQL.

## Сценарий, эталон и версия

| Объект | Поля дополнения | Правила |
|---|---|---|
| `ScenarioVersion` | `scenarioId`, `version`, `mode`, `sourceTicketId`, `sourceSituationNo`, `sourceKind`, `sourceHash`, `createdBy` (внутреннее поле ACL), `sourceAttemptId?`, `sourceCardId?`, `sourceCardVersion?`, `parentVersion?`, `teacherComment?`, `validation`, `approval`, `cardSnapshot`, `etalonVersion` | Версия неизменяема после утверждения. `createdBy` берётся только из проверенной серверной сессии и не принимается из тела запроса. Для обучения доступна только `approval=approved` и `validation=passed`; при `sourceKind=student_card` обязательны три поля происхождения сохранённой карточки. |
| `EtalonVersion` | `id`, `scenarioId`, `mode`, `expectedFields`, `expectedActions`, `semanticFacts`, `ruleSourceIds`, `classifierVersion`, `createdAt` | Каждое обязательное действие имеет ссылку на билет/ЕКП/памятку/решение команды. Модель не вправе создавать код ЕКП вне справочника. |
| `DraftFieldDecision` | `fieldPath`, `decision: accepted|edited|rejected`, `value?`, `teacherId`, `at`, `comment?` | Частичное принятие сохраняется в черновике; не публикует сценарий. |

**Переходы сценария**: `draft → validation_failed | pending_review → approved | rejected`; исправление создаёт новую версию `draft`. `approved` не возвращается в `draft`; новый эталон не меняет оценку уже сданной попытки.

**Связка режимов**: при `operator112 → dds` входом служит именно карточка, **сохранённая обучающимся** в попытке A, а не исходный `cardSnapshot` утверждённого преподавателем сценария. Её поля копируются без ручного переноса и последующей подмены; сохраняются `sourceAttemptId`, `sourceCardId`, `sourceCardVersion` и тот же доменный ID. Эталон и правила ДДС добавляются отдельно. Преподаватель подтверждает применимость ДДС перед выдачей.

## Событие обучающегося

`AttemptEvent`: `id`, `attemptId`, `seq`, `mode`, `kind`, `occurredAt`, `payload`, `cardVersion`. `seq` уникален в попытке; повтор запроса с тем же `id` не создаёт новое действие. Источник времени — серверная фиксация события или подтверждённая синхронизация; клиентский timestamp сам по себе не доказывает норматив. События `operator112`: ответ на запись, заполнение полей, отправка карточки. События `dds`: открытие, решение, смена статуса, комментарий, B→C, завершение. Текст учебного разговора B→C — утверждённая реплика и транскрипт, без свободной LLM-генерации.

## Оценка и решение по смыслу

| Объект | Поля | Правила |
|---|---|---|
| `AssessmentJob` | `attemptId`, `state`, `baseRevision`, `queuedAt`, `completedAt?`, `failureCode?` | Одна активная задача на попытку и ревизию. Сохранение попытки не ждёт LLM. |
| `SemanticReview` | `attemptId`, `fieldPath`, `referenceFactIds`, `reason`, `baseSimilarity?`, `thresholdVersion`, `decision`, `explanation`, `modelReleaseId?`, `validatedAt?` | `decision: equivalent|different|uncertain`. Результат не изменяет норматив, статусы, адрес, арифметику. `uncertain` требует человека. |
| `EvaluationRevision` | `attemptId`, `mode`, `status`, `axes`, `totalScore?`, `errors`, `etalonVersion`, `assessorVersion`, `modelReleaseId?`, `teacherOverride?`, `createdAt`, `revision` | Неизменяемая запись: любое новое вычисление создаёт следующую `revision`. Четыре оси: время, корректность, грамматика, смысл. `totalScore` допустим лишь когда все применимые оси определены. Правка учителя всегда имеет приоритет перед поздней задачей. |

**Переходы оценки**: `pending → preliminary` при вычисленных применимых осях; `pending → review_required` при отсутствующем эталоне/неразрешённой семантике; `preliminary → review_required` при найденном споре; `preliminary|review_required → final` после решения преподавателя; повторный расчёт создаёт новую ревизию и не меняет финальную без явного решения преподавателя. Поздний ответ модели сохраняется как диагностический результат, но не переписывает `final`.

**Совместимость**: действующий `Evaluation` требует числовые `semanticScore` и `totalScore`. Endpoint готовой оценки возвращает его **только** при `preliminary` или `final`; `pending/review_required` отдаются отдельным ресурсом состояния. Нельзя подставлять ноль вместо неизвестного значения.

Решение преподавателя записывает `TeacherOverride`, `CalibrationSample` и аудит одной транзакцией существующего сервиса оценки; идемпотентный повтор не создаёт второй обучающий пример. Поздний ответ LLM остаётся диагностикой и не меняет `final`.

## Запись ошибки и отчёт

`ErrorRecord`: `id`, `attemptId`, `mode`, `ruleId`, `type`, `severity: critical|major|minor`, `evidenceKey`, `fieldPath?`, `eventId?`, `observed`, `expected?`, `sourceRef`, `detector: rule|ml|llm_confirmed|teacher`, `etalonVersion`, `assessorVersion`, `fixed`, `createdAt`, `teacherId?`. `id` детерминируется ключом `attemptId + ruleId + evidenceKey + etalonVersion`, чтобы повторы не удваивали одну причину. Если один и тот же пропуск найден правилом и LLM, канонична запись правила; LLM может добавить объяснение, не вторую ошибку. Неуверенность LLM не создаёт `ErrorRecord`.

`SessionReport`: `sessionId`, `generatedAt`, `attemptIds`, `modeBreakdown`, `errorCounts`, `effectiveScores`, `reviewPendingCount`; каждая агрегированная категория ссылается на ID записей ошибок. Отчёт для обучающегося фильтруется по его `studentId`; учитель видит только своё занятие и разрешённые роли. PDF/CSV используют те же агрегаты, что экран.

## Данные подготовки и выпуск

| Объект | Поля | Проверка |
|---|---|---|
| `SanitizedTicket` | `sourceTicketId`, `situationNo`, `sanitizedText`, `piiCheck`, `reviewerId`, `reviewedAt`, `sourceHash` | Без `piiCheck=passed` и человеческого утверждения билет не попадает ни в сценарный генератор, ни в подготовку выборки, ни в запрос модели. |
| `TrainingExample` | `id`, `sourceTicketId`, `mode`, `promptVersion`, `etalonVersion`, `baseOutput`, `baseReasoningSummary?`, `teacherCandidate`, `correctedOutput`, `correctionReason`, `judgeReviewId`, `humanDecisionId?`, `labels`, `checks`, `split` | Разделение по `sourceTicketId` до вариаций; зацикленный/противоречивый пример исключается. Спорный или критический пример не принимается без решения человека. Хранится краткое проверяемое объяснение, а не необработанный поток мыслей. |
| `ModelRelease` | `id`, `baseModelRevision`, `adapterRevision?`, `runtimeRevision`, `quantization?`, `datasetHash`, `promptVersion`, `evalRunId`, `artifactHash`, `diskBytes`, `status` | `candidate → accepted | rejected → archived`; активировать можно только `accepted`. Результаты holdout, совместимости и CPU-профиля приложены к `evalRunId`. |
| `PromptVersion` | `id`, `task`, `systemPromptHash`, `templateHash`, `rubricVersion`, `createdAt`, `approvedBy?` | Неизменяемый текст инструкции хранится локально. Использование в занятии только после проверки и утверждения. |
| `ReasoningProfile` | `id`, `modelRevision`, `runtimeRevision`, `chatTemplateHash`, `thinkingMode`, `maxOutputTokens`, `timeoutMs`, `repetitionStop`, `validatedAt` | Параметры конкретного рантайма принимаются только после smoke-теста. Сырые reasoning-трейсы не входят в пример и пользовательские логи. |
| `GenerationRun` | `id`, `runId`, `sourceTicketId`, `inputHash`, `promptVersion`, `modelRevision`, `parameters`, `candidateIds`, `status`, `checkpointRef` | Узлы LangGraph идемпотентны по `runId + node + inputHash + promptVersion`; checkpoint содержит очищенные ссылки, а не исходный скан. |
| `JudgeReview` | `id`, `caseId`, `rubricVersion`, `judgeModelRevision`, `judgePromptVersion`, `baseVerdict`, `candidateVerdict`, `evidenceRefs`, `confidence`, `disagreements`, `humanDecisionId?` | Судья проверяет исходный и исправленный ответы отдельно, не видит оценки генератора. Независимое подтверждение требует иной модельной семьи; при совпадении моделей каждый пример решает человек. |
| `PromptEvalRun` | `id`, `promptVersion`, `datasetHash`, `modelRevision`, `quantization`, `runtimeRevision`, `chatTemplateHash`, `parameters`, `repetitions`, `allOutputRefs`, `metrics`, `thresholdVersion` | Не менее трёх повторов каждого случая; сохраняются все результаты и разброс. Holdout не используется для настройки. |

`EvalRun` хранит версию набора, числители и знаменатели метрик валидности схемы, качества по режимам и категориям ошибок, расхождения с преподавателем, долю зависаний/timeout, p50/p95/TTFT и RAM. Пороги и числовой CPU-бюджет фиксируются **до открытия holdout** по [правилам выпуска](release-gates.md). Протокол переходов и границы доступа определены в [ai-workflow.md](ai-workflow.md).
