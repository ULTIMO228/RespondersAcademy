# Research: ИИ-чат разбора попытки

## R1. Каким вызовом получать ответ
- **Decision**: `llm.complete_json("attempt_chat", system, user, {"text": str})` в `llm_scope`, как `report_ai_text`; ответ — `validate_text(max_len≈600)`.
- **Rationale**: единственная точка с каскадом облако → локальная → шаблон, лимитами, аудитом и честным `source`. Проверено: `ml/generate/llm.py:480`, `report_ai_text.py:200`.
- **Alternatives**: прямой `PolzaClient`/`OllamaClient` — обходит лимиты, аудит, `ai_health`; потоковая выдача — `complete_json` не стримит, YAGNI.
- **Следствие**: markdown и списки не поддерживаются (`validate_text` их отклоняет: служебный шаблон `_SERVICE` в `report_ai_text.py:51-58`) — в спеку внесено «простой текст».
- **T003 — образец вызова (проверено по коду)**: `report_ai_text._ask` (`:216-236`) оборачивает `llm.complete_json(purpose, system, user, schema, max_tokens=...)` в `asyncio.to_thread` и `asyncio.wait_for(limit)`; `TimeoutError` → `_record_timeout` (`:239-256`) дописывает исход `reason="timeout"` в `llm.current_context()`; прочие исключения → `None` (шаблон). `_answered` (`:259-262`) принимает только `source` ∈ {cloud, local} с dict-данными. `validate_text` (`:200-210`): длина `MIN_LEN=15..max_len`, кириллица ≥ 0.8 букв, нет служебных фрагментов. Вызов обёрнут в `llm_scope(db, viewer, release_connection=...)` (`report_builder.py:222`); `release_connection=True` коммитит транзакцию до вызова модели, поэтому в чате его нужно включать только если до вызова нет записей.
- **T022 ориентир**: порядок тот же — `async with llm_scope(...)` → `_ask`-подобный вызов с таймаутом `CHAT_TIMEOUT_SEC` → `validate_text(max_len=REPLY_MAX)` → при провале шаблон. Таймаут для чата — константа, старт 20 с (`TEXT_TIMEOUT_SEC`) — замер в T032.

## R2. Облако для чата и инвариант §2
- **Decision**: цель `attempt_chat` добавляется в аудит (`external_ai_audit.PURPOSES`), и облачная ветка для неё включается только после поправки `AGENTS.md` §2 владельцем; до этого чат работает локально/шаблоном даже при `source=cloud`.
- **Rationale**: §2 перечисляет разрешённые цели; вопрос обучающегося — свободный текст и уходит наружу (в отличие от агрегатов отчётов).
- **Alternatives**: считать покрытым фичей 006 — нельзя утверждать, не проверено у владельца.
- **Открыто**: подтверждение владельца (Q3 спеки).
- **Реализация флага (T022, фаза US3)**: `CHAT_CLOUD_ENABLED` (`config.chat_cloud_enabled`, по умолчанию `True` с 2026-10-20 по решению владельца; выключатель). Когда флаг выключен, `attempt_chat._cloud_gate` на время вызова чата подменяет контекст запроса (`llm.bind_context(LlmCallContext(ai=None))`): `llm.complete_json` видит источник `local` и идёт сразу в локальную модель → шаблон, облако не вызывается и квота не тратится. Код `ml/generate/llm.py` и других потребителей не менялся. Исходы такого вызова пишутся в отдельный контекст и в `ai_health` не попадают: иначе строка здоровья показала бы «источник local» и скрыла состояние облака. Со включённым флагом чат идёт по обычному каскаду облако → локальная → шаблон с аудитом цели «ответ чата разбора попытки». Тесты: `tests/integration/test_attempt_chat_cascade.py` (оба значения флага).

## R3. Источник фактов для студента (T002, проверено по коду 2026-10-20)
- **Decision**: факты строит `attempt_chat.build_facts(db, attempt, mode)` только на чтении: оценка через `session_engine.evaluation_contract` (`session_engine.py:63`), доступ через `ai_access.require_attempt_access` (`ai_access.py:43`; студент — только своя попытка, учитель и админ отсекаются в роутере). Агрегаты `report_ai_text.attempt_facts` не переиспользуются: они строятся из `scored` отчёта занятия, а чату нужна одна попытка.
- **Почему не `get_or_create_evaluation`**: при отсутствии оценки `evaluate_if_possible` (`evaluation_service.py:50-188`) пишет `Evaluation`, `EvaluationRevision`, `ErrorRecord` (`:146-175`), вызывает `sync_rating` (`:178`) и переводит связь назначения в `submitted` (`:179-187`). Чат не должен менять данные. Экран разбора и так получает оценку GET-запросом: `resultsApi.ts:22-25` → `/attempts/{id}/evaluation` (`compat/attempts.py:46-47`) или `/operator112/attempts/{id}/evaluation` (`operator112.py:68-69` → `operator112_service.evaluation`, `:524-529`).
- **`GET /ai/attempts/{id}/review` студенту закрыт**: `ai_assessments.py:124` → 403. Не использовать.
- **Поля оценки** (`models/session.py:129-152`, `Evaluation.to_contract`): `timeScore`, `correctnessScore`, `grammarScore`, `semanticScore`, `totalScore`, `passed` (только для экзамена с порогом), `mode`, `teacherOverride{score,comment,at,by}`, `errors[]{type,severity,message,ruleId,step?,fixed?}`, `grammarErrors[]`, `aiComment`, `components{name:{score,weight,available,details}}`, `warnings[]`.
- **Итоговый балл как в разборе**: `teacherOverride.score ?? totalScore` (`src/widgets/attempt-review/lib/normalize.ts:49`). Чат берёт то же число.
- **Нормативы**: `find_scenario_for_attempt` (`evaluation_service.py:36`) → `resolve_time_norms(scenario.doc, session.plan.timeNorms)` (`ml/assess/engine.py:39-52`), дефолты 30 с и 180 с. Та же логика у `report_builder._norms_for` (`report_builder.py:80-87`). Факт времени — `Attempt.primary_reaction_ms` и `full_processing_ms` (`models/session.py:45-49`).
- **Эталон**: `scenario.doc["etalon"]` (`models/scenario.py:31-32`) либо для карточки-цепочки `IncidentCard.extra["chainEtalon"]` (`evaluation_service.py:60-73`). Разбор — `resolve_card_etalon` (`ml/assess/etalon.py:79`). Названия — `status_title` (`:119`), `number_title` (`:126`) и справочник `read_reference` (`app/services/reference.py:20`). В чат идут только статусы, службы, решение, перевод и ловушка: `keyPhrases`, `expectedFacts`, `reportChecklist`, `expectedCommentPhrases` — свободный текст сценария, не передаются.
- **Формулировки нарушений**: `ERROR_TITLES` (`ml/insights/group_insights.py:15`), 22 ключа. Из 36 типов правил (`ml/assess/rules.py`) 14 без формулировки: `addressMismatch`, `addressUnknown`, `answerTimeout`, `applicantMismatch`, `extraFlag`, `guessing`, `lostFact`, `missingService`, `missingSign`, `phoneMismatch`, `statusAfterInformationLate`, `statusWithoutBasis`, `trapNotDetected`, `wrongFinalType`. Для них в чат уходит общая фраза «замечание по регламенту», а не код. Для режима 112 это заметная доля. Расширение `ERROR_TITLES` — решение владельца (файл общий с отчётами, не меняется этой задачей).
- **Не передаётся**: `errors[].message` (шаблон пояснения форматируется полями и может содержать введённые значения, `rules.py:44-62`), `errors[].step`, `grammarErrors[]` (`wrong`, `fragment`, `expected` — текст курсанта; в чат уходит только число), `aiComment` (собран из сообщений), `teacherOverride.comment` и `by`, `fieldDiff`, `components[].details`, `warnings`, а также ФИО, id попытки, карточки и людей.
- **Расхождение с наброском**: `ai_assessments.py` в прежней версии этой заметки указан как `:121`; по коду — `:124`.

## R4. Приватность
- **Decision**: в промпт — баллы, превышение нормативов режима, `ERROR_TITLES`, эталонные требования; не передавать id, ФИО, введённый текст карточки, `message` проверки. Вопрос ≤ 1000 зн.
- **Rationale**: инвариант обезличенных данных; поведение `report_ai_text` (модульный docstring).

## R5. Лимиты и сроки
- **Decision**: ожидание ≤ `TEXT_TIMEOUT_SEC`-подобной константы чата (старт 20 с, замеряется), лимит запросов на пользователя (например 10/мин, in-memory, 429); дневной лимит облака — существующий `polza_daily_limit`.
- **Alternatives**: без лимита на пользователя — один обучающийся исчерпает общий дневной лимит.

## R6. Клиент
- **Decision**: шторка — собственный компонент в `widgets/attempt-chat` на токенах `--pf-*`, фокус-ловушка, Esc, backdrop, `prefers-reduced-motion`. Готового Drawer/modal в `shared/ui/platform` нет (поиск по `src` — совпадений нет), сторонние библиотеки не добавляются.
- **История**: `sessionStorage` за интерфейсом в `shared/lib`, ключ с `attemptId`, try/catch.
- **Автономный режим**: `app/api/v1/ai/chat/route.ts` — детерминированный шаблонный ответ.

## R7. Скорость локальной модели
- Не измерялась на чат-нагрузке → SC-002 даёт ориентиры; замер — задача тестирования, цифры в спеку после замера.

## R8. Решения реализации фундамента (фаза T002–T011)
- **Порядок проверок в `POST /ai/chat`**: сессия (401) → роль `student` (403, в том числе админ: `require_attempt_access` его пропускает) → тело (422) → попытка и владелец (404/403) → режим попытки (404) → оценка (404 `evaluationPending`). Пары 200 — в `tests/contract/test_attempt_chat.py`.
- **422 вместо общего 400**: `parse_body` даёт 400 `validationFailed`, а `T010` требует 422. Контракт (`contracts/api.md`) допускает оба кода. Выбран 422, отдельным помощником `_parse_request` в роутере. Если владелец предпочтёт единый 400 — менять одну функцию.
- **История > 6 реплик → 422** (`T004`, `ChatRequest.history max_length=6`). Расхождение: `spec.md` §4.1 пишет «сервер сам обрезает лишнее». Принято решение T004. Клиент присылает последние шесть реплик (T015). `build_prompt` дополнительно берёт последние шесть, поэтому даже прямой вызов не превышает лимит. Нужно подтверждение владельца.
- **Режим из попытки**: `build_facts` берёт режим из `attempt.mode`. Если тело прислало другой режим, ответ — 404 «Попытка не найдена в этом режиме». Это не записано в `spec.md` и подтверждения владельца не имеет.
- **Ответ с `null`**: `ChatResponse.dump()` не отбрасывает `None`, поэтому `provider` и `modelName` присутствуют в шаблонном ответе (`ApiModel.dump` с `exclude_none` их бы убрал).
- **Только чтение**: `build_facts` и роутер ничего не записывают. Облачная ветка и аудит (`external_ai_audit.PURPOSES`) — в T022/T023, после решения владельца по R2.
- **Лимит запросов (T024)**: `attempt_chat.ChatRateLimiter` — скользящее окно 60 с, по умолчанию 10 запросов на пользователя (`CHAT_RATE_PER_MINUTE`), in-memory на процесс (при нескольких воркерах лимит считается на каждый отдельно), 429 `rateLimited`, текст «Слишком много вопросов подряд. Подождите минуту и повторите». Проверка стоит сразу после роли `student`, до разбора тела: отказ в окно не засчитывается. Время инжектируемо. `tests/conftest.py` сбрасывает лимитёр между тестами.
- **Модель и транзакция (T022)**: `llm_scope(..., release_connection=True)` — до вызова модели в транзакции только чтения; после выхода из scope `answer` делает `db.commit()` (исходы `ai_health` и аудит облака) — роутер сам не коммитит. `modelName` — часть строки провайдера после `:` (`polza:<модель>`, `llamacpp:<модель>`); у шаблона `provider`/`modelName` равны `null`. Таймаут — `CHAT_TIMEOUT_SEC = 20` (замер — T032); зависший поток не прерывается (как в отчётах).
