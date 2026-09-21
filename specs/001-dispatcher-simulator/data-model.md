# Data Model (Phase 1)

СУБД PostgreSQL 14. Все таймстампы — `timestamptz`, серверные. JSON-поля валидируются против `contracts/*.schema.json`. Идентификаторы — UUID.

## Сущности

### user
| Поле | Тип | Примечание |
|---|---|---|
| id | uuid PK | |
| login | text unique | |
| password_hash | text | argon2 |
| full_name | text | ФИО (в отчёте) |
| role | enum(admin, teacher, student) | FR-037 |
| arm_number | text null | номер АРМ обучаемого (в отчёте) |
| service_code | text null | код службы из ЕКП (GKH, MOSVODOCANAL…) — профиль обучаемого, FR-017 |
| group_id | uuid FK group null | |
| is_blocked | bool | |
| created_at | timestamptz | |

### group
| id | uuid PK |
| name | text |
| teacher_id | uuid FK user |

### ekp_type (справочник ЕКП, импорт из TSV)
| code | text PK | напр. `1010101` |
| group_no | int | 1–23 |
| group_name | text | |
| sign1, sign2, sign3 | text null | признаки опросной карты |
| final_type | text unique | «пожар: мусор» |
| ekp35_type | text | укрупнённый |
| main_service | text null | `MCHS`, `Police`… (составные — массив в `main_services`) |
| main_services | text[] | |
| reactions | jsonb | `{service_code: "card112" | "no_reaction" | "<тип у службы>"}` — нормализовано |

### street (справочник улиц Москвы)
| id | serial PK |
| name | text | нормализованное |
| name_display | text |
| type | text | ул, пер, пр-т… |
| district | text null |
| okrug | text null |

### ticket (учебные билеты)
| id | uuid PK |
| ticket_no | int | 1–32 |
| task_no | int | 1–3 |
| situation | text |
| caller_name | text |
| caller_phone | text |
| address | text |
| address_note | text null |
| dedup_key | text | для объединения повторов (1.3 = 16.2) |

### scenario
| Поле | Тип | Примечание |
|---|---|---|
| id | uuid PK | |
| origin | enum(ticket, generated, imported) | FR-008 |
| ticket_id | uuid FK null | |
| card | jsonb | карточка по `scenario.schema.json#/card` |
| reference | jsonb | эталон по `scenario.schema.json#/reference` |
| difficulty | numeric | сложность D (R10) |
| ekp_code | text FK ekp_type | |
| category_group | int | группа ЕКП 1–23 |
| target_service | text | код службы, для которой строится ожидаемый статус |
| approval_status | enum(pending, approved, partially_approved, rejected) | FR-013/014 |
| quality | jsonb | результат фильтра: `{category_confirmed, duplicate_of, reasons[]}` FR-012 |
| version | int | |
| parent_id | uuid FK scenario null | предыдущая версия при перегенерации |
| created_by | uuid FK user | |
| created_at | timestamptz | |

### scenario_comment (история комментариев преподавателя)
| id | uuid PK |
| scenario_id | uuid FK |
| author_id | uuid FK user |
| text | text |
| action | enum(approve, partial, reject, regenerate, edit) |
| created_at | timestamptz |

### training_session (занятие)
| Поле | Тип | Примечание |
|---|---|---|
| id | uuid PK | |
| teacher_id | uuid FK user | |
| group_id | uuid FK group | |
| mode | enum(cards, actions) | FR-006/016 |
| params | jsonb | категории[], target_service, difficulty или `adaptive: true`, темп (карточек/мин, всплески), нормативы `{first_status_s: 30, full_cycle_s: 180}`, веса компонент, порог успешности, порог «угадывания» |
| status | enum(created, running, finished) | |
| started_at, finished_at | timestamptz null | |

### session_participant
| session_id | uuid FK |
| user_id | uuid FK |
| PK (session_id, user_id) |

### attempt (попытка)
| Поле | Тип | Примечание |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | |
| user_id | uuid FK | |
| scenario_id | uuid FK | |
| injected_kind | enum(normal, duplicate, vis_partial, repeat_call) | FR-019 |
| status | enum(queued, opened, in_progress, completed, interrupted, unfinished) | |
| queued_at | timestamptz | момент поступления в очередь |
| opened_at | timestamptz null | |
| first_status_at | timestamptz null | |
| completed_at | timestamptz null | |
| current_reaction_status | enum(none, accepted, rejected, started, arrived, working, done, refused) | зеркало последнего события |
| not_notified | bool | флаг «Не оповещено» FR-005 |
| card_state | jsonb | текущие значения полей карточки (ввод обучаемого) |
| recording_path | text null | WAV доклада |
| transcript | text null | |

**Переходы статуса реагирования** (FR-003, проверяются в `attempt_recorder`):

```
none ──accept──▶ accepted ──▶ started ──▶ arrived ──▶ working ──▶ done (закрыта)
  └──reject──▶ rejected ──accept──▶ accepted
accepted|started|arrived|working ──refuse──▶ refused (закрыта)
```

Для `rejected`/`refused` обязателен непустой комментарий (FR-004).

### event
| id | uuid PK |
| attempt_id | uuid FK |
| seq | int | порядковый номер в попытке |
| type | enum(queued, opened, switched_away, switched_to, status_set, field_changed, comment_added, action_text, call_started, call_finished, not_notified, closed) |
| payload | jsonb | по `event.schema.json` (было/стало, статус, поле, текст) |
| ts | timestamptz | серверное время |
| UNIQUE (attempt_id, seq) |

### assessment (результат оценки)
| id | uuid PK |
| attempt_id | uuid FK unique |
| engine_version | text |
| result | jsonb | по `assessment.schema.json` |
| total_score | numeric(5,2) | 0–100, денормализация |
| components_available | jsonb | `{semantic: true, grammar: true, ...}` FR-030 |
| overridden | bool |
| created_at | timestamptz |

### assessment_override (правка преподавателя)
| id | uuid PK |
| assessment_id | uuid FK |
| teacher_id | uuid FK user |
| before | jsonb | фрагмент результата до |
| after | jsonb | после |
| comment | text not null |
| use_for_calibration | bool default true |
| created_at | timestamptz |

### student_rating
| user_id | uuid PK FK |
| rating | numeric | R10 |
| weak_categories | int[] | группы ЕКП с ошибками |
| history | jsonb | `[{attempt_id, before, after, ts}]` |

### session_report
| session_id | uuid PK FK |
| data | jsonb | по `session-report.schema.json` |
| generated_at | timestamptz |

### audit_log
| id | bigserial PK |
| user_id | uuid FK null |
| action | text | `login`, `access_denied`, `assessment_override`, `user_create`, `backup`, `session_finish`… |
| object_type | text null |
| object_id | text null |
| details | jsonb |
| ts | timestamptz |

### labeled_attempt (калибровочная выборка; файловое хранилище `data/labeled/`, в БД не дублируется)
JSON: `{attempt_events[], scenario_id, expert_errors[{type, step}], expert_score, annotator, source: "synthetic"|"manual"|"override"}`.

## Связи

- `user 1—* attempt`, `training_session 1—* attempt`, `scenario 1—* attempt`.
- `attempt 1—* event`, `attempt 1—1 assessment`, `assessment 1—* assessment_override`.
- `scenario *—1 ekp_type`, `scenario *—0..1 ticket`, `scenario *—0..1 scenario(parent)`.
- `group 1—* user(student)`, `group *—1 user(teacher)`.

## Индексы

- `event(attempt_id, seq)`, `attempt(session_id, user_id, status)`, `scenario(approval_status, category_group, target_service)`, `audit_log(user_id, ts)`, `ekp_type(final_type)`.

## Правила валидации (уровень сервиса)

- Переход статуса реагирования только по графу выше; иначе `409 InvalidTransition`.
- `comment` обязателен для `rejected`, `refused` — иначе `422`.
- После `done`/`refused` любые `field_changed`/`comment_added` → `409 AttemptClosed`.
- Обучающийся видит только `attempt.user_id = self`; преподаватель — попытки своих занятий; администратор — не видит `assessment` на изменение (FR-037).
- `scenario.approval_status ∈ {approved, partially_approved}` для включения в занятие (FR-014).
