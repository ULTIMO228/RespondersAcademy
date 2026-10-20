# Tasks: Рейтинг обучающихся (006)

**Input**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/student-rating-endpoints.md)
Формат: `[ID] [P?] [Story] Описание`. Тесты входят в задачи (конституция: «движок и API — pytest»).

## Phase 1: Основание (бэкенд)
- [X] T001 `analytics.rows()` — необязательный `student_ids` (одна выборка на группу) в `backend/app/services/analytics.py`
- [X] T002 Защита `rating_service.sync()` от гонки вставки `student_ratings` (повтор чтения при `IntegrityError` через savepoint) в `backend/app/services/rating_service.py` (отдельного теста гонки нет — покрыто общими тестами профиля и рейтинга)
- [X] T003 [P] Схемы `StudentRatingRow/Response`, `StudentStats*` в `backend/app/schemas/student_rating.py`

## Phase 2: US1 — таблица рейтинга (P1) 🎯
- [X] T004 [US1] `student_rating_service.group_rating()` — группы, строки, нормативы, `enoughData` в `backend/app/services/student_rating_service.py`
- [X] T005 [US1] Роутер `GET /teacher/rating` в `backend/app/api/v1/student_rating.py`, регистрация в `api/v1/__init__.py`
- [X] T006 [P] [US1] Тесты расчёта (средние, доля в нормативе, период, режим, правка преподавателя) `backend/tests/integration/test_student_rating.py`
- [X] T007 [P] [US1] TS-типы `src/shared/api/types/student-rating.ts` + экспорт, клиент `src/shared/api/endpoints/student-rating.ts`; обновить `expected_fields.json`
- [X] T008 [US1] Модель сортировки и мест `src/pages/teacher/rating/model/rank.ts` + тесты
- [X] T009 [US1] Экран `src/pages/teacher/rating/ui/TeacherRatingScreen.tsx` (фильтры 44 px/16 px, `aria-sort`, выделение вне норматива значком и текстом, «мало данных»), состояние в query; роут `app/teacher/rating/page.tsx`, `ROUTES.teacherRating`, пункт навигации «Рейтинг» + тесты

## Phase 3: US2 — полный профиль (P1)
- [X] T010 [US2] `student_stats()` и `GET /teacher/students/{id}/stats` + тесты
- [X] T011 [US2] Профиль `TeacherStudentScreen`: «Скорость», «Динамика», «Слабые этапы» (карта ошибок, до 3 red/yellow), «Попытки», «Назад к рейтингу» (`?from=`), «Назначить тренировку» + тесты

## Phase 4: US3 — права (P1)
- [X] T012 [US3] `GET /teacher/students/{id}/profile` через `require_student_access` в `backend/app/api/v1/recommendations.py`; тесты: чужой преподаватель 403, ученик 403, админ 200, аноним 401
- [X] T013 [US3] Тесты прав рейтинга и статистики (чужая группа 403, нет группы 404, без закреплений — пустой список)
- [X] T014 [US3] UI: «Нет закреплённых групп — обратитесь к администратору», «Нет доступа к этому обучающемуся»; список `/teacher/students` у преподавателя — только его группы

## Phase 5: Проверка
- [X] T015 pytest + ruff, vitest, tsc, eslint; браузер по [quickstart.md](quickstart.md); реестр `spec/README.md`
