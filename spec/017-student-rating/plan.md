# План реализации: Рейтинг обучающихся для преподавателя

**Ветка**: `fix/tz-audit` (отдельная не создавалась) | **Дата**: 2026-10-19 | **Спека**: [spec.md](spec.md)

## Краткое описание

Преподаватель получает экран «Рейтинг» — таблицу учеников закреплённой группы с баллами, рейтингами режимов и скоростью относительно нормативов, сортировкой и местами; по клику — полный профиль ученика (скорость, динамика, слабые этапы, ошибки, рекомендации, попытки). Профиль и рейтинг закрыты правами закрепления групп (спека 003). Решения — [research.md](research.md).

## Технический контекст

**Язык/версии**: TypeScript strict, Next.js App Router + React; Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2.
**Зависимости**: новых нет.
**Хранилище**: новых таблиц нет; чтение `attempts/evaluations/teacher_overrides/student_ratings`.
**Тестирование**: pytest + ruff; Vitest + RTL; контракт `expected_fields.json`.
**Платформа**: десктоп 1920 px+.
**Производительность**: рейтинг группы ≤ 30 учеников ≤ 2 с (SC-004): одна выборка попыток группы, рейтинги — по ученику.
**Ограничения**: локальный контур; русский; ученикам недоступно (ТЗ §8).

## Проверка конституции

| Принцип | Оценка | Основание |
|---|---|---|
| I. Локальный контур | ✅ | Только вычисления на бэкенде |
| II. Методическая достоверность | ✅ | Нормативы Q&A 30 с / 3 мин; правка преподавателя приоритетна |
| III. Измеримый ML | ✅ | Новых метрик ML нет; рейтинг — существующий |
| IV. Простота | ✅ | Без таблиц и пакетов; слабые этапы — из существующей карты ошибок |
| V. Единый контракт | ✅ | Новые типы добавлением, сверка TS ↔ Pydantic |
| Аудит/права | ✅ | Права — общий модуль `error_map_access`; закрыт дефект открытого профиля |

Повторная проверка после Phase 1: нарушений нет.

## Структура

```text
spec/017-student-rating/{spec,plan,research,data-model,quickstart}.md, contracts/student-rating-endpoints.md

backend/app/
├── schemas/student_rating.py
├── services/student_rating_service.py   # group_rating(), student_stats(), summarize()
├── services/analytics.py                # rows(..., student_ids=…)
├── services/rating_service.py           # защита sync() от гонки вставки
├── api/v1/student_rating.py             # /teacher/rating, /teacher/students/{id}/stats (+ регистрация)
└── api/v1/recommendations.py            # профиль через require_student_access
backend/tests/{unit,integration}/test_student_rating*.py

src/
├── shared/api/types/student-rating.ts, endpoints/student-rating.ts
├── shared/config/routes.ts              # teacherRating(query), teacherStudent(id, from)
├── pages/teacher/rating/                # экран рейтинга, модель сортировки/мест (+ тесты)
├── pages/teacher/students/              # профиль: новые разделы, «Назад к рейтингу»
└── widgets/platform-nav/config/navItems.ts  # пункт «Рейтинг»
app/teacher/rating/page.tsx
```

## Фазы
1. Бэкенд: схемы, сервис, роутер, права профиля, гонка `sync`, тесты.
2. Фронт: типы и клиент, экран рейтинга (US1), профиль (US2), навигация.
3. Права в UI (US3): сообщения 403 / нет групп.
4. Проверка по quickstart, реестр, отчёт, Obsidian.
