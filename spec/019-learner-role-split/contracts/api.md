# Контракты — фича 019

Изменения только аддитивные (инвариант AGENTS §2). Фронт и бэкенд меняются синхронно; после правки TS-типов — `uv run python scripts/extract_ts_fields.py`.

| Контракт | Изменение |
|---|---|
| `User` / `PublicUser` (`GET /auth/session`, `POST /auth/login`, `GET /users`, `GET /users/{id}`) | + `specializations?: ("operator112"\|"dds")[]` — только у `student` |
| `PATCH /api/v1/admin/users/{id}` (и мок-аналог в `app/api/mock/admin/users`) | принимает `specializations` (admin; для студента — непустой список без дублей, иначе 400) |
| `PATCH /api/v1/teacher/students/{id}/specializations` (новый, teacher; только свои группы) | тело `{ "specializations": [...] }`, 200 с обновлённым пользователем, 403 для чужой группы |
| Все эндпоинты зоны 112 (`operator112/*`) и зоны ДДС (попытки, статусы, звонки по карточке — перечень в `tasks.md`) | студент без нужной специализации → `403 { message: "Недоступно для вашей специализации" }`; парный запрос с нужной специализацией → 200 |
| `POST /api/v1/assignments` | список `studentIds` валидируется по режиму; несоответствие → 400/422 с перечнем обучающихся |
| `POST /api/v1/assignments/{id}/start`, `POST /operator112/attempts`, `POST /cards/{id}/attempt` | режим попытки = режим задания и специализация студента; иначе 403 |
| Отчёты / успеваемость / карта ошибок | + подпись роли норматива (`normScope: "operator112" \| "dds"`) в строках, где выводятся 30 с / 3 мин |
| Операции 112 (новые события) | `save` с подтверждением оповещения, `close`, `noContact`, `callDropped`, `transfer`, `link` — схемы описываются в `tasks.md` по образцу `contracts/v1-endpoints.md` спеки 002 |

Парные проверки (правило CLAUDE.md): каждый отказ 403 имеет парный запрос, обязанный вернуть 200.
