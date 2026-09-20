# Мок-слой API `/api/mock/*`

> Мок учебного контура: заменяется реальным бэкендом **без смены контрактов** (типы — `src/shared/api/types/*`,
> по `spec/05-data-models.md`; клиент — `@/shared/api`, базовый URL — `NEXT_PUBLIC_MOCK_API_BASE_URL`,
> по умолчанию `/api/mock`). Внешней сети нет, данные — только из `mocks/`: копия `spec/mocks/` (`npm run mocks:sync`)
> плюс моки уровня приложения `mocks/local/` (адреса, T2.3-06) и `mocks/admin/` (журнал аудита и состояния
> раздела «Система», T4.1-01 / T4.2-01) — их `mocks:sync` не удаляет, а `validate_mocks.py` не проверяет.

## Устройство

- Route Handlers — корневой `app/api/mock/**/route.ts`, одна строка реэкспорта. Логика — `src/shared/api/mock/**`
  (ридеры, store, разбор запроса, единый формат ответов) и доменные функции `src/entities/*/model/**`.
- `src/shared/api/mock` по правилам FSD не импортирует `entities`, поэтому четыре эндпоинта с доменной логикой
  собираются в `app/api/mock/_server/handlers.ts` (приватная папка Next — не роут): доменная функция передаётся
  параметром фабрике `create…Handler` из `@/shared/api/mock/routes`.
- Мутации (статусы, отработки, напоминания, SMS, сценарии, занятия, блокировки, аудит) живут в in-memory store
  процесса (`globalThis`), JSON-моки не изменяются. Перезапуск сервера — исходные данные.
- Метки времени ответов — ISO 8601 с московским смещением `+03:00`.

## Единый формат ответов

Успех — сами данные, без обёртки (`200`, у создания — `201`). Ошибка — всегда:

```json
{ "error": { "code": "notFound", "message": "Карточка «nope» не найдена" } }
```

`message` — по-русски, для показа пользователю. Коды (`ApiErrorCode`):

| HTTP | code | Когда |
|------|------|-------|
| 400 | `badRequest` | не JSON / не объект в теле; мусор в `page`, `perPage`, `status`/`cardStatus`, `createdFrom/To`, `dataset`, `view`, `sort` списка карточек |
| 400 | `validationFailed` | ошибка полей тела или query (сообщение называет поле); неизвестный статус ДДС; нет обязательного комментария к статусу |
| 401 | `unauthorized` | неверная тройка логин/пароль/номер АРМ (без уточнения, что именно) |
| 403 | `accountBlocked` | учётная запись заблокирована (только после верной тройки) |
| 403 | `forbidden` | действие не администратора |
| 404 | `notFound` | неизвестный id (карточки, занятия, сценария, попытки, пользователя) |
| 404 | `evaluationPending` | у попытки нет оценки и нет эталона сценария для генерации |
| 409 | `invalidTransition` | переход нарушает граф: статус ДДС, состояние занятия, статус валидации сценария |
| 409 | `conflict` | прочие конфликты состояния (администратор блокирует сам себя) |
| 422 | `validationFailed` | настройки системы нарушают нормативы ТЗ (бэкап ≤ 24 ч, журналы ≥ 6 мес, ≥ 20 сессий) — сообщение перечисляет нарушенные поля |
| 500 | `internal` | непредвиденная ошибка (детали наружу не отдаются) |

## Эндпоинты

Потребители — экраны карты роутов `spec/03-architecture.md`.

| Метод, путь | Вход (query / тело) | Источник данных | Ответ | Коды | Экран |
|---|---|---|---|---|---|
| `POST /auth/login` | `{ login, password, armNumber, twoFactorCode? }` (2FA — любые 6 цифр) | `users.json` + store (блокировки) + аудит `auth.login` (завершённый вход: после шага кода, а при выключенной 2FA — сразу) | `AuthSession { userId, role, token, twoFactorUsed, issuedAt }` | 200, 400, 401, 403 `accountBlocked` | `/login` |
| `GET /auth/policy` | — | store настроек (`SystemSettings.security`) | `AuthPolicy { twoFactorRequired, minPasswordLength, lockAfterAttempts }` | 200 | `/login` |
| `GET /reference` | — | `reference.json` | `ReferenceData` (11 справочников) | 200 | все селекты |
| `GET /classifier` | `group` — точное совпадение группы (без него — все 1283 записи); `code` — записи группы кода ЕКП (опросная карта карточки) | `classifier.json` | `ClassifierEntry[]`, заголовок `X-Classifier-Version` (URL-encoded) | 200 | опросная карта, конструктор сценариев |
| `GET /cards` | расширенный поиск (см. ниже), `status`, `type`, `q`, `dataset`, `view`, `sort`, `page`, `perPage` | `fixtures/arm-cards.json` + `cards.json` (проекция) | `PageResponse<ArmCardFixture> { items, total, page, perPage }` | 200, 400 | `/arm` |
| `GET /cards/[id]` | `card-*` или `c-NNN` | фикстуры / `cards.json` + store | `CardDetails` (`kind: fixture \| training`, у учебной — `resolvedFixtureId`; `runtime` — мутации) | 200, 404 | `/arm/card/[cardId]` |
| `POST /cards/[id]/status` | `{ ddsStatus, comment?, dutyNumber? }` | граф `reference.ddsStatuses` → store | `CardStatusEvent` | 200, 400, 404, 409 | карточка |
| `POST /cards/[id]/links` | — (read-only) | `cards.json → duplicateOf` | `CardLinksResponse { cardId, chain: [{ cardId, role: main \| subordinate }] }`; у фикстур — `[]` | 200, 404 | карточка |
| `POST /cards/[id]/worklines` | `{ service, calledTo, person, message, operator?, confirmed: true }` | store | `CardWorkLine` | 201, 400, 404 | карточка |
| `POST /cards/[id]/reminders` | `{ text, remindAt (ISO) }` | store | `CardReminder` | 201, 400, 404 | карточка |
| `GET /cards/[id]/sms` | — | `smsList` фикстуры (входящие) + store | `CardSms[]` по времени | 200, 404 | карточка |
| `POST /cards/[id]/sms` | `{ text, phone? }` (по умолчанию — АОН карточки) | store | `CardSms` (`direction: outgoing`) | 201, 400, 404 | карточка |
| `GET /cards/[id]/recordings` | — | в моках записей нет | `[]` | 200, 404 | карточка |
| `POST /cards/[id]/attempt` | `{ studentId, issuedAt? }` | занятия store: идущее занятие курсанта, которое эту карточку выдало (`cardFlow`), иначе любое идущее, иначе новое занятие практики (`mode: practice`) | `CardAttemptResponse { sessionId, attempt: CardEvent, created }`; повтор — та же попытка (200, `created: false`); открытая попытка: `completedAt: ""` | 200, 201, 400, 404 | карточка (T2.3-01) |
| `POST /attempts/[id]/progress` | `{ status?: CardStatusMark, enteredText?, completedAt? }` | store попытки | `CardEvent` (завершение → `fullProcessingMs`) | 200, 400, 404 | карточка |
| `POST /cards/[id]/calls` | `{ studentId, toNumber, startedAt, endedAt, transcript: TranscriptLine[] }` | store (попытки занятий) | `CardCallResponse { sessionId, attemptId, call: PhoneCall }` — вызов дописан в `CardEvent.calls` попытки курсанта по карточке (идущее занятие приоритетно); попытку создаёт открытие карточки | 201, 400, 404 (карточка / номер / нет попытки) | `/arm/phone` |
| `POST /calls/reply` | `{ toNumber, turn: answer \| reply, text? }` | транскрипты `sessions.json` + `reference.internalNumbers` | `AiResponse<CallReply { text, voice: male \| female, speakerTitle }>` — реплика ИИ-абонента точки C (мок, бейдж «ИИ») | 200, 400, 404 «Абонент не найден» | `/arm/phone` |
| `GET /scenarios` | `validationStatus`, `source`, `difficulty` (повтор), `group` (повтор) | `scenarios.json` + store | `Scenario[]` | 200, 400 | `/teacher/scenarios` |
| `POST /scenarios` | `Scenario` без `id`/`validation` | store | `Scenario` (`s-NNN`, `validation.status: draft`) | 201, 400 | редактор сценария |
| `POST /scenarios/[id]/validate` | `{ action: submit \| approve \| approvePartial \| reject, reviewedBy, comment?, fields? }` | store | `Scenario` | 200, 400, 404, 409 | `/teacher/scenarios/[id]` |
| `GET /scenarios/[id]` | — | store | `Scenario` | 200, 404 | `/teacher/scenarios/[id]` |
| `PATCH /scenarios/[id]` | `{ title?, difficulty?, level?, mode?, timeNorms?, etalon?, successCriteria?, updatedBy }` | store + аудит `scenario.update` | `Scenario` (`difficulty` пересчитывает `level`) | 200, 400, 404 | редактор сценария |
| `DELETE /scenarios/[id]` | `deletedBy` (query) | store + аудит `scenario.delete` | удалённый `Scenario` | 200, 400, 404, 409 | `/teacher/scenarios` |
| `POST /scenarios/generate` | `{ category, requestedBy }` | ИИ-шлюз + store + аудит `scenario.generate` | `Scenario[]` (2–3, `pending`, `source: generated`) | 201, 400 | `/teacher/scenarios` |
| `GET /training-cards` | — | `cards.json` | `IncidentCard[]` (96 учебных карточек) | 200 | конструктор сценариев |
| `GET /materials` | — | store | `TrainingMaterial[]` (новые — первыми) | 200 | `/teacher/scenarios` |
| `POST /materials` | `{ name, sizeBytes?, uploadedBy }` | store + аудит `material.upload` | `TrainingMaterial` (`mat-NNN`; формат по расширению DOCX/PDF/MP3) | 201, 400 | `/teacher/scenarios` |
| `GET /profile-mapping` | — | store (сид `PROFILE_MAPPING_SEED`) | `ProfileMappingRow[]` (со `studentCount`) | 200 | `/teacher/scenarios` |
| `PUT /profile-mapping` | `{ rows: [{ id, incidentGroups }], savedBy }` | store + аудит `profileMapping.save` | `ProfileMappingRow[]` | 200, 400, 404 | `/teacher/scenarios` |
| `POST /grammar-check` | `{ text, field? }` | ИИ-шлюз (`shared/lib/grammar-check`) | `AiResponse<GrammarError[]>` — бейдж «ИИ» | 200, 400 | конструктор сценариев |
| `GET /sessions` | `teacherId`, `studentId`, `state` | `sessions.json` + store | `Session[]` (обучающемуся — per-student проекция) | 200, 400, 401, 403 | `/teacher`, `/teacher/session`, `/arm`, `/arm/progress` |
| `POST /sessions` | мастер: `{ teacherId, studentIds, scenarioIds, mode, cardSource, cardFlow?, plan? }` | store (занятие + `SessionPlan`) | `Session` (`ses-NNN`, `state: configured`) | 201, 400 | `/teacher/session` |
| `POST /sessions/[id]/start` | — | store | `Session` (`running`, `startedAt`; `cardFlow` — по `plan` мастера: темп, порядок, конвейер, категории, профили; без плана — шаг 3 мин) | 200, 404, 409 | `/teacher/session` |
| `POST /sessions/[id]/stop` | — | store | `Session` (`finished`, `finishedAt`) | 200, 404, 409 | `/teacher/session` |
| `GET /sessions/[id]/feed` | `since?`, `at?` (ISO), `studentId?` | `cardFlow` + `cardEvents` + `evaluation` занятия | `SessionFeedResponse { sessionId, at, events }` (в т. ч. `aiEvaluation` с бейджем «ИИ») | 200, 400, 403, 404 | `/teacher`, `/teacher/monitor/[studentId]`, `/arm` |
| `GET /sessions/[id]/control` | — | store (занятие + `SessionPlan`) | `SessionControlResponse { session, plan, paused, pausedAt, pendingCount }` | 200, 404 | `/teacher` |
| `POST /sessions/[id]/control` | `{ action: pause \| resume \| issue \| report, studentId?, cardId? }` | store | `SessionControlResponse` (issue добавляет `CardFlowItem` «сейчас»; report — `finished` → `reported` **и формирует отчёт занятия** по попыткам) | 200, 400, 404, 409 | `/teacher` |
| `GET /users` | `role`, `group` | store пользователей (сид `users.json`) | `PublicUser[]` (без `password`) | 200, 400, 403 (обучающийся) | `/teacher/session`, `/teacher` |
| `GET /reports` | `sessionId` и/или `studentId` (хотя бы один) | `reports.json` + отчёты рантайм-занятий (сборка по попыткам, см. ниже) | `ReportsResponse { reports, groupReport \| null }` | 200, 400, 401, 403, 404 | `/teacher/reports/[sessionId]`, `/arm/progress` |
| `GET /reports/journal` | `teacherId`, `studentId`, `group`, `category`, `from`, `to` (даты `YYYY-MM-DD`, включительно) | `sessions.json` + `reports.json` + отчёты рантайм-занятий + `users.json`/`cards.json` | `ReportJournalResponse { rows, filters }` (`buildSec` — формирование отчёта, ТЗ §7) | 200, 403 (обучающийся) | `/teacher/reports` |
| `POST /reports/feedback` | `{ reportId, teacherId, text, recommendations? }` (`reportId` — статического или рантайм-отчёта) | store обратной связи | `ReportFeedback`; повтор заменяет запись, отдаётся в `Report.teacherFeedback` | 201, 400, 403, 404 | `/teacher/reports/[sessionId]` → `/arm/progress` |
| `GET /attempts/[id]/evaluation` | id попытки (`CardEvent.id`) | занятия store + эталоны сценариев, через ИИ-шлюз | `Evaluation` | 200, 403, 404 `notFound` / `evaluationPending` | `/arm/progress`, отчёты |
| `POST /attempts/[id]/evaluation` | `{ teacherId, score: 0–100, comment }` | store попытки + запись аудита `evaluation.override` | `Evaluation` с `teacherOverride` (приоритет преподавателя, Q&A в3) | 200, 400, 403, 404 | `/teacher/reports/[sessionId]` |
| `GET /admin/users` | `role` (3 роли), `state` (`active` \| `blocked`), `group`, `q` — поиск по ФИО/логину, регистронезависимо | store пользователей | `PublicUser[]` (без `password`) | 200, 400 | `/admin/users` |
| `POST /admin/users` | `{ adminId, fullName, login, password, role, armNumber, group?, service?, assignedGroups? }`; логин — латиница без пробелов, № АРМ — целое > 0 | store (id `u-NNN`) + аудит `user.create` | `PublicUser` | 201, 400, 403, 409 `conflict` (логин занят) | `/admin/users` |
| `PATCH /admin/users/[id]` | `{ adminId, fullName?, login?, armNumber?, group?, service?, assignedGroups?, role? }`; `role` — отдельное действие «смена роли» | store + аудит `user.update` и/или `user.roleChange` | `PublicUser` (ролевые поля приведены к новой роли) | 200, 400, 403, 404, 409 | `/admin/users` |
| `POST /admin/users/[id]/block` | `{ adminId }` | store (`isActive = false`) + аудит `user.block` | `PublicUser` | 200, 400, 403, 404, 409 (сам себя) | `/admin/users` |
| `POST /admin/users/[id]/unblock` | `{ adminId }` | store (`isActive = true`) + аудит `user.unblock` | `PublicUser` | 200, 400, 403, 404 | `/admin/users` |
| `POST /admin/users/[id]/reset-password` | `{ adminId }` | store (новый временный пароль) + аудит `user.passwordReset` | `{ user: PublicUser, temporaryPassword }` — пароль показывается администратору один раз | 200, 400, 403, 404 | `/admin/users` |
| `POST /admin/users/[id]/toggle-active` | `{ adminId }` | store + запись аудита `user.block` / `user.unblock` | `PublicUser` | 200, 400, 403, 404, 409 | `/admin/users` |
| `GET /admin/services` | — | store (сид `mocks/admin/system-services.json`) | `SystemService[]` | 200 | `/admin/system` |
| `GET /admin/settings` | — | store (сид `mocks/admin/system-settings.json`) | `SystemSettings` | 200 | `/admin/system` |
| `GET /admin/audit` | `type` (7 типов события), `operator` (ФИО/логин/№ АРМ), `card` (id карточки), `from`/`to` (ISO, включительно), `q`, `page`, `perPage` | store: сид `mocks/admin/audit-log.json` + рантайм-события | `PageResponse<AuditLogEntry>` `{ items, total, page, perPage }`, новые первыми | 200, 400 | `/admin/system` |
| `GET /admin/system/services` | — | store сервисов + сводка самопроверки | `SystemServicesResponse { services, integrity }` | 200 | `/admin/system` |
| `POST /admin/system/services/[id]/action` | `{ action: start \| stop \| restart, adminId? }` | store: переход состояния + аптайм; аудит `service.action`, запись в системные журналы | `SystemServicesResponse` | 200, 400, 404, 409 (критичный сервис при идущем занятии) | `/admin/system` |
| `GET /admin/system/settings` | — | store настроек | `SystemSettings` (+ `security`, `performance`, `autoRecovery`) | 200 | `/admin/system` |
| `PATCH /admin/system/settings` | `SystemSettingsPatch` — секции `telephony`, `backup`, `logging`, `security`, `performance`, `autoRecovery`, `adminId?`; `database` не принимается (read-only) | store + аудит `settings.update` (обновление `backup.lastAt` — `backup.run`) | `SystemSettings` | 200, 400, **422** (нарушены нормативы ТЗ, сообщение перечисляет поля) | `/admin/system` |
| `GET /admin/system/logs` | `level` — `INFO` \| `WARN` \| `ERROR` | store: сид `mocks/admin/system-logs.json` + события действий над сервисами | `SystemLogEntry[]`, новые первыми | 200, 400 | `/admin/system` |
| `GET /admin/system/monitoring` | — | `mocks/admin/monitoring.json` (статичные ряды за 24 ч) | `SystemMonitoring` (ряды + нормативы 20 сессий / 2 с) | 200 | `/admin/system` |
| `GET /admin/system/usage-stats` | `period` — `week` \| `month` | `mocks/admin/usage-stats.json` | `UsageStats { periods }` | 200, 400 | `/admin/system` |

## Соглашения

### Множественные query-параметры

Единый формат проекта — **повторный ключ**: `?okrug=ЮАО&okrug=ЦАО` (OR внутри поля). CSV не разбирается:
запятая — часть значения. Клиент `buildQuery` сериализует массив так же. Пустые значения не применяются.

### Расширенный поиск `GET /cards`

Поля — `CardSearchFilters` (`spec/04-pages/01-arm-main.md` → «Расширенный поиск»), логика — `filterCards`
(`src/entities/incident/model/filters.ts`): AND между полями, OR внутри множественного, регистр и «ё/е»
не различаются.

| Поле | Query-ключ | Семантика |
|---|---|---|
| Тип происшествия | `incidentType` | подстрока итогового типа / класса |
| Признаки | `sign` (повтор; синоним `signs`) | только 1–2-й уровень дерева — 3-й уровень ПОВ-112 не ищет |
| АРМ | `arm` (повтор; `arms`) | номер АРМ из «Опер. N, АРМ M, …» |
| Адрес | `address` | подстрока формализованного адреса |
| По округу | `okrug` (повтор; `okrugs`) | точное совпадение |
| По району | `raion` | одно значение, точное совпадение |
| По описательному адресу | `descriptiveAddress` | подстрока |
| По региону | `region` | компонент адреса перед «(округ, район)», без страны |
| По службе | `service` (повтор; `services`) | id `ServiceRef` в `notificationList` |
| По описанию | `description` | подстрока |
| Заявитель | `applicant` | подстрока ФИО или цифры АОН |
| По каналу связи | `channel` (повтор; `channels`) | карточки с АОН — «телефония (АОН)» (в фикстурах поля канала нет) |
| По источнику | `source` (повтор; `sources`) | точное совпадение |
| По оператору | `operator` | подстрока «Опер. …» и операторов отработок |
| Номер карточки | `cardNumber` | подстрока номера |
| Статус карточки | `cardStatus` (повтор; синонимы `cardStatuses`, `status`) | `reference.cardStatuses`, мусор → 400 |
| Период заведения | `createdFrom`, `createdTo` | ISO, обе границы включительно, мусор → 400 |

Базовые фильтры T1.1-10 сохранены: `type` — точное совпадение типа, `q` — подстрока по номеру, адресам и типу.
`dataset` = `all` (по умолчанию) | `fixtures` | `training`. `view` (селектор ленты «выберите что показать», T2.2-03) =
`all` (по умолчанию) | `empty` — «Пустые карточки»: статус `completed`/`unfinished` без отработок и оповещённых служб
(признака «Нет контакта»/«Срыв звонка» в моках нет) | `sms` — «Новые СМС»: есть входящие СМС (`smsList` или store).
`sort` = `-createdAt` (колонка «Дата ↓», новые сверху) | `createdAt`; без параметра — порядок источника. Мусор в
`view`/`sort` → 400. Пагинация (`page` с 1, `perPage` 1–100, по умолчанию 10)
применяется **после** фильтров; `total` — число найденных; страница за пределами — пустой `items`.

### Пространства id карточек

- `card-*` — 12 UI-фикстур ПОВ-112 (`fixtures/arm-cards.json`), экранный рендер карточки.
- `c-001` … `c-096` — учебные карточки (`cards.json`, билет.ситуация). В `GET /cards/[id]` у них есть
  `resolvedFixtureId` — фикстура группы ЕКП (правило — `src/shared/api/mock/fixture-map.ts`). В списке `GET /cards`
  учебная карточка — проекция поверх той же фикстуры: id, номер = цифры id, заявитель и АОН, адрес, фабула в
  «Описании», статус «Зарегистрирована»; округ/район пусты (в учебных данных их нет), эталон не раскрывается.

### Статусы ДДС

Граф — только данные `reference.ddsStatuses[].next` (машина `createDdsStatusMachine`, `src/entities/service`).
Первичный статус — `accepted` или `notAccepted`; `requiresComment` (`notAccepted`, `workRefused`) без
`comment` → 400; переход вне графа → 409 `invalidTransition`; неизвестный статус → 400.

### Окно ленты занятия `since` / `at`

`GET /sessions/[id]/feed` отдаёт события окна **(since, at]**: `since` не включается (уже виденные),
`at` включается; `at` по умолчанию — серверное «сейчас». Виды событий: `cardIssued` (из `cardFlow`),
`cardOpened`, `statusChanged` (с `mark`), `cardCompleted` (с `fullProcessingMs`) — из `cardEvents`,
`aiEvaluation` (из `CardEvent.evaluation`: `isAi: true`, `totalScore`, `errorCount`, `aiComment` — UI
показывает бейдж «ИИ»). Порядок — по времени, при равных метках: выдача → открытие → статус → завершение →
оценка ИИ, затем курсант, карточка. Реальное время эмулирует клиент: повторяет запрос каждые 2–5 с с
`since` = предыдущий `at` (соединения не держатся, SSE не нужен; подписка —
`createFeedSubscription`, `src/shared/lib/realtime`).

Необязательный `studentId` сужает ленту до одного курсанта (экран `/teacher/monitor/[studentId]`).
Доступ (T3.3-09): преподаватель — только занятия, которые ведёт сам (чужое → 403 `forbidden`);
обучающийся — только занятие, в котором участвует, и только свои события (чужой `studentId` → 403);
администратор и запрос без cookie — без ограничений.

### Оценка попытки и ИИ

Готовая `evaluation` из занятия отдаётся как есть (`teacherOverride` приоритетен). Иначе — детерминированная
мок-оценка по эталону сценария (`generateEvaluation`, `src/entities/report`) через `AiGateway`
(`app/api/mock/_server/ai-gateway.ts`, реализация `MockAiGateway` — «ИИ-модуль: заменить на реальный сервис»).
`aiComment` начинается с «ИИ-оценка (мок):» — UI показывает бейдж «ИИ».

### Правка оценки преподавателем и балл отчёта (T3.4-09)

`POST /attempts/[id]/evaluation` записывает в оценку попытки `teacherOverride` (балл 0–100 + обязательный
комментарий) и добавляет запись аудита `evaluation.override` с «было → стало» и ФИО преподавателя —
она видна в `/admin/system` → журналы. Оценка ИИ (`totalScore`, `aiComment`) остаётся в объекте рядом.
`GET /reports` отдаёт **живой** отчёт: `Report.score` — среднее по попыткам курсанта в занятии
(правка приоритетна), `charts.dynamics` — те же значения по попыткам. Без правок значения совпадают
с `reports.json` (объективность расчётов, ТЗ §17). Время формирования отчёта (`buildSec` журнала) —
разница `generatedAt` отчёта и `finishedAt` занятия: в моке 22 с при нормативе ≤ 30 с (ТЗ §7).
То же правило действует и для отчётов занятий, проведённых в этом процессе (см. ниже).

### Отчёт занятия по рантайм-данным

В `reports.json` лежат отчёты единственного занятия `ses-2026-09-16-01`. У занятия, проведённого в этом
процессе (мастер → работа курсанта → «Завершить занятие» → «Сформировать отчёт»), отчёт **собирается из
попыток** — `src/shared/api/mock/reports-runtime.ts`, доменные функции приходят из `app/api/mock/_server`
(`entities/report` — оценка попытки через `AiGateway`; `entities/session` — `resolveTimeNorms`;
`shared/lib/grammar-check` — внутри оценки). Контракт тот же, что у статики: `Report` (`student`,
`timeMetrics`, `grammarErrors`, `errors`, `score`, `charts.byStage/byErrorType/dynamics`, `aiComment`,
`exportFormats`) и `GroupReport` (`groupInsights` + три графика).

- **Когда.** Переход `finished → reported` (`POST /sessions/[id]/control {action:"report"}`) формирует отчёт
  сразу; если действие не выполнялось, отчёт завершённого занятия собирается лениво при `GET /reports`
  и `GET /reports/journal`. Незавершённое занятие отчёта не даёт (`reports: []`, `groupReport: null`).
- **Идемпотентность.** Маркер — групповой свод занятия в store: повторный запрос отдаёт уже
  сформированный отчёт, `generatedAt` не меняется, дублей нет. Занятие со статикой в `reports.json`
  рантайм-сборку не запускает — статические отчёты остаются неизменными.
- **Что считается.** В отчёт идут только завершённые попытки (`completedAt` ≠ `""`). `timeMetrics` — два
  этапа на попытку («Первичная реакция» / «Полная отработка») против нормативов сценария (по умолчанию
  30 с / 180 с) с `deviationMs` со знаком; `errors` и `grammarErrors` — из `Evaluation` попытки с добавленным
  `cardId`; `score` — среднее по попыткам; `charts.dynamics` — балл каждой попытки. Оценка, сгенерированная
  при сборке, фиксируется в `CardEvent.evaluation` занятия — дальше её читают `GET /attempts/[id]/evaluation`,
  лента занятия и пересчёт балла.
- **id.** `rep-<хвост id занятия>-<studentId>`, групповой — `rep-<хвост id занятия>-group`
  (`ses-042` → `rep-042-u-005`, `rep-042-group`), как у отчётов мока.
- **Правки преподавателя.** `POST /attempts/[id]/evaluation` и `POST /reports/feedback` работают и с
  рантайм-отчётом: правка балла приоритетна (пересчитываются `Report.score` и `charts.dynamics`), обратная
  связь отдаётся в `Report.teacherFeedback`. Сам отчёт при этом не пересобирается.
- **«Сформирован за N сек»** (`ReportJournalRow.buildSec`, ТЗ §7) — честная разница `generatedAt` отчёта и
  `finishedAt` занятия: у демо-пути «Завершить занятие → Сформировать отчёт» это единицы секунд при
  нормативе ≤ 30 с.
- **Нет данных.** Курсант без завершённых попыток получает не пустой и не битый отчёт, а отчёт с честным
  `aiComment` «Нет данных по попыткам…», пустыми `timeMetrics`/`errors` и пустыми сериями графиков;
  у занятия без попыток такой же текст уходит в `groupInsights`.

### Изоляция данных обучающегося (T2.5-01)

Пользователь запроса — из мок-сессии (cookie `arm112_session`, разбор — `app/api/mock/_server/viewer.ts`),
а не из query. Для роли `student`: `GET /reports` и `GET /sessions` всегда фильтруются по своему `userId`
(чужой `studentId` в query → 403 `forbidden`), групповой отчёт не отдаётся (`groupReport: null`),
`GET /sessions` возвращает проекцию занятия (`studentIds` — только свой id, `cardFlow`/`cardEvents` — только
свои); `GET /attempts/[id]/evaluation` чужой попытки → 403. Аноним (нет/истекла сессия) с `studentId` → 401.
Преподаватель/администратор — без ограничений; запросы без cookie по `sessionId` работают как в волне 1.

### Конструктор сценариев (фаза 3.1)

Правка сценария — `PATCH /scenarios/[id]`: применяются только переданные поля; `difficulty` пересчитывает
`level` (1–2 → `beginner`, 3–5 → `advanced`), нормативы времени должны быть > 0, порог грамматических
ошибок — целое ≥ 0. `mode` (`demo | follow | practice`) — [расширение] поля `Scenario`: в `spec/05` §6 его
нет, в `scenarios.json` оно отсутствует; режим самого занятия задаёт `Session.mode`.

Удаление (`DELETE /scenarios/[id]?deletedBy=`) доступно только для неактуальных сценариев: `source:
'template'` — системные 32 билета (409 `conflict`), сценарий из `Session.scenarioIds` — используется в
занятии (409 `conflict`). Удаление и все решения валидации пишутся в `GET /admin/audit`
(`scenario.update/delete/generate/approve/approvePartial/reject/submit`, `material.upload`,
`profileMapping.save`) с `userId` преподавателя.

Генерация (`POST /scenarios/generate`) идёт через `AiGateway.generateScenario` — детерминированный мок:
одна и та же категория даёт те же названия вариаций, поэтому повторный вызов возвращает уже сохранённые
сценарии и дублей не создаёт. Очередь карточек вариации — первые учебные карточки той же группы ЕКП.

Привязка профильных категорий: строки заданы сидом `PROFILE_MAPPING_SEED` (`src/shared/config`), тот же
источник читает `@/entities/session` → `PROFILE_CATEGORIES`. Преподаватель меняет только набор групп ЕКП;
`studentCount` считает мок-слой по `users.json`.

### Мок-токен

`AuthSession.token` = `mock-<userId>-<время выдачи, base36>` — не секрет и сервером мок-слоя не проверяется.
Пароли в ответах не возвращаются.

### Сессия и гварды (T2.1)

После входа (и 2FA) клиент кладёт `AuthSession` в cookie `arm112_session` (JSON, URL-кодирован, `Path=/`,
`SameSite=Lax`, `Max-Age` до истечения 24 ч от `issuedAt`) — стор `sessionStore` из `@/entities/user`.
Проверку делает `proxy.ts` (Next 16, бывший middleware) по матрице `spec/02-roles.md` для `/arm/*`, `/teacher/*`,
`/admin/*`: нет сессии → `307 /login?returnUrl=…`; старше 24 ч → `307 /login?returnUrl=…&reason=expired` + удаление
cookie; чужая роль → `403` (rewrite на `/forbidden`). Серверные лэйауты разделов повторяют проверку
(`requireSessionUser`). Эндпоинты `/api/mock/*` cookie не проверяют.

## Примеры

```bash
curl 'localhost:3000/api/mock/cards?okrug=%D0%AE%D0%90%D0%9E&cardStatus=registered'   # ЮАО + «Зарегистрирована»
curl -X POST localhost:3000/api/mock/cards/card-881412/status \
  -H 'Content-Type: application/json' -d '{"ddsStatus":"notAccepted"}'                  # 400: нужен комментарий
curl 'localhost:3000/api/mock/sessions/ses-2026-09-16-01/feed?at=2026-09-16T10:10:00%2B03:00'
curl localhost:3000/api/mock/attempts/att-01/evaluation
```

Контракты закреплены тестами: `src/shared/api/mock/__tests__/contracts.test.ts` (коды ответов всех эндпоинтов)
и `src/shared/api/mock/routes/*.test.ts`. Сквозной путь «занятие → попытки → отчёт → правка оценки →
обратная связь» на реальных handler-ах — `src/shared/api/mock/routes/reports-runtime.test.ts`,
сборка отчёта — `src/shared/api/mock/reports-runtime.test.ts`.
