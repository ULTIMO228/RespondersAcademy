# Бэкенд Responders Academy (АРМ-112)

Python 3.11+ / FastAPI / SQLAlchemy 2 (async) / PostgreSQL (для разработки — SQLite). Заменяет мок-слой фронта
`/api/mock/*` без смены контракта (`docs/mock-api.md`, `spec/05-data-models.md`) и добавляет `/api/v1` для
режима специалиста-112, экзамена и лобби. Спецификация и план — `specs/002-two-mode-simulator/`.

## Быстрый старт (SQLite)

```bash
cd backend
uv sync --group dev
uv run python -m app.seed.load          # сиды из spec/mocks, mocks/local, mocks/admin
uv run uvicorn app.main:app --port 8000 # http://localhost:8000/api/docs
uv run pytest -q
```

Фронт через бэкенд (без правок кода фронта, кроме rewrite в `next.config.ts`):

```bash
BACKEND_URL=http://localhost:8000 npm run dev
```

## PostgreSQL

```bash
DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run python -m app.seed.load
```

или `docker compose up` из `backend/` (профиль `llm` поднимает Ollama).

## Структура

- `app/` — FastAPI: `api/compat` (контракт фронта, монтируется под `/api/mock` и `/api/v1`), `api/v1` (новое),
  `models/` (SQLAlchemy), `schemas/` (Pydantic, camelCase 1:1 с `src/shared/api/types`), `services/`, `seed/`.
- `ml/` — оценщик (`assess`), NLP (`nlp`), классификатор ЕКП (`classify`), генерация/валидация билетов
  (`generate`), рекомендации (`insights`), речь (`speech`), скрипты метрик (`scripts`).
- `tests/` — `contract` (по таблице `specs/002-two-mode-simulator/contracts/compat-endpoints.md`),
  `unit`, `integration`.
- `var/` — рантайм (БД SQLite, аудио, бэкапы), `models/` — локальные модели; оба вне git.

## Переменные окружения

См. `.env.example`. Ключевые: `DATABASE_URL`, `JWT_SECRET`, `SEED_DIR`, `MODELS_DIR`, `OLLAMA_URL`.
