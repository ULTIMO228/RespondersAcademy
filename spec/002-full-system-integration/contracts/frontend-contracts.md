# Контракты фронтенда (Фаза 1): маршруты, клиентский API, состояния экранов

Контракты бэкенда — [`v1-integration.md`](v1-integration.md); формы данных — [`../data-model.md`](../data-model.md). Здесь — то, что фронт **предоставляет** внутри себя: маршруты, публичный API клиентских модулей (`src/shared/api`), правила отображения ошибок и состояния экранов. Сигнатуры — проектный контракт для реализации, не готовый код; точные типы берутся из схем бэкенда (`extract_ts_fields.py`). Правила фронта: FSD, публичный API слайса через `index.ts`, без `export *`, только CSS-модули на токенах (AGENTS §7).

---

## 1. Маршруты и гварды

| Маршрут | Роль | Слайс (`src/pages`) | Обёртка (`app/`) |
|---|---|---|---|
| `/student/assignments` | student | `student-assignments` | `app/student/assignments/page.tsx` |
| `/arm/operator112?assignmentId=…` | student | `operator112` | `app/arm/(section)/operator112/page.tsx` |
| `/student`, `/student/results[/id]`, `/student/analytics` | student | `student-home`, `student-results`, `student-analytics` | `app/student/**` |
| `/reference`, `/reference/[id]`, `?group=…&q=…` | все роли | `reference` | `app/reference/**` |
| `/account`, `/account/security` | все роли | `account` | `app/account/**` |
| `/arm/card/[cardId]`, `/arm`, `/arm/phone` | student (симулятор) | `incident`, `journal`, `phone` (расширяется `incident`) | существуют |

`ROUTES` (`src/shared/config/routes.ts`) получает: `armAssignments`, `armOperator112(assignmentId)`, `armKb(params?)`. Гвард — существующий `proxy.ts` (matcher `/arm/:path*`): чужая роль → `/forbidden`, без сессии → `/login`; правки не требуются, нужен тест на новые пути. Параметр `assignmentId` без прав → 403 сервера → экран «Доступ запрещён»; неизвестный → сообщение «Задание не найдено» (404).

---

## 2. Клиентский API (`src/shared/api/endpoints/*`)

Все функции возвращают `Promise<T>` и бросают `ApiError { status, code, message }` (`client.ts`); `message` — русский текст сервера, показывается как есть. `signal?: AbortSignal` — последним аргументом у чтений.

```ts
// operator112.ts
// Выдача и восстановление попытки — assignments.startAssignment(); прямого createAttempt в UI нет (в экзамене он даёт 409).
answerAttempt(attemptId): Promise<OperatorAttempt>
sendAttemptEvent(attemptId, event: { type: OperatorEventType; payload?: Record<string, unknown> }): Promise<OperatorEvent>
getNotificationList(attemptId, preview?: { signs?: string[]; classifierCode?: string }): Promise<NotificationListResponse>
submitAttempt(attemptId, draft: CardDraft): Promise<{ attempt: OperatorAttempt; card: IncidentCard; evaluationId: string; chainReview?: ChainReview }>
getAttemptEvaluation(attemptId): Promise<OperatorEvaluation>
searchStreets(query: string, limit?: number): Promise<Street[]>     // query ≥ 3 символов, иначе 400 — клиент не отправляет
getTicketAudio(cardId): Promise<TicketAudio>
ticketAudioFileUrl(cardId): string                                  // /api/v1/tickets/{id}/audio/file — для <audio src>

// assignments.ts
listAssignments(params?: { state?: string }): Promise<Assignment[]>
getAssignment(id): Promise<AssignmentDetail>
startAssignment(id): Promise<StartAssignmentResult>                 // union: { kind: "operator112"; attempt } | { kind: "dds"; sessionId; attempt; created }
finishAssignment(id): Promise<Assignment>                              // только преподаватель/администратор; у обучающегося сервер отвечает 403, в UI вызова нет

// lobby.ts
getMe(): Promise<PublicUser>
getHistory(params?: { mode?; format?; page?; perPage? }): Promise<Page<HistoryItem>>
getAnalytics(): Promise<Analytics>
listRecommendations(limit?: number): Promise<Recommendation[]>
acceptRecommendation(id): Promise<Recommendation>

// kb.ts
listKbArticles(params?: { group?: string; q?: string }): Promise<KbArticle[]>
getKbArticle(id): Promise<KbArticle>

// work-messages.ts
listWorkMessages(attemptId, since?: string): Promise<WorkMessage[]>
postReportAudio(attemptId, wav: Blob, toNumber?: string): Promise<ReportAudioResponse>  // multipart: поле file; to_number
```

**Различение ответа `startAssignment`**: клиент определяет вид по форме (`state` ∈ `ringing|answered|submitted` и `cardId` на верхнем уровне → `operator112`; вложенный `attempt.attempt` и `sessionId` → `dds`) и возвращает размеченное объединение, чтобы страницы не разбирали структуру.

**Ошибка «требуется сервер»**: `ServerRequiredError extends ApiError` (`status` 404, `code: "serverRequired"`; тело без `error.code`) для клиентов с флагом `requiresServer` — путей `/api/v1/*` вне `/api/v1/ai/*`. Сетевой сбой (`status` 0) остаётся `networkError` и ведёт к баннеру «Нет соединения» (§3); поправка по итогам T007. Подробности и обоснование — `research.md` R10. Страницы ловят её отдельно от обычных ошибок.

---

## 3. Соответствие ошибок сервера сообщениям интерфейса

Сообщение сервера показывается дословно; фронт добавляет только вид представления.

| Статус / код | Где | Представление |
|---|---|---|
| 401 | любой запрос | Переход на `/login` |
| 403 | попытка/задание/рекомендация не свои | Экран «Доступ запрещён» (`/forbidden`), без деталей |
| 400 `validationFailed` | `submit`, `streets`, `report-audio`, `events` | Сообщение у поля/формы, введённое сохраняется |
| 404 | задание, попытка, статья | «Не найдено» с кнопкой возврата |
| 404 на `audio/file` | плеер | Аварийный транскрипт (не ошибка) |
| 409 `invalidTransition` | `answer`, `events`, `submit` | Обновить состояние из сервера, показать сообщение («Сначала примите вызов», «Карточка уже отправлена») |
| 409 `conflict` | `start`, `events`, `audio/file`, `POST /operator112/attempts` | Сообщение как есть: «Все билеты задания уже выполнены», «Вход ДДС ожидает проверки и подтверждения преподавателем», «В экзамене запись прослушивается один раз» (клиентский текст — «Повторное прослушивание в экзамене запрещено») |
| 503 | `report-audio` | «Распознавание речи недоступно» (модель не установлена) — остальные функции карточки работают |
| 0 (сеть) | любой | Баннер «Нет соединения с сервером» (`ConnectionBanner`), данные не теряются |

---

## 4. Состояния экранов (обязательные: loading / empty / error / success)

| Экран | loading | empty | error | success |
|---|---|---|---|---|
| Задания | Скелетон списка | «Заданий пока нет» | Сообщение + «Повторить» | Список карточек |
| Режим 112 | «Выдача вызова…» | — | Ошибка выдачи с причиной (409/403/404) | Рабочее место (звонок → разговор → разбор) |
| Прогресс | Скелетоны блоков | Пусто по истории/рекомендациям — без ошибок | Ошибка на уровне блока, остальные блоки живы | Сводка + история + рекомендации |
| База знаний | Скелетон | «Ничего не найдено» | Сообщение + «Повторить» | Статья из пяти разделов |
| Лента сообщений (карточка ДДС) | — | Блок скрыт, если занятие не включало сообщения | Баннер потери связи, загруженное сохраняется | Сообщения по времени |
| Голосовой доклад | «Распознаём…» | — | Причина (400/503/микрофон) | Транскрипт + чек-лист |
| Любой новый экран без бэкенда | — | — | «Раздел требует подключения к серверу тренажёра» | — |

---

## 5. Контракты компонентов (внутренние)

Сигнатуры уточняются в задачах; здесь — границы ответственности.

| Слайс | Отвечает за | Не отвечает |
|---|---|---|
| `entities/operator112-attempt` | Машина состояний, таймеры (ожидание ответа, разговор, лимит), селекторы | Сеть, DOM |
| `widgets/operator112-softphone` | Индикатор вызова, «Ответить», таймер разговора, плеер, аварийный транскрипт | Заполнение карточки |
| `features/operator112-questionnaire` | Дерево признаков из `/api/mock/classifier`, события, пересчёт списка оповещения | Логика ЕКП (у сервера) |
| `features/operator112-address` | Подсказка улиц, `address.source` | — |
| `pages/operator112` | Сборка экрана, `start`/`submit`, ошибки, разбор | Прямые `fetch` |
| `widgets/work-message-feed` | Лента по `createFeedSubscription`, тексты по `kind`, дедупликация по `id` | Планирование сообщений (бэкенд) |
| `shared/lib/audio-recorder` | Микрофон → WAV моно 16 бит 16 кГц ≤ 180 с; подменяемый интерфейс | Отправка |
| `features/report-recorder` | Кнопки записи/отправки, состояния, вывод чек-листа | Формат WAV (у `shared/lib`) |

Тексты сообщений служб по `kind` (FR-033): `departed` — «Расчёт выехал к месту вызова», `arrived` — «Расчёт прибыл на место», `started` — «Начаты работы», `done` — «Работы завершены»; формат строки — «ЧЧ:ММ:СС · текст» по `at`.

---

## 6. Платформа: маршруты, авторизация, клиенты (часть B)

Полная карта маршрутов — `../07-platform-shell.md` §3.1 (студенческие, преподавательские, административные страницы, редиректы `/arm/progress → /student/analytics`, `/arm/help → /reference`). Ниже — контракты, которые платформа предоставляет внутри фронта.

### 6.1. Авторизация (`src/shared/api/endpoints/auth.ts`)

```ts
login(body: { login: string; password: string; armNumber?: number }): Promise<LoginResult>   // { userId, role }; cookie ставит сервер, токен из тела отбрасывается
getSession(signal?): Promise<PublicUser>                                      // GET /auth/session; 401 → ApiError
logout(): Promise<void>                                                       // POST /auth/logout → 204 (идемпотентен); cookie очищает сервер
changePassword(body: { currentPassword: string; newPassword: string }): Promise<void>   // POST /auth/password → 204; неверный текущий → 400
logoutAll(): Promise<void>                                                    // POST /auth/logout-all
getAuthPolicy(): Promise<{ twoFactorRequired: false; minPasswordLength: number; lockAfterAttempts: number }>
```

- Клиентский код **не читает и не пишет** `arm112_session` (проверка `grep document.cookie` в T036).
- Серверные модули (`src/entities/user/index.server.ts`, реализовано в T036): `verifySession()`, `getSessionUser()` (без редиректа), `requireSessionUser(role)`; `verifySession(): Promise<{ user: PublicUser }>` — серверный `fetch` на **собственный origin** `${origin}/api/mock/auth/session` с пробросом заголовка `cookie` (origin — из `headers()`: `x-forwarded-proto` и `host`); запрос обслуживает бэкенд по rewrite (при `BACKEND_URL`) либо мок-обработчик, `BACKEND_URL` не читается (AGENTS §6); результат кэшируется на рендер (`React.cache`); при неудаче — редирект на `/login?returnUrl=…&reason=…`.
- `authProxy` — оптимистично: cookie есть, `exp` не истёк, роль допускается для префикса маршрута; иначе `/login` или `/forbidden` (403).
- 401 на любом запросе клиента, кроме `/auth/login` и `/auth/logout` → переход на `/login?reason=expired&returnUrl=…`: единая точка — `setUnauthorizedHandler` в `client.ts`, обработчик регистрирует `AuthSessionProvider` (срабатывает один раз).
- `returnUrl` — только относительный путь внутри приложения (без `//` и схемы); иначе игнорируется.

### 6.2. Сообщения входа

| Ситуация | Текст |
|---|---|
| Неверный логин или пароль | «Неверный логин или пароль» |
| Учётная запись заблокирована | «Учётная запись заблокирована. Обратитесь к администратору» |
| Лимит попыток исчерпан | Сообщение сервера о временной блокировке |
| Сессия истекла / завершена | «Сессия истекла. Войдите снова» |

### 6.3. Клиенты преподавателя и администратора

```ts
// teacher (src/shared/api/endpoints/*; сверено с кодом 2026-09-29)
createAssignment(body: AssignmentCreateRequest): Promise<Assignment>            // POST /assignments (assignments.ts)
listAssignments / getAssignment                                                  // общие с обучающимся, права различает сервер
finishAssignment(id)                                                            // только преподаватель (и администратор)
listTickets(query?): Promise<Ticket[]>                                          // GET /tickets (tickets.ts); отбор утверждённых — поле approved
getStudentProfile(studentId): Promise<StudentProfile>                           // GET /teacher/students/{id}/profile (lobby.ts)
getGroupInsights(groupId, assignmentId?): Promise<GroupInsights>                // GET /teacher/groups/{id}/insights (lobby.ts)
updateKbArticle(id, sections): Promise<KbArticle>                               // PATCH /kb/articles/{id} (kb.ts), тело только { sections }
downloadReportExport(reportId, format: "csv" | "pdf"): Promise<Blob>           // GET /reports/{id}/export.csv|pdf (reports.ts)
// admin
getHealth(): Promise<HealthStatus>                                              // GET /api/v1/health → { status, db, version } (health.ts)
getAuditLog(query?): Promise<PageResponse<AuditLogEntry>>                       // GET /admin/audit: type, operator, card, q, from, to, page, perPage
getSystemSettings() / patchSystemSettings(patch)                                // GET/PATCH /admin/system/settings (блок security)
```

### 6.4. Состояния платформенных страниц

Те же четыре состояния (§4) плюс «требуется сервер»; для страниц с несколькими блоками (главная, аналитика) ошибка блока не роняет страницу — блок показывает ошибку и «Повторить», остальные живы.
