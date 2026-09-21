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
cd backend && uv sync --extra nlp --extra pg --group dev
```

```bash
cd backend && uv run python -m ml.scripts.prepare_models
```

```bash
cd backend && uv run python -m ml.scripts.train_classifier
```

`prepare_models` скачивает в `backend/models/` rubert-tiny2 (~120 МБ; `--only embedder dedup` добавит multilingual-e5-small, ~470 МБ — для демо не обязателен: на объявленных дублях сидов rubert-tiny2 даёт тот же результат). Словарь symspell и доменные слова лежат в репозитории (`backend/data/dict/`, `backend/data/domain_words.txt`), индекс собирается при первом обращении в `backend/var/symspell_ru.pkl`. `train_classifier` собирает артефакт классификатора `backend/models/ekp_group_lr.joblib` (вне git; без него — режим прототипов). Флаги `--tts`, `--stt`, `--llm` появятся в волне B (T110). Дальше сеть не нужна.

## 2. База и сиды

SQLite (по умолчанию, `backend/var/dev.db`):

```bash
cd backend && uv run python -m app.seed.load
```

PostgreSQL (схему создаёт сам сид через `create_all`; миграции Alembic — T109, Phase 17):

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run python -m app.seed.load
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

Весь §5 одной командой — `backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]` (Linux/macOS/WSL/Git Bash) или `powershell -File backend\scripts\run_frontend_e2e.ps1`: бэкенд на `:8130` с чистым сидом `backend/var/e2e.db` (свежий процесс перед каждым скриптом), сборка фронта с `BACKEND_URL`, `next start -p 3130`, три e2e-скрипта; логи в `backend/var/e2e-logs/`. На Windows `npm run build` из cmd не работает (bash-синтаксис в `package.json`) — скрипт вызывает `mocks:sync`, `mocks:validate` и `npx next build` напрямую.

Ручная проверка: `http://localhost:3130/login` → `ivanov / student112 / АРМ 1` → `/arm` показывает карточки из БД; преподаватель `morozova / teacher112 / 21` → «Сгенерировать (ИИ)» возвращает сценарии с отчётом валидации; оценка попытки в `/arm/progress` имеет бейдж «ИИ» и текст, начинающийся с «ИИ-оценка:».

## 6. Метрики ML (принцип III)

```bash
cd backend && uv run python -m ml.scripts.eval_classifier
```

```bash
cd backend && uv run python -m ml.scripts.eval_assessor
```

```bash
cd backend && uv run pytest -q tests/unit/test_validator.py
```

Ожидаемо: accuracy классификатора ≥ 0,80 на 96 задачах (SC-006); согласие оценщика ≥ 0,85 по типам ошибок и корреляция ≥ 0,8 на `backend/data/labeled/` (SC-003/004); валидатор — ≥ 90 % дефектных отклонено, ≥ 85 % корректных пропущено (SC-005) — в волне A это проверяет unit-тест на `backend/data/labeled/tickets/` (20 корректных + 20 дефектных); отдельный `ml/scripts/eval_validator.py` и `GET /api/v1/metrics/ml` — волна B (T087, T110). Результаты классификатора и оценщика пишутся в `backend/var/metrics.json`.

## 7. Волна B (после появления эндпоинтов)

```bash
curl -s -X POST localhost:8000/api/v1/tickets/c-001/audio -H 'cookie: arm112_session=…' -d '{}'
```

Ожидаемо: 202 и через ≤ 1 мин `GET /api/v1/tickets/c-001/audio` → `status: ready`, `transcript` содержит все факты билета. Далее: `POST /api/v1/assignments` (экзамен `operator112`, 2 билета) → `start` → `submit` → `evaluation` с `fieldDiff` и `passed`.

## 8. Офлайн-приёмка

Отключить сеть, повторить п. 3–5: 0 исходящих запросов за пределы localhost (проверка — `netstat`/захват трафика), генерация сценариев работает по шаблонному пути, если Ollama не запущен.
