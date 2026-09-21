# Data Model (Phase 1)

Источник форм — `spec/05-data-models.md` и `src/shared/api/types/*.ts` (контракт фронта, волна A) + сущности спеки 002 (волна B). Все PK — строки в форматах сидов. Вложенные структуры, которые фронт получает и отдаёт целиком, хранятся как JSON (`JSONB` в PostgreSQL). Все `datetime` — `timestamptz`, сериализуются как ISO 8601 `+03:00`. Поле `mode` (`dds` | `operator112`) — расширение, по умолчанию `dds`.

## Волна A — совместимая модель

### Пользователи и доступ

| Таблица | Поля | Примечания |
|---|---|---|
| `users` | `id` u-NNN PK, `login` unique, `password_hash` (argon2), `full_name`, `role` (student/teacher/admin), `arm_number` int, `is_active` bool, `group`?, `service`?, `assigned_groups` JSON? | `PublicUser` = без `password_hash`; временный пароль после reset хранится только хэшем |
| `audit_log` | `id` audit-NNN PK, `at`, `user_id` FK?, `role`, `action` (`auth.login`, `user.*`, `scenario.*`, `material.upload`, `profileMapping.save`, `evaluation.override`, `settings.update`, `backup.run`, `service.action`, `access.denied`), `details`, `ip`? | сид `mocks/admin/audit-log.json` + рантайм; отдаётся новыми первыми, пагинация |

### Справочники

| Таблица | Поля | Примечания |
|---|---|---|
| `reference` | `key` PK (`ddsStatuses`, `serviceStatuses`, `callerStatuses`, `channels`, `services`, `incidentGroups`, `cardStatuses`, `districts`, `sources`, `internalNumbers`), `value` JSON | `GET /reference` собирает объект + `classifierRows.$ref`; граф статусов ДДС читается отсюда |
| `classifier_entries` | `code` PK, `group`, `sign1..3`, `extra_signs`, `final_type`, `ekp35_type`, `main_service`, `notifications` JSON | индекс по `group`; `classifier_meta` (version, extractedAt, rowCount) — в `reference` под ключом `classifierMeta` |
| `streets` (волна B) | `id`, `name_norm`, `name`, `type`, `okrug`, `raion` | справочник улиц (R3) |
| `addresses` | `id` adr-NNN PK, компоненты адреса, `geo` JSON | сид `mocks/local/addresses.json` |

### Карточки

| Таблица | Поля | Примечания |
|---|---|---|
| `incident_cards` | `id` c-NNN PK, `ticket_no`, `situation_no`, `group`, `summary`, `address`, `address_refined`?, `caller` JSON, `victims` JSON?, `no_ambulance`?, `cross_region`?, `expected_services` JSON, `expected_tags` JSON, `duplicate_of`?, `created_by_student_id`? FK, `mode_origin` (`seed` \| `operator112`), `source_attempt_id`? | 96 учебных карточек + карточки, сформированные обучаемыми (US8); `GET /training-cards` |
| `arm_card_fixtures` | `id` card-NNNNNN PK, `number`, `created_at`, `registered_by`, `source`, `card_status`, `phones` JSON, `sms_list` JSON?, `applicant` JSON, `address` JSON, `what` JSON, `description`, `work_lines` JSON, `notification_list` JSON, `emergency` JSON, `created_by_vis` | 12 UI-фикстур; `fixture_map` (group → fixture id) — правило в коде, как `src/shared/api/mock/fixture-map.ts` |
| `card_runtime` | `card_id` PK (card-* или c-NNN), `status_events` JSON[] (`CardStatusEvent`), `work_lines` JSON[], `reminders` JSON[], `sms` JSON[] (входящие фикстуры + исходящие), `current_dds_status`?, `closed` bool | «store» мутаций мок-слоя; `GET /cards/[id]` возвращает `CardDetails { kind, resolvedFixtureId?, runtime }` |

### Сценарии и материалы

| Таблица | Поля | Примечания |
|---|---|---|
| `scenarios` | `id` s-NNN PK, `title`, `level`, `source_ticket_no`, `card_ids` JSON, `time_norms` JSON, `hints` JSON, `call_target`?, `difficulty` 1–5, `etalon` JSON, `validation` JSON (`status`, `reviewedBy`, `comment`, `fields`?), `success_criteria` JSON, `source` (`template` \| `generated` \| `manual` \| `import`), `mode`? (`demo` \| `follow` \| `practice`), `updated_by`?, `updated_at`, `deleted` bool, `validation_report` JSON? (R22), `history` JSON[] (версии) | `DELETE` запрещён для `template` и используемых в занятиях (409 `conflict`); `difficulty` → `level` (1–2 beginner, 3–5 advanced) |
| `training_materials` | `id` mat-NNN PK, `name`, `size_bytes`?, `format` (DOCX/PDF/MP3 по расширению), `uploaded_by` FK, `uploaded_at` | новые первыми |
| `profile_mapping` | `id` PK, `profile`, `group_name`?, `service_ids` JSON[], `incident_groups` JSON[], `updated_by`?, `updated_at` | существующая модель `app/models/teacher.py` соответствует контракту `ProfileMappingRow`; сид скопирован из `src/shared/config` в `app/seed/profile_mapping_seed.py`; `studentCount` считается по `users.service` для роли student |

### Занятия, попытки, оценки

| Таблица | Поля | Примечания |
|---|---|---|
| `sessions` | `id` ses-NNN PK, `teacher_id` FK, `student_ids` JSON, `scenario_ids` JSON, `mode` (`demo`/`follow`/`practice`), `card_source` (`generated`/`studentCreated`/`mixed`), `plan` JSON? (`SessionPlan`), `state` (`draft`/`configured`/`running`/`finished`/`reported`), `started_at`?, `finished_at`?, `paused` bool, `paused_at`?, `training_mode` (`dds` \| `operator112` \| `chain`), `format` (`training` \| `exam`), `exam` JSON? (`passThreshold`, `timeLimitSec`) | `format`/`training_mode`/`exam` — расширения волны B, по умолчанию `training`/`dds` |
| `card_flow_items` | `id` PK, `session_id` FK, `card_id`, `student_id`, `issued_at`, `level`, `issued_by` (`plan` \| `control` \| `chain`) | лента `cardIssued`; порядок по `issued_at` |
| `attempts` (= `CardEvent`) | `id` att-NN PK, `session_id` FK, `card_id`, `student_id` FK, `mode` (`dds`/`operator112`), `opened_at`, `primary_reaction_ms`, `statuses` JSON[] (`{ ddsStatus, at, comment?, dutyNumber? }`), `services_called` JSON, `completed_at`? (пусто = открыта; в контракте `""`), `full_processing_ms`?, `entered_text` JSON, `status_mark`? (`CardStatusMark`), `card_snapshot` JSON? (волна B: карточка, заполненная оператором) | `POST /cards/[id]/attempt` идемпотентен для открытой попытки; завершение считает `fullProcessingMs` |
| `phone_calls` | `id` PK, `attempt_id` FK, `from_user_id`, `to_number`, `started_at`, `ended_at`?, `transcript` JSON[] | отдаются внутри `CardEvent.calls` |
| `evaluations` | `attempt_id` PK/FK, `assessor_version`, `time_score`, `correctness_score`, `grammar_score`, `semantic_score`, `total_score`, `grammar_errors` JSON[], `errors` JSON[], `ai_comment`, `components` JSON (полный `AssessmentResult`: компоненты, веса, ruleId, step, fixed, warnings), `generated_at`, `passed`? (экзамен) | `teacherOverride` — из `teacher_overrides` (последняя) |
| `teacher_overrides` | `id` PK, `attempt_id` FK, `teacher_id` FK, `score`, `comment`, `at`, `previous_score` | пишет аудит `evaluation.override`; является калибровочным примером |
| `calibration_samples` | `id` PK, `attempt_id`, `source` (`override` \| `labeled`), `payload` JSON, `created_at` | вход для `calibrate.py` |

### Отчёты

| Таблица | Поля | Примечания |
|---|---|---|
| `reports` | `id` rep-… PK, `session_id` FK, `student_id` FK, `generated_at`, `export_formats` JSON, `student` JSON, `time_metrics` JSON[], `grammar_errors` JSON[], `errors` JSON[], `score`, `charts` JSON, `ai_comment`?, `static` bool | `score` и `charts.dynamics` пересчитываются на чтение с учётом overrides (кроме `static`) |
| `group_reports` | `id` rep-…-group PK, `session_id` FK unique, `generated_at`, `report_ids` JSON, `group_insights` JSON, `charts` JSON, `static` bool | маркер идемпотентности сборки отчёта |
| `report_feedback` | `report_id` PK/FK, `teacher_id`, `text`, `recommendations` JSON?, `at` | повтор заменяет запись |

### Раздел «Система»

| Таблица | Поля | Примечания |
|---|---|---|
| `system_services` | `id` PK, `name`, `state`, `uptime_sec`, `critical`, `description`, `started_at`? | действия start/stop/restart меняют состояние и пишут `system_logs` + аудит; 409 для критичного при идущем занятии; интегрити — вычисляется |
| `system_settings` | `id` = 1, `settings` JSON (`telephony`, `database` ro, `backup`, `logging`, `security`, `performance`, `autoRecovery`) | PATCH проверяет нормативы (бэкап ≤ 24 ч, журналы ≥ 6 мес, сессии ≥ 20) → 422 |
| `system_logs` | `id` PK, `at`, `level`, `source`, `message` | сид + события действий |
| `system_monitoring` / `usage_stats` | статичные JSON из сидов | волна A отдаёт как есть; реальные метрики — вне объёма |

## Волна B — новые сущности

| Таблица | Поля | Примечания |
|---|---|---|
| `ticket_audio` | `card_id` PK/FK → `incident_cards`, `path` (wav), `transcript`, `voice`, `duration_ms`, `generated_at`, `status` (`pending`/`ready`/`failed`) | FR-012/013; генерируется при утверждении билета |
| `assignments` | `id` PK, `teacher_id`, `student_ids` JSON, `training_mode`, `format`, `card_ids` JSON или `random_rule` JSON, `params` JSON (нормативы, подсказки, порог, лимит), `due_at`?, `state` | лобби (FR-030, FR-044); занятие волны A остаётся `sessions` |
| `assignment_attempts` | `id` PK, `assignment_id`, `student_id`, `card_id`, `attempt_id` FK → `attempts`, `replays` int, `hints_shown` int, `state`, `passed`? | связывает попытку с заданием и экзаменом |
| `kb_articles` | `id` PK, `group`, `title`, `sections` JSON (признаки, оповещение, что уточнить, решение ДДС, типичные ошибки), `updated_by`?, `updated_at` | FR-046 |
| `recommendations` | `id` PK, `student_id`, `kind` (`card`/`category`/`article`/`mode`), `target_id`, `reason` JSON (`errorType`, `count`, `ruleId`), `created_at`, `accepted_at`? | FR-047 |
| `student_ratings` | `student_id` + `mode` PK, `rating`, `history` JSON, `weak_groups` JSON | R10 |
| `card_work_messages` | `id`, `attempt_id`, `kind` (`departed`/`arrived`/`started`/`done`), `at`, `expected_status` | FR-050 (расширение ДДС) |

## Машины состояний

- **Статусы ДДС** (`reference.ddsStatuses[].next`): старт → `accepted` | `notAccepted`; `accepted` → `responseStarted` → `arrived` → `workInProgress` → `workDone`; после `accepted` на любом этапе — `workRefused`; `notAccepted` → только `accepted`. `requiresComment` (`notAccepted`, `workRefused`) без комментария → 400 `validationFailed`; вне графа → 409 `invalidTransition`; неизвестный статус → 400. `workDone`/`workRefused` закрывают карточку.
- **Занятие**: `draft → configured → running → finished → reported`; `start` только из `configured`, `stop` только из `running`, `control.report` только из `finished` (иначе 409). `pause/resume` — флаг внутри `running`.
- **Валидация сценария**: `draft → pending` (submit) → `approved` | `rejected` (approve/approvePartial/reject); повторный `submit` из `rejected` разрешён; из `approved` — только через PATCH → `draft`.
- **Попытка**: открыта (`completed_at` пусто) → завершена (`completedAt`), либо «прервана»/«не завершено» при завершении занятия.
- **Задание/экзамен (волна B)**: `assigned → in_progress → completed (passed | failed)`; экзамен — одна попытка на билет, повтор → 409.

## Валидация (из требований)

- `POST /admin/users`: логин — латиница без пробелов, уникален (409 `conflict`); `armNumber` — целое > 0; роль ∈ 3; администратор не может блокировать себя (409).
- `PATCH /scenarios/[id]`: `timeNorms.* > 0`, `successCriteria.maxGrammarErrors` — целое ≥ 0, `difficulty` ∈ 1–5.
- `PATCH /admin/system/settings`: `backup.periodHours ≤ 24`, `logging.retentionMonths ≥ 6`, `performance.sessionLimit ≥ 20`, `database` не принимается.
- `POST /reports/feedback`, `POST /attempts/[id]/evaluation`: `score` 0–100, `comment` непустой.
- Изоляция: `student` видит только свои занятия/попытки/отчёты (403 `forbidden`), групповой отчёт — `null`; `teacher` — только свои занятия в `feed`; `admin` — без ограничений; аноним со `studentId` → 401.
