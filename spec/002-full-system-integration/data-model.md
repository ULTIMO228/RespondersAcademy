# Модель данных (Фаза 1): Сквозная интеграция (Фича 002)

Часть A **не добавляет таблиц и полей** на бэкенде (часть B — авторизация и платформа — новых таблиц тоже не требует, см. §6): сущности уже реализованы (`backend/app/models`, `backend/app/schemas/v1`). Документ фиксирует то, что фронт читает и отправляет, правила валидации, переходы состояний и связи. Поля и обязательность — по схемам бэкенда; при расхождении истиной считается код (AGENTS §1). Единственное изменение схемы БД — приведение миграции к моделям (R1): 13 таблиц + триггеры.

Обозначения: `?` — необязательное поле; camelCase — как в JSON; `→` — переход состояния.

---

## 1. Сущности фронта

### 1.1. Задание — `Assignment`
Схема: `backend/app/schemas/v1/assignments.py`; модель `backend/app/models/assignment.py`.

| Поле | Тип | Примечание |
|---|---|---|
| `id` | string | `asg-NNN` |
| `teacherId`, `studentIds[]` | string / string[] | |
| `trainingMode` | `dds` \| `operator112` \| `chain` | Определяет, какой экран открывать |
| `format` | `training` \| `exam` | Экзамен: подсказки выключены сервером |
| `cardIds[]` | string[] | Билеты; при `randomRule` — набор считается сервером |
| `params` | объект | `norms{answerSec,submitSec}`, `hints{enabled,idleSec,steps?}`, `passThreshold?`, `timeLimitSec?`, `maxGrammarErrors?`, `workMessagesEnabled?`, `workMessageIntervalsSec?` |
| `state` | `active` → `finished` | `finish` необратим; истёкшая попытка экзамена меняет ссылку, не задание |
| `title`, `dueAt?`, `randomRule?`, `createdAt` | | |

`AssignmentDetail` = `Assignment` + `progress[]`:

| Поле прогресса | Тип | Примечание |
|---|---|---|
| `studentId`, `cardId`, `attemptId` | string | |
| `state` | `ringing` \| `answered` \| `submitted` \| `notCompleted` | Состояние ссылки «задание ↔ попытка» |
| `score?`, `passed?` | int / bool | `passed` пуст для тренировки без порога |
| `chainReview?` | `{ scenarioId, version, approval, validation }` | Только `chain`, только после `submit` этапа A |

**Правила**: студенту видны только задания, где он назначен (403 иначе, `assignment_service.py:170-175`); запуск возможен, пока `state = active`; повторный `start` возвращает открытую попытку.

### 1.2. Попытка специалиста-112 — `OperatorAttempt`
Схема: `schemas/v1/operator112.py`; контракт собирает `Attempt.to_operator_contract` (`models/session.py:79-106`).

| Поле | Тип | Примечание |
|---|---|---|
| `id`, `cardId`, `studentId` | string | `cardId` — билет; содержимое билета студенту не отдаётся до передачи |
| `aon`, `incidentNumber` | string / int | АОН заявителя и номер происшествия |
| `createdAt`, `openedAt` | ISO | Равны; начало отсчёта норматива ответа и лимита экзамена |
| `state` | `ringing` → `answered` → `submitted` | Односторонние переходы |
| `answeredAt?`, `completedAt?` | ISO | |
| `assignmentId?` | string | |
| `events[]` | `Event` | Только серверные метки времени |
| `replays`, `hintsShown` | int | Счётчики для аналитики |
| `hints?` | `{ enabled, idleSec, steps[{stage,text}] }` | Экзамен: `enabled: false` |
| `audio?` | `TicketAudio` | `status`, `transcript`, `emergency`, … |
| `cardSnapshot?` | объект | Появляется после передачи |

**Переходы и ограничения** (`operator112_service.py`):
- `ringing → answered`: `POST …/answer`, идемпотентно; при превышении `answerSec` — событие `answerTimeout`.
- `answered → submitted`: `POST …/submit`; до ответа — 409 «Сначала примите вызов»; повторно — 409 «Карточка уже отправлена».
- События до ответа и после передачи — 409; `replay` в экзамене — второй раз 409; `hintShown` при выключенных подсказках — 409.
- Просрочка экзамена (см. R4) переводит попытку в `submitted` с оценкой 0 без `submit` обучающегося.

### 1.3. Событие попытки — `OperatorEvent`

| Поле | Тип | Правило |
|---|---|---|
| `type` | `fieldChanged` \| `signSelected` \| `serviceAdded` \| `replay` \| `hintShown` | Иное — 400 |
| `payload` | объект | `fieldChanged`: `field` (обяз.), `value`; `signSelected`: `signs[]` (список); `serviceAdded`: `serviceId` (обяз.) |
| `id`, `at`, `before?` | | Проставляет сервер; `before` — у `fieldChanged` |

### 1.4. Черновик карточки — `CardDraft`
Вход `POST …/submit`. Схема `CardDraft` и вложенные (`operator112.py`).

| Блок | Поля |
|---|---|
| `applicant` | `name`, `status` |
| `phones` | `aon`, `provided`, `onSite` |
| `address` | `formal`, `street`, `house`, `okrug`, `raion`, `descriptive`, `source` (`directory` \| `manual`, иное → `manual`) |
| `what` | `pollAnswers`, `signs[]`, `flags[]`, `finalType`, `classifierCode`, `casualties{ injured, ambulanceRefused, blocked }` |
| `description` | строка, ≤ 1999 символов |
| `emergency` | `chs`, `chp` (bool) |
| `notificationList[]` | `{ serviceId, addedBy: auto \| manual }` |

**Валидация (минимум для передачи)**: непустой один из `address.formal`/`street`/`descriptive` **и** хотя бы одно из `description`, `what.signs`, `what.finalType`, `what.classifierCode`; иначе 400 с русским сообщением. Пустой `notificationList` сервер достраивает по опросной карте. Фронт проверяет то же до отправки (UX), но обязан обработать 400 сервера.

### 1.5. Список оповещения — `NotificationListResponse`
`finalType`, `classifierCode`, `group`, `services[]` (`serviceId`, `addedBy`, `title`, `mode?`, `condition?`), `conditional[]` (та же форма — кандидаты на ручное добавление). Вычисляется сервером по признакам событий или по query `signs`/`classifierCode` (предпросмотр). Фронт не воспроизводит логику ЕКП.

### 1.6. Оценка попытки — `OperatorEvaluation`
`timeScore`, `correctnessScore`, `grammarScore`, `semanticScore`, `totalScore` (int), `grammarErrors[]`, `errors[]`, `aiComment`, `fieldDiff[{ field, entered, expected, ok }]`, `mode = operator112`, `assessorVersion`, `passed?`. До `submit` — 404. `evaluationId` = `attemptId`. Приоритет итога — за преподавателем (может быть переоценена; фронт показывает текущее значение).

### 1.7. Аудио билета — `TicketAudio`
`cardId`, `status` (`pending` \| `ready` \| `failed`), `transcript`, `voice`, `path?`, `durationMs?`, `generatedAt?`, `emergency` (bool), `error?`. Правило клиента: `emergency` или `status ≠ ready` или любой не-200 на файл (кроме 409) ⇒ аварийный текстовый режим.

### 1.8. История и аналитика
- `HistoryItem`: `attemptId`, `mode` (`dds`\|`operator112`), `format`, `cardId`, `title`, `score`, `passed?`, `at`, `reportUrl?`. Ответ страницы: `{ items, total, page, perPage }`.
- `Analytics`: `byMode{dds,operator112}`, `byGroup{}`, `byFormat{training,exam}` (значения `Stats`: `count`, `averageScore`, `averageReactionMs`, `averageProcessingMs`, `replays`, `hintsShown`), `reactionMs`, `topErrors[]`, `dynamics{}`.

### 1.9. Рекомендация — `Recommendation`
`id` (хэш), `kind` (`card` \| `mode`), `targetId`, `title`, `reason{ errorType, count, ruleId }`, `createdAt`, `acceptedAt?` (есть ⇒ принята). Принятая теряет приоритет; выдача пуста без истории; доступна только роли `student`.

### 1.10. Статья базы знаний — `KbArticle`
`id`, `group`, `title`, `sections{ signs[], notification[], clarify[], ddsDecision[], typicalErrors[] }`, `updatedBy?`, `updatedAt?`. 105 статей (`backend/data/kb/kb-*.json`), источник — классификатор `v046_24`. Фильтр `group` — подстрока без учёта регистра; `q` — по названию и группе.

### 1.11. Сообщение о ходе работ — `WorkMessage`
`id`, `kind` (`departed` \| `arrived` \| `started` \| `done`), `at` (ISO, серверная метка наступления), `expectedStatus` (`responseStarted` \| `arrived` \| `workInProgress` \| `workDone`). Текста и кода службы нет; текст формирует фронт по `kind` (FR-033). Планируются при принятии карточки (`accepted`) только при `workMessagesEnabled`; четыре сообщения с интервалами от принятия (по умолчанию 20/50/90/150 с). Отдаются только наступившие.

### 1.12. Голосовой доклад — ответ `report-audio`
`{ attemptId, call{ id, fromUserId, toNumber, startedAt, endedAt, transcript[{speaker,text,at}], report? }, recording{ id, url } }`.
`report` (если распознан текст диспетчера): `{ version, text, checks[{ id, label, expected, found }], missing[], score }`, `score` — доля 0…1 по пяти проверкам (номер карточки, адрес, тип, пострадавшие, решение). Адресат `to_number` — по справочнику (по умолчанию `112`).
**Ограничения входа**: WAV моно PCM 16 бит, 8 или 16 кГц, ≤ 20 МБ, непустой; иначе 400.

### 1.13. Вход ДДС цепочки — `ChainReview`
`{ scenarioId, version, approval, validation }`. В БД — версия сценария `mode = dds`, `sourceKind = student_card`, `approval = pending_review → approved` (подтверждает преподаватель/администратор `POST /ai/scenarios/{scenarioId}/approve` с `{ version, requestId }`); карточка обучающегося получает `sourceCardId` = исходный билет.

---

## 2. Состояния и переходы

```text
Assignment:        active ──POST /assignments/{id}/finish──► finished
Ссылка (progress): ringing → answered → submitted
                                 └──(лимит времени, лениво)──► notCompleted
OperatorAttempt:   ringing → answered → submitted
Chain (по заданию chain):
  этап A: ringing → answered → submitted ──► DDS-версия pending_review
  преподаватель: pending_review ──approve──► approved(available_for_training)
  этап B: start ► попытка dds по card.id этапа A (409 пока не approved)
WorkMessage:       запланировано (at в будущем) → наступило (at ≤ now) → показано в ленте
```

Клиентское состояние экрана 112 (машина состояний `entities/operator112-attempt`): `idle → starting → ringing → answered → submitting → submitted(evaluation)`; сбойные ветви: `error` (с возможностью повторить), `serverRequired`, `forbidden`, `conflict(message)`. Не более одного активного запроса `submit`.

---

## 3. Связи

```text
User(student) ──< Assignment(studentIds) ──< AssignmentAttempt(link) >── Attempt(mode: operator112|dds)
Attempt(operator112) ──1:1── Evaluation ──0..1── fieldDiff
Attempt(operator112) ──submit──► IncidentCard(mode_origin=operator112, sourceCardId → исходный билет)
IncidentCard ──(chain)──► ScenarioVersion(mode=dds, pending_review→approved) ──► Attempt(dds)
Attempt(dds) ──< WorkMessage (если workMessagesEnabled)
Attempt(dds) ──< call(report-audio) : { transcript, report.checks[5] }
User(student) ──< Recommendation(targetId → IncidentCard)
KbArticle (общий справочник, читают все роли)
```

---

## 4. Валидация и правила отображения (FR → правило)

| FR | Правило |
|---|---|
| FR-011 | Отсчёт ожидания ответа = `openedAt + norms.answerSec` (сид 30 с); цвет — из токенов `vars.css` |
| FR-013 | Экзамен: кнопка повтора аудио неактивна после первого прослушивания; отказ сервера 409 показывается сообщением |
| FR-014 | Подсказка улицы — от 3 символов, `limit ≤ 50`; выбор → `address.source = directory` |
| FR-017 | Минимум передачи (см. §1.4); ошибки — на полях |
| FR-021 | Индикатор экзамена = `openedAt + timeLimitSec − now`; по нулю — запрос `GET /assignments/{id}` |
| FR-032 | Курсор ленты — `at` последнего сообщения; дубли по `id` отбрасываются |
| FR-034 | Запись ≤ 180 с; WAV моно 16 бит 16 кГц; отправка не более одного запроса одновременно |

---

## 5. Изменение схемы БД (единственное)

| Что | Как |
|---|---|
| Таблицы, которых нет в `0001_initial` (13) | `ai_assessment_jobs`, `ai_draft_field_decisions`, `ai_error_records`, `ai_etalon_versions`, `ai_evaluation_revisions`, `ai_sanitized_tickets`, `ai_scenario_requests`, `ai_scenario_versions`, `ai_semantic_reviews`, `assignment_scenario_versions`, `assignment_students`, `auth_sessions`, `auth_throttles` |
| Триггеры неизменяемости | `ai_scenario_versions`, `ai_etalon_versions`, `ai_evaluation_revisions`: SQLite — 2 + 2 + 3; PostgreSQL — по 2 функции-триггера на таблицу (DDL из `models/ai_scenario.py:138-235`, `models/ai_assessment.py:133-247`) |
| Критерий | На пустой БД `alembic upgrade head` → 44 таблицы; `alembic check` без расхождений; `UPDATE`/`DELETE` утверждённой версии сценария падает |

---

## 6. Часть B: сессия, профиль, назначение (без новых таблиц)

### 6.1. Сессия (`AuthSession`, серверная)
Модель `backend/app/models/auth_session.py`: `jti_hash`, `user_id`, `issued_at`, `expires_at`, `revoked_at`. JWT: `sub`, `role`, `jti` (≥ 32 символов), `iss`, `aud`, `iat`, `exp`. **Клиенту** сессия видна только как `HttpOnly`-cookie `arm112_session` (значение — JWT). Переходы: `выдана → (выход | смена пароля другой сессии | выход везде | блокировка пользователя | истечение) → недействительна`. Профиль клиент читает `GET /auth/session` → `PublicUser` (`id`, `login`, `fullName`, `role`, `armNumber`, `isActive`, `group?`, `service?`, `assignedGroups?` — последнее у преподавателя, основа страницы «Группы»).

### 6.2. Политика безопасности
`GET /auth/policy`: `twoFactorRequired` (всегда `false`), `minPasswordLength` (8), `lockAfterAttempts` (5). Правится `PATCH /admin/system/settings` (блок `security`, ключ `require2fa` скрыт). Блокировка — `auth_throttle` (по паре «адрес + учётная запись»).

### 6.3. Смена пароля (вход `POST /auth/password`)
`{ currentPassword, newPassword }`; правила: текущий совпадает, `len(newPassword) ≥ minPasswordLength`, новый ≠ текущий (рекомендация); результат — 204 или сообщение; побочные эффекты: отзыв других сессий, аудит `auth.passwordChange`.

### 6.4. Назначение при создании (`AssignmentCreateRequest`, `schemas/v1/assignments.py`)
`studentIds[]` (≥ 1, активные обучающиеся), `teacherId?` (для администратора обязателен), `trainingMode`, `format`, ровно один из `cardIds[]` / `randomRule{groups[], difficulty[1..5], count 1..100}`, `scenarioVersions[]` (только с `cardIds`, для `chain` — утверждённые версии `operator112`), `params{}` (нормативы, подсказки, `passThreshold` 0–100, `timeLimitSec` > 0, `workMessagesEnabled`, `workMessageIntervalsSec` — четыре возрастающих секунды), `dueAt?`, `title`. Экзамен принудительно отключает подсказки. Ошибки валидации — 400 на русском; преподаватель не может назначать от имени другого преподавателя (403).

### 6.5. Профиль обучающегося для преподавателя (`/teacher/students/{id}/profile`)
`ratings{ dds, operator112 }`, `strongerMode`, `typicalErrors{ dds[], operator112[] }` (`{ type, count }`), `recommendations[]`. Инсайты группы (`/teacher/groups/{id}/insights`): `insights[{ share, errorType, text }]`, `suggestedGroup`.
