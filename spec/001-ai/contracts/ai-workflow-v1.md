# Контракты ИИ-контура v1

**Статус**: проект совместимого расширения, 2026-09-22. Базовые поля сценария/события/оценки/отчёта остаются из `specs/002-two-mode-simulator/contracts/` и `src/shared/api/types/`. Полные новые ресурсы валидируются четырьмя схемами из [реестра контрактов](README.md); `ai-extension.schema.json` хранит общие определения. Реализация endpoint'ов — отдельный этап.

## Правило версионирования

`schemaVersion: "ai-workflow/1"` передаётся в новых ресурсах. Дополнительные поля в готовом `Evaluation` опциональны для старого клиента; обязательные числовые поля старого контракта не становятся `null`. Удаление поля, изменение значения enum или арифметики требует v2 и адаптера старого API. `mode` обязателен и принимает `operator112 | dds`.

## Модели данных

Миграции `0007_scenario_run_revision` (`ai_scenario_runs.revision`, оптимистичная блокировка) и `0008_scenario_run_active_unique` (один активный прогон версии на обучающегося). Миграция `0006_scenario_builder` (после `0005_error_map_verdicts`): `users.permissions`, `ai_scenario_versions.graph`, `ai_scenario_versions.reviewed_by`, `ai_scenario_versions.review_comment`, таблица `ai_scenario_runs`.

## Сценарий и эталон

| Операция | Доступ | Вход | Результат |
|---|---|---|---|
| `POST /api/v1/ai/scenarios/drafts` | teacher/admin | `mode`, `sourceTicketId`, `category`, `count` (1–5), `requestId` | Массив ID версий `draft`; повтор `requestId` возвращает тот же набор. |
| `POST /api/v1/ai/scenarios/{id}/revise` | teacher/admin | `baseVersion`, `comment`, `acceptedFields[]` (может быть пустым, если указан `graph`), `graph?` (`scenario-graph/1`), `requestId` | Новая версия `draft`, связь с комментарием; старая не меняется. Граф переходит в следующую версию; ошибки структуры — `400`. |
| `POST /api/v1/ai/scenarios/{id}/approve` | teacher/admin | `version`, `requestId` | `approved` только после полной валидации и авторства преподавателя; `409` при устаревшей версии. Для версии с графом, отклонённой или находящейся на проверке экспертом (кроме черновиков цепочки `student_card`) — `409`: такие версии проходят `/submit` → `/review` → `/publish`. |
| `GET /api/v1/ai/scenarios/{id}/versions` | teacher/admin | — | История с источником, проверками и решениями, без сырого неочищенного билета. |
| `POST /api/v1/ai/scenarios` | teacher/admin | `mode`, `sourceTicketId`, `category`, `title?`, `summary`, `address?`, `graph?`, `requestId` | Ручной черновик: версия 1, `sourceKind: ticket`, `approval: draft`; карточка и эталон строятся на очищенном билете и справочнике ЕКП, адрес сверяется с локальным справочником. Повтор `requestId` — тот же ответ, иная нагрузка — `409`. Необязательный `graph` (`scenario-graph/1`): ошибки структуры — `400`. |
| `GET /api/v1/ai/scenarios?mode=` | teacher/admin | — | Сводка по последней версии каждого сценария (`latestVersion`, `approval`, `validation`); преподаватель видит свои, администратор — все. |
| `GET /api/v1/ai/scenarios/{id}/versions/{n}` | teacher/admin | — | Одна версия с эталоном и решениями по полям; `404` для чужой/неизвестной версии. Изменение сохраняется через `revise` (новая версия). |
| `POST /api/v1/ai/scenarios/{id}/submit` | teacher-автор/admin | `version`, `requestId` | Черновик с `validation=passed` → `pending_review`; иначе — `409`. |
| `POST /api/v1/ai/scenarios/{id}/review` | право `scenario.review` или admin | `version`, `decision` (`accept\|reject`), `comment` (обязателен для `reject`), `requestId` | Только последняя версия (иначе `409`) и только в `pending_review`; автор не проверяет свою версию (`403`, кроме admin). `accept` проставляет `reviewedBy` и оставляет `pending_review`; `reject` → `rejected` + `reviewComment`. Повторная проверка — `409`. |
| `POST /api/v1/ai/scenarios/{id}/publish` | право `scenario.publish` или admin | `version`, `requestId` | Только `pending_review` с `reviewedBy` и `validation=passed` → `approved`; иначе — `409`; автор не публикует свою версию (`403`, кроме admin). |
| `POST /api/v1/ai/scenarios/graph/validate` | teacher/admin | `graph` | Проверка графа без сохранения: `{ valid, errors: [{ message, nodeId? }] }` (200 даже для некорректного графа; не-объект — `400`). |
| `GET /api/v1/ai/scenarios/sources` | teacher/admin | — | Утверждённые очищенные ситуации для создания сценария: `[{ sourceTicketId, situationNo, preview }]`. |
| `GET /api/v1/ai/scenarios/permissions` | teacher/admin | — | `{ permissions: [...] }` текущего пользователя (admin — оба права); для кнопок проверки и публикации. |
| `GET /api/v1/ai/scenarios?approval=` | эксперт (любое из прав `scenario.review`, `scenario.publish`) | — | Очередь экспертов; значения `draft`, `validation_failed`, `pending_review`, `approved`, `rejected`; иное — `400`. Эксперт читает любые сценарии. |
| `PUT /api/v1/admin/users/{id}/permissions` | admin | `permissions[]` — подмножество `scenario.review`, `scenario.publish` | Выдаёт права эксперта; только пользователю с ролью `teacher` (иначе `400`); роль в JWT не меняется. |
| `GET /api/v1/admin/users/{id}/permissions` | admin | — | Текущие права эксперта: `userId`, `permissions`. |
| `POST /api/v1/ai/scenarios/{id}/versions/{n}/runs` | обучающийся; назначенная утверждённая версия с графом | — | Создаёт прогон (`201`); повторный старт при незавершённом прогоне возвращает его (`200`). Ответ содержит `step {title, prompt, input?}` и `actions` (кнопки) для ожидающего прогона и `result {score, passed, outcome, outcomeTitle, wrongAttempts, steps, durationMs}` для завершённого (формула — spec 005 §4). Неверное действие: `409`, но попытка записывается (штраф). Условия графа видят скалярные поля карточки, вложенные — как `caller.status`. Другая роль, версия не назначена или не утверждена — `403`; версия без графа — `409`. |
| `GET /api/v1/ai/scenario-runs/{id}` | владелец прогона (обучающийся); автор версии и admin | — | Обучающемуся — `runId`, `status`, `outcome`, `steps` (дрейф: текущий `_view` отдаёт также `scenarioId`, `version`, `studentId`). Автору версии и admin дополнительно — `facts` и журнал `events`. Чужой — `403`. |
| `POST /api/v1/ai/scenario-runs/{id}/actions` | владелец прогона (обучающийся) | `action`, `expectedSteps`, `choice?` | Переход по графу. `expectedSteps` обязателен и должен равняться текущему `steps`: повтор уже применённого запроса и параллельная запись дают `409`. `choice` обязателен только у шага с `input` и только из его вариантов (иначе `400`); факты карточки выбором не меняются; произвольные факты студент не задаёт (spec 005 §3). Неверное действие — `409` без раскрытия ожидаемого шага; некорректные значения — `400`. Остальные роли — `403`. ИИ переходами не управляет. |
| `POST /api/v1/ai/scenario-runs/{id}/finish` | владелец прогона (обучающийся) | — | Досрочное завершение: `outcome=abandoned`; уже завершённый прогон — `409`. Остальные роли — `403`. |
| `GET /api/v1/ai/scenario-runs?scenarioId=` | студент — свои; автор — по своим сценариям; admin — все | — | Сводки прогонов `{ runId, scenarioId, version, studentId, status, createdAt, finishedAt?, result? }`. `result` студенту без `path`/`branches`. |

Совместимые `/api/mock/scenarios/generate`, `/scenarios/{id}/validate` и выдача сценариев остаются; новый workflow поверх них не даёт студенту черновики. `sourceTicketId` принимается только из общего реестра утверждённых `SanitizedTicket`, до вызова генератора; исходный скан не поступает ни модели, ни шаблонному пути. Любой адрес сверяется с локальным справочником, тип/служба — с ЕКП, обязательные действия — с эталоном. Если валидатор отклоняет предложение LLM, допустим шаблонный `draft` с явным `sourceKind: template`.

При переходе A→B сервер читает карточку, фактически сохранённую обучающимся в попытке `operator112`, и создаёт вход `dds` с `sourceKind: student_card`, `sourceAttemptId`, `sourceCardId`, `sourceCardVersion`. Утверждённый преподавателем `cardSnapshot` остаётся эталоном и не подменяет результат A. До выдачи преподаватель подтверждает применимость ДДС.

## Сохранение попытки и оценка

Существующие endpoint'ы сдачи сохраняют попытку и возвращают её ID/состояние без ожидания LLM. Если синхронный базовый оценщик остаётся, он не должен ждать второго эшелона. Асинхронная задача использует `attemptId + baseRevision` как ключ идемпотентности.

| Операция | Доступ | Результат |
|---|---|---|
| `GET /api/v1/ai/attempts/{id}/assessment-state` | владелец попытки или преподаватель занятия | `attemptId`, `mode`, `status: pending|preliminary|review_required|final`, `revision`, `availableAxes`, `totalScore?`, `reasonCode?`, `updatedAt`. Для студента `reasonCode` и текст ограничены его данными. |
| `GET /api/v1/ai/attempts/{id}/review` | преподаватель занятия/admin | Полные компоненты, `SemanticReview[]`, `ErrorRecord[]`, версии и учительская правка; включает записи и при отсутствии общего балла. |
| `POST /api/v1/ai/attempts/{id}/resolve` | преподаватель занятия/admin | `expectedRevision`, решение спорного смысла/балл, обязательная причина, `requestId`; возвращает `final` и пишет аудит. |
| Существующий `GET /api/mock/attempts/{id}/evaluation` | студент-владелец, преподаватель занятия | Старый `Evaluation` с четырьмя числами и итогом только при `preliminary|final`; пока результата нет — текущий `evaluationPending`. Дополнительное поле `reviewStatus` допускается, но не требуется старому клиенту. |

`preliminary` отображается студенту с пометкой «Предварительно». `review_required` показывает проверенные оси и ожидание решения без выдуманного общего балла. Преподавателю новое поступление доставляется через существующий канал занятия/обновление его модели; уведомление содержит `attemptId` и `revision`, а полный список ошибок загружается через `review`. Повторная доставка не создаёт новую оценку. При `final` поздний ответ LLM не меняет результат.

`resolve` переиспользует существующий сервис оценки: `TeacherOverride`, `CalibrationSample` и аудит записываются атомарно; повтор `requestId` возвращает прежнее решение, а ошибка записи откатывает все три изменения.

## Реестр ошибок и отчёт

| Операция | Доступ | Фильтры / результат |
|---|---|---|
| `GET /api/v1/ai/sessions/{id}/errors` | преподаватель занятия/admin | `mode?`, `studentId?`, `type?`, `severity?`, `cursor?`; записи `ErrorRecord` с sourceRef/evidence и устойчивым порядком. |
| `GET /api/v1/ai/me/errors` | студент | Только собственные записи, сгруппированные по попытке; нет чужих ID/агрегатов. |
| `GET /api/v1/ai/sessions/{id}/error-summary` | преподаватель занятия/admin | Частоты по типу, режиму и курсанту плюс ID исходных записей; нули при пустом занятии. |

Групповой текст формируется из агрегатов. Никакой числовой факт не извлекается из свободного ответа LLM. Ошибки в уже существующем `Evaluation.errors` сохраняют `type`, `severity`, `message`, `ruleId`, `step`, `fixed`; новые provenance-поля передаются в полном `review` и не ломают старую схему. Экспорт CSV/PDF использует тот же набор.

## Внутренний порт семантики

`resolve_semantic_dispute(input)` принимает только очищенный текст поля, одобренные `referenceFactIds`/краткие факты, режим, причину спора и версии. Возвращает объект по [канонической схеме](semantic-review-v1.schema.json): `decision: equivalent|different|uncertain`, `referenceFactIds`, `explanation`; необязательны `missingFactIds` и `confidence`. Сервер валидирует схему и принадлежность всех ID входу. Модель не возвращает `totalScore`, адрес, статус, timestamp, `ruleId` или команды вызова. Timeout, невалидная форма/ID и конфликт с правилом означают `uncertain` и ручную проверку. Длинное рассуждение не сохраняется в пользовательском результате.

## Грамматика и B→C

`POST /api/mock/grammar-check` и `backend/ml/nlp/grammar.py` остаются локальным сервисом. Ответ привязан к полю/фрагменту (`fragment` — точный срез исходного текста), не правит исходный текст автоматически; с необязательными `scenarioId`/`scenarioVersion` замечания дополнительно несут сценарий и его текущую версию, устаревшая версия → 409. B→C остаётся на утверждённых репликах с транскриптом; порт `call_reply` не подключается к новой модели в рамках этой фичи.

## RBAC и ошибки протокола

Новые операции читают роль из проверенной серверной сессии, не из `teacherId` в теле. `401` — нет сессии, `403` — нет права на попытку/занятие, `404` — ID не существует в разрешённой области, `409` — устаревшая версия или повтор другого содержимого с тем же `requestId`, `422` — невалидный ввод/схема. Сбой LLM не отменяет сохранение попытки и не выдаёт студенту чужую информацию.

## Выпуск модели

Локальный manifest содержит `modelReleaseId`, hashes исходной модели/адаптера/датасета/инструкции, ревизии рантайма и chat template, результаты holdout и CPU-профиля по [правилам выпуска](../release-gates.md). В занятия допускается только `accepted` версия; смена активной версии не изменяет уже вычисленные оценки. Для моделей и примеров запрещены неочищенные исходники и боевые данные.
