# Quickstart: запуск и проверка (Phase 1)

Цель — доказать, что бэкенд заменяет мок-слой без правок фронта (волна A), а затем — что новые эндпоинты (волна B) работают. Пути — от корня репозитория `RespondersAcademy/`.

## Требования

| Компонент | Версия | Зачем |
|---|---|---|
| Python | ≥ 3.11 | бэкенд и ML |
| `uv` | ≥ 0.4 | окружение и запуск (`uv sync`, `uv run`) |
| Node.js / npm | ≥ 20.9 / ≥ 10 | фронт (как в README) |
| PostgreSQL | ≥ 12 (целевая 14) | боевая БД; для разработки достаточно SQLite |
| Docker Compose | опционально | `backend/docker-compose.yml` (postgres, backend, профиль `llm` — ollama) |
| Интернет | только один раз | `uv sync`, `npm ci`, `backend/ml/scripts/prepare_models.py` |

## 1. Бэкенд: окружение и модели

```bash
cd backend && uv sync --extra pg
```

```bash
cd backend && uv run python -m ml.scripts.prepare_models
```

Скачивает в `backend/models/`: rubert-tiny2, multilingual-e5-small, словарь symspell, (опц. `--tts`, `--stt`, `--llm`). Дальше сеть не нужна.

## 2. База и сиды

SQLite (по умолчанию, `backend/var/dev.db`):

```bash
cd backend && uv run python -m app.seed.load
```

PostgreSQL:

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run alembic upgrade head && DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run python -m app.seed.load
```

Ожидаемо: сводка счётчиков — users 24, classifier 1283, incidentCards 96, armCardFixtures 12, scenarios 36, sessions 2, reports 3, auditLog 22, addresses 14; повторный запуск ничего не дублирует.

## 3. Запуск бэкенда

```bash
cd backend && uv run uvicorn app.main:app --port 8000
```

Проверка:

```bash
curl -s localhost:8000/api/mock/reference | head -c 300
```

```bash
curl -si localhost:8000/api/mock/classifier?group=%D0%BF%D0%BE%D0%B6%D0%B0%D1%80%20%D0%BD%D0%B0%20%D1%83%D0%BB%D0%B8%D1%86%D0%B5 | grep -i x-classifier-version
```

```bash
curl -s -X POST localhost:8000/api/mock/cards/card-881412/status -H 'content-type: application/json' -d '{"ddsStatus":"notAccepted"}'
```

Ожидаемо: `{"error":{"code":"validationFailed","message":"…комментарий…"}}` (400). OpenAPI — `http://localhost:8000/api/docs`.

## 4. Контрактные и юнит-тесты бэкенда

```bash
cd backend && uv run pytest -q
```

Ожидаемо: `tests/contract` — все 60 эндпоинтов по таблице `contracts/compat-endpoints.md` (коды и обязательные поля); `tests/unit` — машина статусов, окно ленты, поиск карточек, оценщик; `tests/integration` — «занятие → попытки → отчёт → правка → обратная связь».

## 5. Фронт через бэкенд (критерий приёмки волны A)

```bash
npm ci && npm run build
```

```bash
BACKEND_URL=http://localhost:8000 npx next start -p 3130
```

Сквозные скрипты фронта без изменений:

```bash
scripts/e2e-student.sh
```

```bash
scripts/e2e-teacher.sh
```

```bash
scripts/e2e-admin.sh
```

Ожидаемо: `PASS` по всем шагам, код возврата 0. В отличие от мок-стора, состояние живёт в БД: перед повторным прогоном — `uv run python -m app.seed.load --reset`.

Ручная проверка: `http://localhost:3130/login` → `ivanov / student112 / АРМ 1` → `/arm` показывает карточки из БД; преподаватель `morozova / teacher112 / 21` → «Сгенерировать (ИИ)» возвращает сценарии с отчётом валидации; оценка попытки в `/arm/progress` имеет бейдж «ИИ» и текст, начинающийся с «ИИ-оценка:».

## 6. Метрики ML (принцип III)

```bash
cd backend && uv run python -m ml.scripts.eval_classifier
```

```bash
cd backend && uv run python -m ml.scripts.eval_assessor
```

```bash
cd backend && uv run python -m ml.scripts.eval_validator
```

Ожидаемо: accuracy классификатора ≥ 0,80 на 96 задачах (SC-006); согласие оценщика ≥ 0,85 по типам ошибок и корреляция ≥ 0,8 на `backend/data/labeled/` (SC-003/004); валидатор — ≥ 90 % дефектных отклонено, ≥ 85 % корректных пропущено (SC-005). Результаты пишутся в `backend/var/metrics.json` и отдаются `GET /api/v1/metrics/ml`.

## 7. Волна B (после появления эндпоинтов)

```bash
curl -s -X POST localhost:8000/api/v1/tickets/c-001/audio -H 'cookie: arm112_session=…' -d '{}'
```

Ожидаемо: 202 и через ≤ 1 мин `GET /api/v1/tickets/c-001/audio` → `status: ready`, `transcript` содержит все факты билета. Далее: `POST /api/v1/assignments` (экзамен `operator112`, 2 билета) → `start` → `submit` → `evaluation` с `fieldDiff` и `passed`.

## 8. Офлайн-приёмка

Отключить сеть, повторить п. 3–5: 0 исходящих запросов за пределы localhost (проверка — `netstat`/захват трафика), генерация сценариев работает по шаблонному пути, если Ollama не запущен.
