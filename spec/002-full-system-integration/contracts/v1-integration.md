# Контракты API: Сквозная интеграция v1 (Фича 002)

**Статус**: сверено с кодом бэкенда 2026-09-29. Прежняя редакция описывала выдуманные формы (`ticketId`, `messageText`, `GET /tickets/{id}`, `POST …/notification-list` и др.) и удалена.

## Как читать

- **Истина** — код: `backend/app/api/v1/*.py` (роутеры) и `backend/app/schemas/v1/*.py` (схемы, camelCase 1:1 с фронтом). Дополняет `specs/002-two-mode-simulator/contracts/v1-endpoints.md`. При расхождении побеждает код (AGENTS §1).
- Документ **не копирует** схемы целиком, а фиксирует то, что нужно фронту: путь, роль, вход, выход, ошибки, источник. Полные списки полей — по указанным файлам.
- Префикс всех путей — `/api/v1`. Аутентификация — cookie `arm112_session` (FR-040). Без сессии — 401. Ошибки — единый формат бэкенда (`app/api/errors.py`), сообщения на русском; фронт показывает `message` как есть.
- Обозначения ошибок: `400` — валидация (`validation_failed`), `401` — нет сессии, `403` — чужие данные/роль, `404` — не найдено, `409` — конфликт или недопустимый переход (`conflict`, `invalid_transition`), `503` — недоступна локальная модель.

Формы, для которых в фронте нужны TS-типы, перечислены в §7.

---

## 1. Задания (`assignments.py`, схемы `schemas/v1/assignments.py`)

| Метод и путь | Вход | Ответ | Ошибки | Источник |
|---|---|---|---|---|
| `GET /assignments` | query: `studentId?`, `teacherId?`, `state?` | `Assignment[]`: `id`, `teacherId`, `studentIds[]`, `trainingMode` (`dds`\|`operator112`\|`chain`), `format` (`training`\|`exam`), `cardIds[]`, `params{}`, `state`, `createdAt`, `title`, `randomRule?`, `dueAt?` | 401 | `assignments.py:35` |
| `GET /assignments/{id}` | — | `Assignment` + `progress[]`: `studentId`, `cardId`, `state`, `attemptId`, `score?`, `passed?`, `chainReview?` | 401/403/404 | `assignments.py:42` |
| `POST /assignments/{id}/start` | тело необязательно (`studentId?` — для преподавателя/администратора) | `{ attempt }`. Для `operator112`/`chain`-этапа A — `attempt` = `OperatorAttempt` (§2). Для `dds` и этапа B цепочки — `attempt` = `{ sessionId, attempt, created }` (форма compat-попытки) | 403 не назначен, 404, 409 «Задание завершено» / «Все билеты задания уже выполнены» / экзамен: «В экзамене билет выдаётся один раз» / этап B цепочки, см. §6 | `assignments.py:49`; `assignment_service.py:255-335` |
| `POST /assignments/{id}/finish` | — | `Assignment` | 403 (не владелец), 404. Незавершённые билеты → `notCompleted`, экзамен → `passed: false`, повтор идемпотентен | `assignments.py:58` |

`params` (нужное фронту): `norms{ answerSec, submitSec }` (сид: 30 и 180 с), `hints{ enabled, idleSec, steps[] }`, `passThreshold?`, `timeLimitSec?`, `workMessagesEnabled?`, `workMessageIntervalsSec?` (`assignments_seed.py`, `session_engine.py:192`). Экзамен принудительно отключает подсказки. `timeLimitSec` действует **на попытку** (от `openedAt`) и применяется сервером лениво — при чтении, старте и завершении задания (`assignment_service._expire`, стр. 149-166): просроченная попытка получает оценку 0, ошибку `timeLimit`, `passed: false`, ссылка → `notCompleted`, попытка 112 → `submitted`.

Создание задания (`POST /assignments`) — роль преподавателя/администратора, экраны вне объёма.

---

## 2. Режим специалиста-112 (`operator112.py`, схемы `schemas/v1/operator112.py`)

Состояние попытки: `ringing` → `answered` → `submitted`.

| Метод и путь | Вход | Ответ | Ошибки | Источник |
|---|---|---|---|---|
| `POST /operator112/attempts` | `{ assignmentId, cardId, studentId? }` (оба id обязательны) | `OperatorAttempt`: `id`, `cardId`, `studentId`, `aon`, `incidentNumber`, `createdAt`, `openedAt` (равен `createdAt`; в схеме `OperatorAttempt` поля нет, но `Attempt.to_operator_contract` его отдаёт), `state`, `answeredAt?`, `completedAt?`, `assignmentId?`, `events[]`, `replays`, `hintsShown`, `hints?{ enabled, idleSec, steps[{ stage, text }] }`, `audio?` (`TicketAudio`), `cardSnapshot?`. **201** — создана; **200** — возвращена уже открытая (тренировка) | 400 билет не входит в задание, 403 не назначен/чужое задание, 404, 409 «Задание завершено» / «В экзамене билет выдаётся один раз» | `operator112.py:28`; `operator112_service.py:150-180` |
| `POST /operator112/attempts/{id}/answer` | — | `OperatorAttempt` с `answeredAt`; идемпотентно; при превышении `answerSec` в `events` появляется событие `answerTimeout` (тип сервера, клиентом не отправляется) | 403, 404, 409 «Карточка уже отправлена» | `operator112.py:36`; `operator112_service.py:205-222` |
| `POST /operator112/attempts/{id}/events` | `{ type, payload }`, `type` ∈ `fieldChanged` (`payload.field`, `value`), `signSelected` (`payload.signs[]`), `serviceAdded` (`payload.serviceId`), `replay`, `hintShown` | `Event`: `id`, `type`, `at`, `payload`, `before?` (у `fieldChanged`). **201**. Время — серверное | 400 (форма payload), 403, 404, 409 «Сначала примите вызов» / «Карточка уже отправлена» / экзамен: «В экзамене запись прослушивается один раз» / «Подсказки в этом задании отключены» | `operator112.py:43`; `operator112_service.py:239-254` |
| `GET /operator112/attempts/{id}/notification-list` | query: `signs=a&signs=b` и/или `classifierCode=` (предпросмотр до фиксации событий); без них — по событиям попытки | `{ finalType, classifierCode, group, services[{ serviceId, addedBy: auto\|manual, title, mode?, condition? }], conditional[…] }` | 403, 404 | `operator112.py:51` |
| `POST /operator112/attempts/{id}/submit` | `CardDraft` (§7): `applicant{name,status}`, `phones{aon,provided,onSite}`, `address{formal,street,house,okrug,raion,descriptive,source: directory\|manual}`, `what{pollAnswers,signs[],flags[],finalType,classifierCode,casualties{injured,ambulanceRefused,blocked}}`, `description` (≤ 1999 симв.), `emergency{chs,chp}`, `notificationList[{serviceId,addedBy}]` | `{ attempt: OperatorAttempt, card: IncidentCard, evaluationId }` (`evaluationId` = id попытки). Для задания `chain` добавляется `chainReview` = `{ scenarioId, version, cardId }` (адрес версии входа ДДС и сохранённая карточка; статус подтверждения — в `progress[].chainReview` задания) | 400 «Заполните адресный блок» / «Заполните описание со слов заявителя или опросную карту», 403, 404, 409 «Сначала примите вызов» / «Карточка уже отправлена» | `operator112.py:59`; схема `CardDraft` |
| `GET /operator112/attempts/{id}/evaluation` | — | `OperatorEvaluation`: `timeScore`, `correctnessScore`, `grammarScore`, `semanticScore`, `totalScore`, `grammarErrors[]`, `errors[]`, `aiComment`, `fieldDiff[{ field, entered, expected, ok }]`, `mode`, `assessorVersion`, `passed?` | 403, 404 «оценка ещё не готова» до `submit` | `operator112.py:67`; схема `OperatorEvaluation` |
| `GET /streets` | query: `q` (≥ 3 символов, иначе 400), `limit` (10; ≤ 50) | `Street[]`: `id`, `name`, `type`, `okrug?`, `raion?` | 400 | `operator112.py:72` |

**Отсутствует в бэкенде** (фронт не должен рассчитывать): `GET /operator112/attempts/{id}` (попытку по id получить нельзя — выдача и восстановление через `POST /assignments/{id}/start`, который возвращает открытую попытку и в тренировке, и в экзамене; повторный `POST /operator112/attempts` в экзамене даёт 409; см. `03-architecture.md` §3); `GET /tickets/{id}`; `POST …/notification-list` (в коде — GET).

---

## 3. Билеты и аудио (`tickets.py`)

| Метод и путь | Ответ | Ошибки | Источник |
|---|---|---|---|
| `GET /tickets` | Список билетов (`IncidentCard` + `difficulty`, `approved`, `modeOrigin`, `audio?`, `validation?`) с фильтрами `group[]`, `difficulty[]`, `source`, `validationStatus`, `q`. **Доступен любой аутентифицированной роли, в том числе обучающемуся** (проверено 2026-09-29: у `ivanov` 96 билетов); преподаватель отбирает для назначения `approved: true` (мастер `features/assignment-create`) | 401 | `tickets.py:74` |
| `GET /tickets/{cardId}/audio` | `TicketAudio`: `cardId`, `status` (`pending`\|`ready`\|`failed`), `transcript`, `voice`, `path?`, `durationMs?`, `generatedAt?`, `emergency`, `error?`. Нет записи → `pending` + `emergency: true` | 404 | `tickets.py:174` |
| `GET /tickets/{cardId}/audio/file` | `audio/wav` (24 кГц моно), `Cache-Control: no-store`. Доступ учитывает счётчик прослушиваний (экзамен: один раз) | 404 «Аудиозапись не готова: используйте расшифровку (аварийный режим)», 403 вне своей открытой попытки, 409 повтор в экзамене | `tickets.py:181` |

Правило клиента: любой ответ, кроме 200, кроме 409 экзамена, ведёт в аварийный текстовый режим (FR-012); 409 — сообщение «Повторное прослушивание в экзамене запрещено» (FR-013). До запроса файла клиент может смотреть `attempt.audio.status`/`emergency`.

---

## 4. Лобби, рекомендации, база знаний (`lobby.py`, `recommendations.py`, схемы `schemas/v1/lobby.py`)

| Метод и путь | Роль | Вход | Ответ | Ошибки | Источник |
|---|---|---|---|---|---|
| `GET /me` | все | — | `PublicUser` | 404 | `lobby.py:27` |
| `GET /me/history` | все (👤) | query: `mode?` (`dds`\|`operator112`), `format?` (`training`\|`exam`), `page`, `perPage` | `{ items: HistoryItem[], total, page, perPage }`; `HistoryItem`: `attemptId`, `mode`, `format`, `cardId`, `title`, `score`, `passed?`, `at`, `reportUrl?` | 403 чужой `studentId` | `lobby.py:35`; `schemas/common.py:27` |
| `GET /me/analytics` | все (👤) | — | `Analytics`: `byMode{ dds, operator112 }`, `byGroup{…}`, `byFormat{ training, exam }` (значения — `Stats`: `count`, `averageScore`, `averageReactionMs`, `averageProcessingMs`, `replays`, `hintsShown`), `reactionMs`, `topErrors[]`, `dynamics{}` | 403 | `lobby.py:49` |
| `GET /kb/articles` | все | query: `group?` (подстрока без учёта регистра), `q?` (по названию и группе) | `KbArticle[]`: `id`, `group`, `title`, `sections{ signs[], notification[], clarify[], ddsDecision[], typicalErrors[] }`, `updatedBy?`, `updatedAt?`. Всего 105 статей (`backend/data/kb/kb-*.json`) | 401 | `lobby.py:57` |
| `GET /kb/articles/{id}` | все | — | `KbArticle` | 404 | `lobby.py:70` |
| `GET /me/recommendations` | только `student` | query: `limit` (1–50, по умолчанию 10) | `Recommendation[]`: `id`, `kind` (факт по коду `recommendation_service.generate`: `category`, `article`, `card`, `mode`), `targetId`, `title`, `reason{ errorType, count, ruleId }`, `createdAt`, признак принятия. Без истории — `[]` | 403 не студент | `recommendations.py:21`; `recommendation_service.py:32-100` |
| `POST /me/recommendations/{id}/accept` | только `student` | — | `Recommendation` (идемпотентно; понижает повторную выдачу) | 403 чужая, 404 | `recommendations.py:30`; `recommendation_service.py:100` |

Особенность: `Recommendation` не содержит текста статьи и режима билета; переход «к материалу» строится на клиенте по `targetId`/группе (допущение A5).

`GET /kb/articles`: «105 статей по группам ЕКП» — по классификатору v046_24; в статьях нет полей `ekpCode`, `services`, `commonMistakes` (были в черновике), есть пять разделов `sections`.

---

## 5. Сообщения о ходе работ и голосовой доклад (`work_messages.py`)

| Метод и путь | Вход | Ответ | Ошибки | Источник |
|---|---|---|---|---|
| `GET /attempts/{id}/work-messages` | query: `since?` (ISO 8601) | `WorkMessage[]`: `id`, `kind` (`departed`\|`arrived`\|`started`\|`done`), `at`, `expectedStatus` (`responseStarted`\|`arrived`\|`workInProgress`\|`workDone`) — только наступившие (`at ≤ now`, `at > since`), по возрастанию. Пусто, если занятие не включило сообщения | 400 «since должен быть ISO 8601», 403 чужая, 404 «Попытка ДДС не найдена» (в т.ч. если попытка не `dds`) | `work_messages.py:28`; `services/work_messages.py:12-60` |
| `POST /attempts/{id}/report-audio` | `multipart/form-data`: `file` (WAV моно 16 бит, 8 или 16 кГц, ≤ 20 МБ), `to_number` (по умолчанию `112`, должен существовать в справочнике) | **201** `{ attemptId, call{ id, fromUserId, toNumber, startedAt, endedAt, transcript[{ speaker, text, at }], report? }, recording{ id, url } }`. `call.report` (если распознан текст диспетчера) — `{ version, text, checks[{ id, label, expected, found }], missing[], score }`, `score` — доля 0…1; пять проверок: номер карточки, адрес, тип, пострадавшие, решение | 400 «WAV должен быть непустым и не больше 20 МБ» / «Ожидается моно PCM WAV 16 бит, 8 или 16 кГц» / «Речь в аудиодокладе не распознана» / «Номер адресата доклада не найден в справочнике», 403, 404, 503 «Локальная модель Vosk small-ru не найдена» / «установите backend[stt]» | `work_messages.py:45`; `ml/speech/stt.py`; `ml/insights/call_responder.py:199` |

`WorkMessage` не содержит текста и кода службы: текст формирует фронт по `kind` (FR-033), например: `departed` — «Расчёт выехал к месту вызова», `arrived` — «Расчёт прибыл на место», `started` — «Начаты работы», `done` — «Работы завершены».

---

## 6. Цепочка A → B: ответы `start` и конфликты

Поведение `POST /assignments/{id}/start` для `trainingMode: chain` (`assignment_service.py:255-335`):

| Состояние | Ответ |
|---|---|
| Нет попыток | Выдаётся билет этапа A; `attempt` = `OperatorAttempt` |
| Есть открытая попытка | Возвращается она же |
| Этап A передан, вход ДДС не подтверждён | **409** «Вход ДДС ожидает проверки и подтверждения преподавателем» |
| Этап A не передан | **409** «Сначала сохраните карточку режима 112» |
| Вход подтверждён | `attempt` = `{ sessionId, attempt, created }` — попытка ДДС по сохранённой карточке (`attempt.cardId` → `/arm/card/{id}`) |
| Сохранённая карточка изменена после подтверждения | **409** «Сохранённая карточка изменилась после подтверждения ДДС» |
| Этап B уже был | **409** «Цепочка A → B уже завершена» |
| Нет утверждённой версии `operator112` для билета | **409** «Цепочке A → B не назначена утверждённая версия operator112» |

Подтверждение — `POST /ai/scenarios/{id}/approve` (§8), доступно преподавателю и администратору. Обучающийся узнаёт о необходимости подтверждения из `chainReview` в ответе `submit` и из 409 при повторном `start`.

---

## 7. Типы, которые нужно завести на фронте

Список — вход для `src/shared/api/types/*`; поля и обязательность берутся из указанных схем, а не переписываются вручную.

| Тип | Источник схемы |
|---|---|
| `Assignment`, `AssignmentDetail`, `AssignmentProgress`, `StartResponse` | `schemas/v1/assignments.py` |
| `OperatorAttempt`, `OperatorEvent`, `NotificationListResponse`, `CardDraft` (+ вложенные `CardDraftApplicant/Phones/Address/What/Casualties/Emergency/Notification`), `OperatorEvaluation`, `Street`, `TicketAudio` | `schemas/v1/operator112.py` |
| `HistoryItem`, `Analytics`, `Stats`, `KbArticle`, `KbSections` | `schemas/v1/lobby.py` |
| `Recommendation`, `WorkMessage`, `ReportCheckResult`, `ReportAudioResponse` | `recommendation_service.py`, `models/work_message.py`, `ml/insights/call_responder.py`, `work_messages.py:84` (формы собираются как dict; фиксируются в тестах формы) |

После добавления или правки типов — `cd backend && uv run python scripts/extract_ts_fields.py`, иначе падает `test_expected_fields_are_fresh` (AGENTS §11).

---

## 8. ИИ-эндпоинты (`ai_*`), которые вызывает фронт

Пути — по коду; в черновике часть путей была неверной (`/ai/assessments/{id}/state` и `/resolve` не существуют).

| Метод и путь | Назначение | Источник |
|---|---|---|
| `POST /ai/scenarios/drafts` (201) | Черновик сценария | `ai_scenarios.py:20` |
| `POST /ai/scenarios/{id}/revise` (201) | Новая редакция | `ai_scenarios.py:31` |
| `POST /ai/scenarios/{id}/approve` | Утверждение версии преподавателем (в цепочке — подтверждение входа ДДС) | `ai_scenarios.py:43` |
| `GET /ai/scenarios/{id}/versions` | Версии сценария | `ai_scenarios.py:55` |
| `GET /ai/attempts/{attemptId}/assessment-state` | Состояние 4-осевой оценки и спорных случаев | `ai_assessments.py:82` |
| `GET /ai/attempts/{attemptId}/review` | Разбор для преподавателя | `ai_assessments.py:115` |
| `POST /ai/attempts/{attemptId}/resolve` | Решение преподавателя по спорному случаю | `ai_assessments.py:176` |
| `GET /ai/sessions/{sessionId}/errors`, `…/error-summary`, `…/report` | Реестр ошибок, сводка, отчёт сессии | `ai_errors.py:65,101,168` |
| `GET /ai/me/errors` | Ошибки обучающегося | `ai_errors.py:127` |

Клиент ИИ на фронте — `src/shared/api/ai-client.ts` (базовый путь `/api/v1/ai`, выводится из `NEXT_PUBLIC_MOCK_API_BASE_URL`); сверка его путей с таблицей выше — задача фазы 1.

Для автономного режима (FR-002) нужны обработчики только для тех путей, которые реально вызывают панели `AIScenarioWorkflowPanel`, `AIAssessmentPanel`, `SessionErrorSummaryPanel`; список уточняется чтением `ai-client.ts` в плане.

---

## 9. Открытые проверки контрактов (на фазу планирования)

Закрыты чтением кода 2026-09-29: форма ответа `submit` (`operator112_service.py:436`), состав `Analytics` (`schemas/v1/lobby.py:52-58`), роли `POST /assignments` (`assignment_service.py:81`, преподаватель/администратор) и `approve` (`ai_scenario_review.py:31`, преподаватель/администратор), статус `invalid_transition` = 409, код `invalidTransition` (`app/api/errors.py:76`).

Остаются на фазу планирования:

1. ~~Форма `chainReview`~~ — определена: `{ scenarioId, version, approval, validation }` (`schemas/v1/assignments.py:94`; тест `tests/integration/test_ai_chain.py:198`). Подтверждение — `POST /ai/scenarios/{scenarioId}/approve` с телом `{ version, requestId }` (`ScenarioApproveRequest`).
2. Форма `Recommendation`: поле принятия — `acceptedAt` (`models/recommendation.py`); `dynamics`/`topErrors` в `Analytics` — слабо типизированные (`dict`/`list[dict]`), зафиксировать тестом формы при заведении TS-типов.
3. ~~Достижимость подтверждения из интерфейса преподавателя~~ — подтверждена (`plan.md`, `research.md` R7).
4. ~~Вызывает ли `submit` само применение лимита времени~~ — **нет, не применяет** (тест `backend/tests/integration/test_exam_time_limit_submit.py`, 2026-09-29): `submit` после лимита проходит, если задание не читали; клиент читает `GET /assignments/{id}` при нулевом остатке (T013). Серверное принуждение на `submit` — пробел бэкенда.

---

## 10. Авторизация (часть B): текущее и планируемое

Пути — compat-роутер `backend/app/api/compat/auth.py`; доступны под `/api/mock/auth/*` и `/api/v1/auth/*` (одинаковый контракт). Изменения B1–B5 **выполнены 2026-09-29** (T032, T033): контрактные тесты — `backend/tests/contract/test_auth_cookie.py`.

| Метод и путь | Сейчас | После изменений |
|---|---|---|
| `POST /auth/login` | Вход: `{ login, password, armNumber }`, `armNumber` **обязателен** (422 «Укажите номер АРМ»); ответ — `AuthSession { userId, role, token, twoFactorUsed: false, issuedAt }`; поле `twoFactorCode` отвергается. Ошибки: 400 (пустые поля), 401 «Неверный логин или пароль» (единое сообщение), 403 «Учётная запись заблокирована…» (`account_blocked`), блокировка по попыткам (`auth_throttle`) | **B1 (выполнено)**: `armNumber` необязателен (если передан — сверяется); ответ **дополнительно** `Set-Cookie: arm112_session=<JWT>; HttpOnly; SameSite=Lax; Path=/` (+`Secure` при HTTPS); `token` в теле остаётся для Bearer-клиентов, фронт его не хранит |
| `GET /auth/policy` | `{ twoFactorRequired: false, minPasswordLength: 8, lockAfterAttempts: 5 }` | без изменений |
| `GET /auth/session` | `PublicUser` (`id`, `login`, `fullName`, `role`, `armNumber`, `isActive`, `group?`, `service?`, `assignedGroups?`); 401 без сессии | без изменений; **основной источник** роли и профиля для серверных лэйаутов (`verifySession`) |
| `POST /auth/logout` | 204; отзывает сессию по `jti` (`revoke_session`) | **B3 (выполнено)**: дополнительно `Set-Cookie: arm112_session=; Max-Age=0`; выход **идемпотентен** — без действующей сессии тоже 204 и очистка cookie (чтобы устаревшая cookie не оставалась в браузере) |
| `POST /auth/password` | — | **B4** (новый): `{ currentPassword, newPassword }` → 204; ошибки: 400 (политика длины, новый = текущий, **неверный текущий пароль** — тоже 400, а не 401/403: 401 фронт трактует как «сессия истекла» и уводит на вход; такие попытки идут в счётчик блокировки `lockAfterAttempts`), 401 (нет сессии), аудит `auth.passwordChange`; **все другие сессии пользователя отзываются**, текущая продолжается |
| `POST /auth/logout-all` | — | **B5** (новый): 204; `revoke_user_sessions`, аудит; cookie очищается |

**Разбор cookie на бэкенде** (`app/api/deps.py:41-71`): сейчас cookie — JSON с `token`, JWT проверяется подписью и таблицей сессий, а роль JSON сверяется с ролью JWT. **B2 (выполнено)**: дополнительно принимается cookie, содержащая только JWT (`_looks_like_jwt`); JSON остаётся на переходный период (один тест совместимости) и удаляется после проверки на стенде. Bearer сохраняется (скрипты `scripts/e2e-*.sh`, контрактные тесты).

**JWT** (`services/security.py:45-57`): `sub`, `role`, `jti`, `iss`, `aud`, `iat`, `exp`; TTL — `JWT_TTL_HOURS` (24 ч). Фронт (`proxy`) читает `exp` и `role` без проверки подписи (оптимистично); проверка подписи и сессии — на бэкенде.


## Сверка W3 (2026-09-29)

- `GET /teacher/students/{id}/profile`: `typicalErrors` — не более трёх самых частых типов на режим (`recommendation_service.profile`, `Counter.most_common(3)`), поэтому «зона риска» считает сумму по этим записям, а не по всем ошибкам.
- `GET /admin/audit` читает и преподаватель (`compat/admin_system.py:260`), не только администратор; фильтры: `type` (`login|users|grades|settings|backup|card|content`), `operator`, `card`, `q`, `from`, `to`, `page`, `perPage`. Типы: `auth.*` → `login`; `assignment.*`, `ticket.*`, `kb.*`, `ai.*`, `scenario.*`, `material.*`, `profileMapping.*` → `content`.
- `GET /api/v1/health` (`app/main.py`): `{ status, db, version }` без авторизации; состояния моделей в ответе нет.
- `POST /assignments`: `scenarioVersions` нужны только для `chain` (утверждённая версия `operator112` на каждый билет); для случайного набора в тренировке билеты выбираются при `start`, в экзамене — при создании (`candidate_card_ids`).
