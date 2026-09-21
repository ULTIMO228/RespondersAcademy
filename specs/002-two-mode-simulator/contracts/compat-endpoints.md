# Контракт волны A: совместимые эндпоинты (FR-059)

Нормативный источник форм — `docs/mock-api.md` (таблица эндпоинтов, соглашения) и `src/shared/api/types/*.ts`. Этот файл не дублирует формы, а фиксирует, **чем** бэкенд отвечает за каждый эндпоинт: модуль, источник данных, побочные эффекты, изоляция. Префиксы: `/api/mock` (для фронта) и `/api/v1` (зеркало). OpenAPI — `/api/docs`.

Общее: успех — данные без обёртки (200 / 201 на создание); ошибка — `{ "error": { "code", "message" } }` с кодами `badRequest`, `validationFailed`, `unauthorized`, `accountBlocked`, `forbidden`, `notFound`, `evaluationPending`, `invalidTransition`, `conflict`, `internal`; время — ISO 8601 `+03:00`; множественные query — повторный ключ; `PageResponse { items, total, page, perPage }`; Pydantic-схемы с camelCase-алиасами, `response_model_by_alias=True`, лишние поля запроса игнорируются.

Viewer: cookie `arm112_session` (JSON URL-encoded, `token` = JWT) или `Authorization: Bearer`. Роли: `S` student, `T` teacher, `A` admin, `-` аноним допустим.

| # | Метод и путь | Модуль | Данные / логика | Побочные эффекты | Доступ |
|---|---|---|---|---|---|
| 1 | `POST /auth/login` | `compat/auth` | `users` (argon2), `system_settings.security` (2FA-флаг, lockAfterAttempts) | аудит `auth.login`; счётчик неудач → блокировка по политике | - |
| 2 | `GET /auth/policy` | `compat/auth` | `system_settings.security` → `AuthPolicy` | — | - |
| 3 | `GET /reference` | `compat/reference` | `reference` (10 ключей) + `classifierRows.$ref` | — | - |
| 4 | `GET /classifier` | `compat/classifier` | `classifier_entries`; `group` точное, `code` → записи группы кода; заголовок `X-Classifier-Version` (URL-encoded) | — | - |
| 5 | `GET /cards` | `compat/cards` | `arm_card_fixtures` + проекция `incident_cards` через fixture-map; расширенный поиск (`CardSearchFilters`, AND/OR, ё/е), `dataset`, `view`, `sort`, пагинация после фильтров; мусор → 400 | — | - |
| 6 | `GET /cards/[id]` | `compat/cards` | `CardDetails { kind: fixture \| training, resolvedFixtureId?, runtime }` из `card_runtime` | — | - |
| 7 | `POST /cards/[id]/status` | `compat/card_actions` | машина статусов ДДС (`services/dds_status_machine`) → `card_runtime.status_events`; 400/409 | обновляет открытую попытку по карточке (`statuses[]`) | - |
| 8 | `POST /cards/[id]/links` | `compat/card_actions` | `incident_cards.duplicate_of` → цепочка; фикстуры — `[]` | — | - |
| 9 | `POST /cards/[id]/worklines` | `compat/card_actions` | `card_runtime.work_lines` (201) | — | - |
| 10 | `POST /cards/[id]/reminders` | `compat/card_actions` | `card_runtime.reminders` (201) | — | - |
| 11 | `GET /cards/[id]/sms` | `compat/card_actions` | фикстурные входящие + `card_runtime.sms`, по времени | — | - |
| 12 | `POST /cards/[id]/sms` | `compat/card_actions` | исходящее (`direction: outgoing`, телефон по умолчанию — АОН) (201) | — | - |
| 13 | `GET /cards/[id]/recordings` | `compat/card_actions` | `[]` в волне A (записи появятся в волне B) | — | - |
| 14 | `POST /cards/[id]/attempt` | `compat/attempts` | идущее занятие курсанта, выдавшее карточку → иначе любое идущее → иначе новое занятие практики; открытая попытка возвращается повторно (`created: false`) | создаёт `attempts` (201) / `sessions` практики | - (studentId из тела, как в моке; при наличии viewer-S — должен совпадать, иначе 403) |
| 15 | `POST /attempts/[id]/progress` | `compat/attempts` | `status?`, `enteredText?`, `completedAt?` → завершение считает `fullProcessingMs` | завершение ставит оценку в очередь (синхронно, ≤ 5 с) | владелец / T / A |
| 16 | `POST /cards/[id]/calls` | `compat/calls` | вызов → `attempts.calls` (JSON `PhoneCall[]`) последней попытки курсанта по карточке, идущее занятие приоритетно (201); id `call-NNN`; расширение `call.report` — сверка реплик диспетчера с фактами карточки (`ml.insights.call_responder.check_report`: номер карточки, адрес, тип, пострадавшие, решение) для компонента оценки `report`; 404 карточка / номер / нет попытки; S — только за себя (403) | — | -/S |
| 17 | `POST /calls/reply` | `compat/calls` | сначала `ai_gateway.call_reply(to_number, turn, context)` (зона команды ИИ-агентов, `context = { number, text, reference }`), при `None` — `ml.insights.call_responder` по `reference.internalNumbers` («Слушаю вас» / «Понял, информация принята» + вариации по службе, голос по чётности номера); `AiResponse<CallReply>` `provider: service`; 400 мусор, 404 «Абонент не найден» | — | - |
| 18 | `GET /scenarios` | `compat/scenarios` | фильтры `validationStatus`, `source`, `difficulty[]`, `group[]`; без удалённых | — | - |
| 19 | `POST /scenarios` | `compat/scenarios` | новый `s-NNN`, `validation.status: draft` (201) | — | T |
| 20 | `GET /scenarios/[id]` | `compat/scenarios` | — | — | - |
| 21 | `PATCH /scenarios/[id]` | `compat/scenarios` | частичное обновление, `difficulty` → `level`, валидации; `history` | аудит `scenario.update` | T |
| 22 | `DELETE /scenarios/[id]?deletedBy=` | `compat/scenarios` | 409 для `template` и используемых в занятиях | аудит `scenario.delete` | T |
| 23 | `POST /scenarios/[id]/validate` | `compat/scenarios` | машина валидации (`submit/approve/approvePartial/reject`), 409 вне графа | аудит `scenario.<action>`; при `approved` — задача TTS (волна B) | T |
| 24 | `POST /scenarios/generate` | `compat/scenarios` | `ai_gateway.generate_scenario(category, cards, addresses)` → 3 сценария `pending/generated` с новыми карточками `c-NNN` (`mode_origin=generated`, ловушки по умолчанию: —, `foreignTerritory`, `operatorMistake`), дедупликация по `title`; каждая карточка прогнана через валидатор (R22), отчёт — `validation_report` и расширение ответа `validationReport` (201); 400 — пустая категория / нет карточек-источников | аудит `scenario.generate` | T |
| 25 | `GET /training-cards` | `compat/scenarios` | `incident_cards` (96 + сформированные обучаемыми + сгенерированные) → `IncidentCard[]` | — | - |
| 26 | `GET /materials` | `compat/materials` | новые первыми | — | - |
| 27 | `POST /materials` | `compat/materials` | формат по расширению (201) | аудит `material.upload` | T |
| 28 | `GET /profile-mapping` | `compat/profile_mapping` | `profile_mapping` + `studentCount` по `users.service` | — | - |
| 29 | `PUT /profile-mapping` | `compat/profile_mapping` | 404 на неизвестный id | аудит `profileMapping.save` | T |
| 30 | `POST /grammar-check` | `compat/grammar` | `ai_gateway.check_grammar` (R2 symspell + синтаксис) → `AiResponse<GrammarError[]>` (`provider: service`); для адресного `field` синтаксические правила не применяются, зато добавляется похожая улица справочника R3 как `spelling` | — | - |
| 31 | `GET /sessions` | `compat/sessions` | фильтры `teacherId`, `studentId`, `state`; для S — проекция (свои `studentIds`, `cardFlow`, `cardEvents`); чужой `studentId` → 403; аноним со `studentId` → 401 | — | -/S/T/A |
| 32 | `POST /sessions` | `compat/sessions` | мастер → `configured`, `plan` сохраняется (201) | — | T |
| 33 | `POST /sessions/[id]/start` | `compat/sessions` | `configured → running`; `card_flow_items` по `plan` (темп, порядок, конвейер, категории, профили; без плана — шаг 3 мин); 409 | — | T |
| 34 | `POST /sessions/[id]/stop` | `compat/sessions` | `running → finished`; открытые попытки помечаются | оценка незавершённых по выполненному | T |
| 35 | `GET /sessions/[id]/feed` | `compat/sessions` | окно `(since, at]`, порядок «выдача → открытие → статус → завершение → оценка ИИ, курсант, карточка»; `studentId?`; T — только свои занятия (403), S — только своё занятие и свои события | — | -/S/T/A |
| 36 | `GET /sessions/[id]/control` | `compat/sessions` | `{ session, plan, paused, pausedAt, pendingCount }` | — | T |
| 37 | `POST /sessions/[id]/control` | `compat/sessions` | `pause/resume/issue/report`; `issue` добавляет `card_flow_items` «сейчас»; `report`: `finished → reported` + сборка отчётов (`services/report_builder`) | — | T |
| 38 | `GET /users` | `compat/users` | `role`, `group` → `PublicUser[]`; S → 403 | — | T/A |
| 39 | `GET /reports` | `compat/reports` | `sessionId` и/или `studentId`; ленивая идемпотентная сборка отчёта завершённого занятия; `score`/`charts.dynamics` с учётом overrides; S — только свои, `groupReport: null` | создаёт `reports`/`group_reports` при первой сборке | -/S/T/A |
| 40 | `GET /reports/journal` | `compat/reports` | фильтры `teacherId`, `studentId`, `group`, `category`, `from`, `to` (даты включительно); `buildSec` = `generatedAt − finishedAt`; S → 403 | — | T/A |
| 41 | `POST /reports/feedback` | `compat/reports` | upsert `report_feedback` (201) | — | T |
| 42 | `GET /attempts/[id]/evaluation` | `compat/attempts` | готовая оценка (override приоритетен) либо `ai_gateway.evaluate_attempt` → сохранить; нет эталона → 404 `evaluationPending`; чужая попытка для S → 403 | сохраняет `evaluations` | -/S/T/A |
| 43 | `POST /attempts/[id]/evaluation` | `compat/attempts` | `teacher_overrides` + `Evaluation.teacherOverride` | аудит `evaluation.override` («было → стало», ФИО); `calibration_samples` | T |
| 44 | `GET /admin/users` | `compat/admin_users` | `role`, `state`, `group`, `q` (ФИО/логин, регистронезависимо) | — | A |
| 45 | `POST /admin/users` | `compat/admin_users` | валидации; `u-NNN`; argon2 (201); логин занят → 409 | аудит `user.create` | A |
| 46 | `PATCH /admin/users/[id]` | `compat/admin_users` | ролевые поля приводятся к новой роли | аудит `user.update` / `user.roleChange` | A |
| 47 | `POST /admin/users/[id]/block` | `compat/admin_users` | `is_active=false`; сам себя → 409 | аудит `user.block` | A |
| 48 | `POST /admin/users/[id]/unblock` | `compat/admin_users` | `is_active=true` | аудит `user.unblock` | A |
| 49 | `POST /admin/users/[id]/reset-password` | `compat/admin_users` | временный пароль, возвращается один раз | аудит `user.passwordReset` | A |
| 50 | `POST /admin/users/[id]/toggle-active` | `compat/admin_users` | инверсия `is_active` | аудит block/unblock | A |
| 51 | `GET /admin/services` | `compat/admin_system` | `SystemService[]` | — | A |
| 52 | `GET /admin/settings` | `compat/admin_system` | `SystemSettings` | — | A |
| 53 | `GET /admin/audit` | `compat/admin_system` | фильтры `type`, `operator`, `card`, `from/to`, `q`, пагинация; новые первыми | — | A |
| 54 | `GET /admin/system/services` | `compat/admin_system` | `{ services, integrity }`; интегрити — самопроверка (БД, модели загружены, каталоги) | — | A |
| 55 | `POST /admin/system/services/[id]/action` | `compat/admin_system` | `start/stop/restart`; 409 для критичного при идущем занятии | аудит `service.action`, `system_logs` | A |
| 56 | `GET /admin/system/settings` | `compat/admin_system` | + `security`, `performance`, `autoRecovery` | — | A |
| 57 | `PATCH /admin/system/settings` | `compat/admin_system` | секции; `database` не принимается; нормативы → 422 | аудит `settings.update`; `backup.lastAt` → `backup.run` (реальный `pg_dump`/копия SQLite в `var/backups`) | A |
| 58 | `GET /admin/system/logs` | `compat/admin_system` | `level` фильтр; новые первыми | — | A |
| 59 | `GET /admin/system/monitoring` | `compat/admin_system` | статичные ряды из сида | — | A |
| 60 | `GET /admin/system/usage-stats` | `compat/admin_system` | `period` `week` \| `month`; мусор → 400 | — | A |

Примечание к доступу: мок-слой не проверял cookie у большинства эндпоинтов, поэтому в столбце «Доступ» `-` означает «аноним допустим, как в моке» (чтобы `scripts/e2e-*.sh` и Vitest-контракты не сломались). Где мок применял изоляцию (31, 35, 39, 40, 42) — бэкенд повторяет её точно. Ужесточение доступа (например, T/A-only для админских путей 44–60 — мок отдавал 403 только на «не администратора» по `adminId`) выполняется по viewer'у, а при его отсутствии — по `adminId` в теле, как в моке.

## Контрактные тесты (`backend/tests/contract/`)

- Один параметризованный тест на строку таблицы: код ответа и обязательные поля ответа по TS-типу (список полей извлекается из `src/shared/api/types/*.ts` скриптом `backend/scripts/extract_ts_fields.py` и хранится в `tests/contract/expected_fields.json`).
- Сценарии из `docs/mock-api.md` → «Примеры» и из `src/shared/api/mock/__tests__/contracts.test.ts` переносятся 1:1.
- Сквозной путь `scripts/e2e-student.sh` / `e2e-teacher.sh` / `e2e-admin.sh` запускается против фронта с `BACKEND_URL` (см. quickstart) — критерий приёмки волны A.
