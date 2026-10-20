# Contracts: АРМ специалиста-112 один в один (009)

Префикс — `/api/v1` (бэкенд `backend/app/api/v1/`, мок фронта в автономном режиме — состояние «требуется сервер», как у остального v1 вне `ai/*`). Все ответы — camelCase; ошибки — существующий формат `ApiError`. Для каждого отказа ниже указан парный успешный запрос — тесты пишутся парами (CLAUDE.md, TDD).

## Изменённые

### `POST /operator112/attempts/{attemptId}/events`

Принимает новые `type` (data-model → OperatorEventType). Неизвестный тип → **400** `validation_failed` (как сейчас). `linkAdded` с `cardId`, которого нет в журнале ученика → **400**; пара: `linkAdded` с `cardId` из `GET …/journal` → **201**. Чужая попытка → **403** (`assert_own_attempt`); пара — своя → 201.

### `POST /operator112/attempts/{attemptId}/submit`

Тело — `CardDraft` с новыми необязательными полями (`channel`, `incidents`, `links`, `outcome`, расширенный `address`). Правила:
- `outcome = filled` → нужен `incidents[0]` и адрес по правилу data-model, иначе **400** с `fieldErrors`; пара — заполненная карточка → 200.
- `outcome ∈ {noContact, dropped}` → адрес и тип не обязательны → 200.
- `links` с двумя `primary` → **400**.
- Старое тело без новых полей → 200, результат как раньше (FR-033, SC-004).

### `GET /operator112/attempts/{attemptId}/evaluation`

В `components` может появиться `links` (только если у билета `repeatOf` или ученик создал связь). Остальные компоненты и веса без изменений.

## Новые

### `GET /operator112/journal?assignmentId={id}`

Журнал ученика-112: фон задания + собственные карточки ученика + строка ожидающего вызова (`queued`).
- 200 → `{ rows: Journal112Row[], total: number }`, сортировка «Дата ↓».
- Учётка без профиля 112 (018: `allows(user, operator112)` = false) → **403**; пара — ivanov → 200.
- Чужое задание → **404** (как чтение задания сейчас); пара — своё → 200.
- Карточки других обучающихся в `rows` отсутствуют (FR-007) — проверяется тестом с двумя учениками на одном задании.

### `GET /operator112/attempts/{attemptId}/matches`

Совпадения по АОН и адресу среди карточек журнала → `{ matches: Journal112Row[] }` (пусто — окно не показывается). Чужая попытка → 403; пара — своя → 200.

### `POST /problem-reports`

`multipart/form-data`: `text` (1…2000), `attemptId?`, `incidentNumber?`, `attachment?` (png/jpeg ≤ 2 МБ).
- 201 → `ProblemReport` без пути к файлу (`hasAttachment: boolean`).
- Роль не student → **403**; пара — student → 201.
- Пустой текст / файл не того типа или > 2 МБ → **400**; пара — валидный → 201.
- Аудит `problem_report.created` (без текста сообщения).

### `GET /teacher/problem-reports`

Преподаватель: сообщения учеников своих групп, новые сверху → `{ items: ProblemReport[] }`. Ученик → **403**; пара — преподаватель → 200. Сообщение ученика чужой группы не попадает в выдачу (тест с двумя группами).

### `GET /teacher/problem-reports/{id}/attachment`

Файл вложения; чужая группа → **404**; пара — своя → 200 `image/*`.

## Фронт: `src/shared/api`

- `endpoints/operator112.ts`: `journal(assignmentId)`, `matches(attemptId)`; `sendEvent` — без изменений сигнатуры.
- `endpoints/problem-reports.ts` (новый): `create(form)`, `listForTeacher()`.
- Типы — `types/operator112.ts` (расширение), `types/problem-report.ts` (новый); экспорт через `types/index.ts` без `export *`.
