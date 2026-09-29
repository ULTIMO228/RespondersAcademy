# Контракт волны B: новые эндпоинты `/api/v1` (FR-063)

Только под `/api/v1` (в `/api/mock` не зеркалируются). Формат ответов и ошибок — как в волне A. Доступ — по viewer (cookie/Bearer), аноним → 401. Формы — Pydantic-схемы `backend/app/schemas/v1/*`; TS-типы для фронта генерируются из OpenAPI (`npm run api:types` — задача фронтендеров).

## Билеты и аудио (US3, US6; FR-012, FR-013, FR-023, FR-024)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `GET /tickets` | `group[]`, `difficulty[]`, `source` (seed \| generated \| operator112 \| manual), `validationStatus`, `q` | `Ticket[]` = `IncidentCard` + `{ audio?: { status, durationMs }, validation?: ValidationReport, difficulty, approved, modeOrigin }` | единый банк для обоих режимов; `c-NNN`; `approved` — утверждённый сценарий или сидовый билет без сценария |
| `POST /tickets` | `IncidentCard` без `id` + `difficulty` (1–5) | `Ticket` (201) | T/A; группа только из справочника (400); `expectedServices`/`expectedTags` достраиваются по строке ЕКП группы, если не заданы; грамматика фабулы — `grammarErrors`; `mode_origin=manual`; аудит `ticket.create` (тип `content`) |
| `POST /tickets/[id]/validate` | — | `ValidationReport { checks: [{ id: category \| address \| requiredFields \| duplicate \| grammar \| consistency, passed, confidence?, message }], passed, needsReview }` | T/A; 401/403/404; R22; сохранение в `incident_cards.extra.validation` и отчётах связанных сценариев; не меняет утверждение преподавателя |
| `POST /tickets/[id]/audio` | `{ voice?: male \| female \| auto }` | `TicketAudio { cardId, status: pending \| ready \| failed, transcript, voice, path?, durationMs?, generatedAt?, error?, emergency }` (202) | T/A; текст — `AiGateway.call_script` или шаблон; TTS Silero в фоне (`BackgroundTasks`), перегенерация; без модели / `TTS_ENABLED=0` — `failed` + `emergency: true` (FR-013) |
| `GET /tickets/[id]/audio` | — | `TicketAudio` | нет записи → `status: pending`, `emergency: true` |
| `GET /tickets/[id]/audio/file` | — | `audio/wav` (Silero, 24 кГц mono) или `audio/mpeg` (локально установленная MP3-запись) | не готова → 404; S — только в рамках своей открытой попытки по билету (403); экзамен — один запрос (счётчик `replays`, второй → 409) |

## Режим специалиста-112 (US3; FR-011–FR-017)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `POST /operator112/attempts` | `{ assignmentId, cardId, studentId? }` | `OperatorAttempt { id, cardId, studentId, aon, incidentNumber, createdAt, openedAt, answeredAt?, completedAt?, state: ringing \| answered \| submitted, assignmentId, events[], replays, hintsShown, hints { enabled, idleSec, steps[{ stage, text }] }, audio: TicketAudio, cardSnapshot? }` (201) | «поступление вызова»; `aon` из билета; `studentId` — для T/A; тренировка: открытая попытка возвращается повторно (200), экзамен: повтор по билету → 409; запись билета ставится на синтез (Phase 10) |
| `POST /operator112/attempts/[id]/answer` | — | `OperatorAttempt` | фиксирует `answeredAt` (идемпотентно); событие `answerTimeout` в `events`, если > `params.norms.answerSec` (30 с); после `submit` → 409 |
| `POST /operator112/attempts/[id]/events` | `{ type: fieldChanged \| signSelected \| serviceAdded \| replay \| hintShown, payload }` | `Event { id, type, at, payload, before? }` (201) | серверный таймстамп; `fieldChanged { field, value }` получает `before`; до `answer` / после `submit` → 409; экзамен: второй `replay` → 409, `hintShown` при отключённых подсказках → 409; `signSelected { signs[] }`, `serviceAdded { serviceId }` питают список оповещения (Phase 10) |
| `GET /operator112/attempts/[id]/notification-list` | `signs[]?`, `classifierCode?` (предпросмотр) | `{ finalType, classifierCode, group, services: [{ serviceId, addedBy: auto \| manual, title, mode?, condition? }], conditional: [{ … }] }` | по признакам из событий (`signSelected`, `fieldChanged what.*`) через ЕКП (FR-015); условные колонки классификатора вычисляются по флагам карточки, невыполненные/неизвестные — в `conditional` для ручного добавления (Phase 10) |
| `POST /operator112/attempts/[id]/submit` | `CardDraft { applicant { name, status }, phones { aon, provided, onSite }, address { formal, street, house, okrug, raion, descriptive, source: directory \| manual }, what { pollAnswers, signs[], flags[], finalType, classifierCode, casualties { injured, ambulanceRefused, blocked } }, description, emergency { chs, chp }, notificationList[{ serviceId, addedBy }] }` | `{ attempt: OperatorAttempt, card: IncidentCard, evaluationId }` | минимум — адрес и описание/опросная карта (400); пустой `notificationList` достраивается по опросной карте; сохраняет `cardSnapshot`, создаёт `incident_cards` с `createdByStudentId`, `mode_origin=operator112`, `sourceCardId` (US8), считает оценку режима A синхронно (FR-036); экзамен → `passed` по `params.passThreshold`; повтор → 409 |
| `GET /operator112/attempts/[id]/evaluation` | — | `Evaluation` + `fieldDiff: [{ field, entered, expected, ok }]`, `mode: operator112`, `assessorVersion`, `components`, `warnings`, `passed?` | FR-040; до `submit` → 404 `evaluationPending`; та же оценка доступна через совместимый `GET /attempts/[id]/evaluation` |
| `GET /streets` | `q` (≥ 3 символа, иначе 400), `limit` (10, ≤ 50) | `Street[] { id, name, type, okrug?, raion? }` | подсказка адреса (FR-014): таблица `streets` (OSM, 3992) по префиксу, затем нечётко |

## Задания и экзамен (US5; FR-003, FR-030)

| Метод и путь | Вход | Ответ | Примечания |
|---|---|---|---|
| `POST /assignments` | `{ studentIds[], trainingMode: dds \| operator112 \| chain, format: training \| exam, cardIds? \| randomRule { groups[], difficulty[], count }, params { norms, hints, passThreshold?, timeLimitSec? }, dueAt?, title? }` | `Assignment` (201) | T/A; только активные обучающиеся и утверждённые билеты; ровно один источник `cardIds`/`randomRule`; экзамен фиксирует набор при создании и выключает подсказки; `dds` фильтруется по профилю службы |
| `GET /assignments` | `studentId?`, `teacherId?`, `state?` | `Assignment[]` | S — только свои; T — только созданные им; A — все; при чтении применяется истёкший `timeLimitSec` |
| `GET /assignments/[id]` | — | `Assignment` + `progress: [{ studentId, cardId, attemptId, state, score?, passed? }]` | 401/403/404; экзаменационная аналитика отделена полем `format` |
| `POST /assignments/[id]/start` | `{ studentId? }` | `{ attempt: OperatorAttempt \| CardAttemptResponse }` | S запускает себя; T/A передаёт `studentId`; открытая попытка возвращается, затем выдаётся следующий билет; после всех билетов → 409; `chain` — Phase 15 |
| `POST /assignments/[id]/finish` | — | `Assignment` | владелец-T/A завершает; незавершённые → `notCompleted`, экзамен → `passed: false`; повтор идемпотентен |

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
