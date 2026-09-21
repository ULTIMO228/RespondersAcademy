# Контракт волны B: новые эндпоинты `/api/v1` (FR-063)

Только под `/api/v1` (в `/api/mock` не зеркалируются). Формат ответов и ошибок — как в волне A. Доступ — по viewer (cookie/Bearer), аноним → 401. Формы — Pydantic-схемы `backend/app/schemas/v1/*`; TS-типы для фронта генерируются из OpenAPI (`npm run api:types` — задача фронтендеров).

## Билеты и аудио (US3, US6; FR-012, FR-013, FR-023, FR-024)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `GET /tickets` | `group[]`, `difficulty[]`, `source`, `validationStatus`, `q` | `Ticket[]` = `IncidentCard` + `{ audio?: { status, durationMs }, validation?: ValidationReport, difficulty, approved }` | единый банк для обоих режимов; `c-NNN` |
| `POST /tickets` | `IncidentCard` без `id` + `difficulty` | `Ticket` (201) | ручное создание преподавателем; эталон достраивается по `group` через классификатор; грамматика проверяется |
| `POST /tickets/[id]/validate` | — | `ValidationReport { checks: [{ id: category \| address \| requiredFields \| duplicate \| grammar \| consistency, passed, confidence?, message }], passed, needsReview }` | R22 |
| `POST /tickets/[id]/audio` | `{ voice?: male \| female \| auto }` | `TicketAudio { status: pending \| ready \| failed, path?, transcript, durationMs? }` (202) | TTS Silero; фоновая задача, опрос через `GET /tickets/[id]/audio` |
| `GET /tickets/[id]/audio` | — | `TicketAudio` | |
| `GET /tickets/[id]/audio/file` | — | `audio/wav` | доступ: S — только в рамках активной попытки по билету; в экзамене — один запрос (счётчик `replays`) |

## Режим специалиста-112 (US3; FR-011–FR-017)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `POST /operator112/attempts` | `{ assignmentId, cardId }` | `OperatorAttempt { id, cardId, aon, incidentNumber, createdAt, answeredAt?, state }` (201) | «поступление вызова»; `aon` из билета |
| `POST /operator112/attempts/[id]/answer` | — | `OperatorAttempt` | фиксирует `answeredAt`; событие «вызов не принят вовремя», если > норматива |
| `POST /operator112/attempts/[id]/events` | `{ type: fieldChanged \| signSelected \| serviceAdded \| replay \| hintShown, payload }` | `Event` (201) | серверный таймстамп, «было/стало» |
| `GET /operator112/attempts/[id]/notification-list` | — | `{ finalType, classifierCode, services: [{ serviceId, addedBy }] }` | по выбранным признакам опросной карты через классификатор (FR-015) |
| `POST /operator112/attempts/[id]/submit` | `ArmCardFixture`-подобный `CardDraft` (заявитель, адрес, описание, признаки, флаги, опросная карта, список оповещения) | `{ attempt: OperatorAttempt, card: IncidentCard, evaluationId }` | сохраняет `card_snapshot`, создаёт `incident_cards` с `createdByStudentId` и `mode_origin=operator112` (US8), запускает оценку режима A (FR-036) |
| `GET /operator112/attempts/[id]/evaluation` | — | `Evaluation` + `fieldDiff: [{ field, entered, expected, ok }]` | FR-040 |
| `GET /streets` | `q` (≥ 3 символа), `limit` | `Street[]` | подсказка адреса (FR-014) |

## Задания и экзамен (US5; FR-003, FR-030)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `POST /assignments` | `{ studentIds[], trainingMode: dds \| operator112 \| chain, format: training \| exam, cardIds? \| randomRule { groups[], difficulty[], count }, params { norms, hints, passThreshold?, timeLimitSec? }, dueAt? }` | `Assignment` (201) | экзамен фиксирует набор при создании |
| `GET /assignments` | `studentId?`, `teacherId?`, `state?` | `Assignment[]` | S — только свои |
| `GET /assignments/[id]` | — | `Assignment` + `progress: [{ studentId, cardId, state, score?, passed? }]` | |
| `POST /assignments/[id]/start` | — | `{ attempt: OperatorAttempt \| CardAttemptResponse }` | выдаёт следующий билет в нужном режиме; экзамен: повтор по билету → 409 |
| `POST /assignments/[id]/finish` | — | `Assignment` | преподаватель завершает; незавершённые → «не завершено» |

## Лобби (US4; FR-044–FR-047)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `GET /me` | — | `PublicUser` + `{ armNumber, service, group }` | |
| `GET /me/history` | `mode?`, `format?`, `page`, `perPage` | `PageResponse<HistoryItem { attemptId, mode, format, cardId, title, score, passed?, at, reportUrl? }>` | |
| `GET /me/analytics` | — | `{ byMode: { dds: Stats, operator112: Stats }, reactionMs, topErrors: [{ type, count }], dynamics: LabeledSeries }` | только свои |
| `GET /me/recommendations` | `limit` | `Recommendation[] { id, kind, targetId, title, reason { errorType, count, ruleId }, createdAt }` | R22 |
| `POST /me/recommendations/[id]/accept` | — | `Recommendation` | понижает повторную выдачу |
| `GET /kb/articles` | `group?`, `q?` | `KbArticle[]` | |
| `GET /kb/articles/[id]` | — | `KbArticle { id, group, title, sections }` | |
| `PATCH /kb/articles/[id]` | `sections` | `KbArticle` | T |
| `GET /teacher/students/[id]/profile` | — | `{ ratings: { dds, operator112 }, strongerMode, typicalErrors: { dds: [], operator112: [] }, recommendations }` | US7 |
| `GET /teacher/groups/[id]/insights` | `assignmentId?` | `{ insights: [{ share, errorType, text }], suggestedGroup }` | FR-049 |

## Расширение ДДС (US9; FR-050)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `GET /attempts/[id]/work-messages` | `since?` | `WorkMessage[] { id, kind, at, expectedStatus }` | по расписанию билета; фронт опрашивает вместе с лентой |

## Служебное

### Экспорт отчётов (US5, T051)

`GET /reports/{id}/export.csv` и `GET /reports/{id}/export.pdf`: id индивидуального `Report` или `GroupReport`, полученный через `GET /reports`. CSV — UTF-8 BOM, одна строка на попытку; PDF — встроенный DejaVu Sans, таблица попыток, времена/отклонения, сводные показатели в таблицах. Только `/api/v1`, в `/api/mock` не зеркалируются.

Доступ: студент — собственный индивидуальный отчёт, преподаватель — отчёты своих занятий, администратор — любые. Коды: 200, 401, 403, 404; `Content-Disposition: attachment`, `Cache-Control: no-store`. Форматы используют текущие оценки с учётом override; для тренировки и экзамена без явно заданного `exam.passThreshold` итог «сдал/не сдал» пустой. Экспорт существующего отчёта ничего не изменяет в БД.

| Метод и путь | Ответ | Примечания |
|---|---|---|
| `GET /health` | `{ status, db, models: { embedder, speller, classifier, tts?, llm? }, version }` | используется интегрити админки |
| `GET /metrics/ml` | последние результаты `eval_*` из `backend/var/metrics.json` | SC-003…SC-008 на защите |
