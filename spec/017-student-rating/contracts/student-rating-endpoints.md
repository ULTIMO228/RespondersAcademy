# Контракты: Рейтинг обучающихся (017)

Пути под `/api/v1`. Порядок проверок — как в `error_map_access` (401 → 403 роль → 404 существование → 403 права).

## GET /teacher/rating?groupId=&period=&mode=

- `period ∈ {2w, 1m, all}` (по умолчанию `all`), `mode ∈ {operator112, dds, all}` (по умолчанию `all`), иначе 422.
- `groupId` не задан → первая доступная группа; доступных нет → `200 { groups: [], groupId: null, rows: [] }`.
- Ответ — `StudentRatingResponse` (data-model). Чужая группа → 403 «Нет доступа к группе / обучающемуся»; несуществующая → 404; обучающийся → 403.

## GET /teacher/students/{studentId}/stats?period=&mode=

- Ответ — `StudentStats`. Права — `require_student_access`.

## GET /teacher/students/{studentId}/profile (изменение прав)

- Было: любой преподаватель. Стало: `require_student_access` — преподаватель только своих групп, админ — любой, обучающийся — 403.

## TS-типы
`src/shared/api/types/student-rating.ts`: `StudentRatingRow`, `StudentRatingResponse`, `StudentStats`, `StudentStatsSummary`, `StudentStatsAttempt`, `RatingMode`. Pydantic — `backend/app/schemas/student_rating.py` (camelCase), сверка через `expected_fields.json`.

## UI
- `/teacher/rating?groupId=&period=&mode=&sort=&dir=` — таблица, фильтры (≥ 44 px, текст 16 px), сортируемые заголовки (`aria-sort`), строка-ссылка на профиль.
- `/teacher/students/[id]?from=…` — профиль: существующие блоки + «Скорость», «Динамика», «Слабые этапы», «Попытки», «Назад к рейтингу», «Назначить тренировку».
- Навигация преподавателя: пункт «Рейтинг».
