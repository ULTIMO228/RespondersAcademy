# API Overview (REST + WebSocket)

Базовый префикс `/api/v1`. Аутентификация — cookie-сессия (JWT). Роли: `admin`, `teacher`, `student`. Полная OpenAPI генерируется FastAPI по адресу `/api/docs`. Все JSON-тела попыток/сценариев/оценок валидны по `contracts/*.schema.json`.

## Auth
| Метод | Путь | Роль | Описание |
|---|---|---|---|
| POST | `/auth/login` | — | логин/пароль → cookie |
| POST | `/auth/logout` | любая | |
| GET | `/auth/me` | любая | текущий пользователь и роль |

## Admin (FR-037…039)
| POST/GET/PATCH | `/admin/users`, `/admin/users/{id}` | admin | создание, роль, блокировка, АРМ, служба |
| POST/GET/PATCH | `/admin/groups`, `/admin/groups/{id}` | admin | группы, состав |
| GET | `/admin/audit?user_id&from&to&action` | admin | журнал аудита |
| GET | `/admin/system/status` | admin | БД, модели (загружены/недоступны), Ollama, STT/TTS |
| POST | `/admin/backup` | admin | pg_dump → файл; ответ: ссылка на скачивание |

## Scenarios (FR-008…015)
| GET | `/scenarios?status&group_no&service&origin` | teacher | банк сценариев |
| GET | `/scenarios/{id}` | teacher | сценарий с эталоном и историей |
| POST | `/scenarios/import/tickets` | teacher | импорт 96 билетов (идемпотентно) |
| POST | `/scenarios/import/table` | teacher | файл CSV/XLSX/DOCX «ситуация | адрес» |
| POST | `/scenarios/generate` | teacher | `{group_no[], location?, difficulty, count, target_service}` → `job_id` |
| GET | `/scenarios/generate/{job_id}` | teacher | прогресс, готовые id, отклонённые с причинами |
| POST | `/scenarios/{id}/approve` | teacher | `{mode: full|partial, comment?}` |
| POST | `/scenarios/{id}/reject` | teacher | `{comment}` |
| POST | `/scenarios/{id}/regenerate` | teacher | `{comment}` → новая версия (`parent_id`) |
| PUT | `/scenarios/{id}` | teacher | ручная правка; ответ включает `grammar_issues[]`; сохранение при `confirm=true` |

## Sessions (FR-016…022)
| POST | `/sessions` | teacher | создать занятие (`mode`, `params`, `group_id`/`user_ids[]`) |
| POST | `/sessions/{id}/start` | teacher | старт потока |
| POST | `/sessions/{id}/finish` | teacher | завершить; незавершённые попытки → `unfinished`, оценка, отчёт |
| POST | `/sessions/{id}/inject` | teacher | `{user_id, kind: duplicate|vis_partial|repeat_call, base_attempt_id?}` |
| GET | `/sessions/{id}/monitor` | teacher | снимок состояния (фолбэк для WS) |
| GET | `/sessions/{id}/report` | teacher | `SessionReport` |
| GET | `/sessions/{id}/report.csv` / `.pdf` | teacher | экспорт |
| GET | `/sessions/{id}/analytics` | teacher | радар/тепловая карта/топ ошибок/инсайты |

## Student (FR-001…007, FR-036)
| GET | `/student/queue` | student | попытки `queued/opened/in_progress` с серверным временем поступления |
| GET | `/student/attempts/{id}` | student (owner) | карточка + текущее состояние |
| POST | `/student/attempts/{id}/events` | student (owner) | одно событие (`event.schema.json` без `seq`/`ts` — сервер проставит); `409` при недопустимом переходе, `422` без обязательного комментария |
| GET | `/student/attempts/{id}/assessment` | student (owner) | `AssessmentResult` |
| GET | `/student/me/progress` | student | баллы, история ошибок, рекомендации, рейтинг |

## Assessment (FR-023…030)
| POST | `/assessments/{attempt_id}/run` | teacher | пересчитать (обычно автоматически при закрытии) |
| GET | `/assessments/{attempt_id}` | teacher | результат + overrides |
| POST | `/assessments/{attempt_id}/override` | teacher | `{changes: {total_score?, remove_error_ids?[], add_errors?[]}, comment}` → аудит + калибровочный пример |

## Softphone (FR-031…033)
| POST | `/softphone/call` | student | `{attempt_id, dial: "1xx"}` → `{call_id, voice_profile}` |
| POST | `/softphone/{call_id}/text-report` | student | текстовый доклад (фолбэк) |

## WebSocket
| `/ws/student/{user_id}` | student | сервер → `{type: "queue_update", attempts[]}`, `{type: "card_injected"}`, `{type: "session_finished"}` |
| `/ws/teacher/{session_id}` | teacher | сервер → `{type: "monitor", students[{user_id, current_attempt, reaction_status, timers, queue_len, not_notified_count}]}` каждые ≤ 2 с и при событиях |
| `/ws/board/{session_id}` | teacher | то же, укороченное, для табло |
| `/ws/softphone/{call_id}` | student | клиент → бинарные PCM16/16 кГц чанки; сервер → `{type:"tts", wav_b64}`, `{type:"partial", text}`, `{type:"final", transcript, checklist}` |

## Коды ошибок
`401` не аутентифицирован · `403` роль/владение · `404` · `409 InvalidTransition | AttemptClosed | SessionNotRunning` · `422` валидация (в т. ч. обязательный комментарий) · `503 ComponentUnavailable` (модель не загружена — только для операций, полностью зависящих от неё, напр. генерация).
