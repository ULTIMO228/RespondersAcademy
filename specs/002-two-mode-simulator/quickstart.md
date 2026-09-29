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

Перед запуском задайте `JWT_SECRET` случайным значением длиной не менее 32 байт через окружение или `backend/.env`; значение из примера оставлять пустым нельзя. Для PostgreSQL дополнительно задайте `DATABASE_URL`. Штатный рантайм не требует доступа к интернету.

```bash
cd backend && uv sync --extra nlp --extra pg --group dev
```

```bash
cd backend && uv run python -m ml.scripts.prepare_models
```

```bash
cd backend && uv run python -m ml.scripts.train_classifier
```

`prepare_models` по умолчанию готовит rubert-tiny2, multilingual-e5-small и проверенную копию словаря SymSpell в `backend/models/`. Для выборочной загрузки — `--only embedder` или `--only dedup`; `--tts`, `--stt` добавляют Silero/Vosk, `--llm` вызывает локальную CLI Ollama. Контрольные суммы проверяются при загрузке и через `--verify-only` без сети. Доменные слова лежат в `backend/data/domain_words.txt`, индекс SymSpell собирается при первом обращении в `backend/var/symspell_ru.pkl`. `train_classifier` собирает артефакт `backend/models/ekp_group_lr.joblib` (вне git; без него — режим прототипов).

## 2. База и сиды

SQLite (по умолчанию, `backend/var/dev.db`):

```bash
cd backend && uv run python -m app.seed.load
```

PostgreSQL (схему создаёт Alembic; сид её не создаёт):

```bash
cd backend && DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run alembic upgrade head
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

Весь §5 одной командой — `backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]` (Linux/macOS/WSL/Git Bash) или `pwsh -File backend/scripts/run_frontend_e2e.ps1`: бэкенд на `:8130` с чистым сидом `backend/var/e2e.db`, сборка фронта с `BACKEND_URL`, `next start -p 3130`, три e2e-скрипта; логи в `backend/var/e2e-logs/`. Windows-скрипт принимает `-DatabasePath` и `-LogDirPath` внутри `backend/var/`, чтобы сохранить прежний прогон. На Windows 2026-09-29 проверены студент 40/40, преподаватель 96/96 и администратор 141/141; ограничения офлайн-приёмки описаны в `backend/docs/offline-check.md`.

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

Ожидаемо: accuracy классификатора ≥ 0,80 на 96 задачах (SC-006); согласие оценщика ≥ 0,85 по типам ошибок и корреляция ≥ 0,8 на `backend/data/labeled/` (SC-003/004); валидатор — ≥ 90 % дефектных отклонено, ≥ 85 % корректных пропущено (SC-005). Команда `uv run python -m ml.scripts.eval_validator` проверяет 20 корректных и 20 дефектных билетов. Результаты пишутся в `backend/var/metrics.json` и выдаются администратору через `GET /api/v1/metrics/ml`; подробности и ограничения выборки — `backend/docs/ml-methods.md`.

## 7. Волна B: режим специалиста-112 (Phase 10)

Сессия — как у фронта: `POST /api/mock/auth/login` → cookie `arm112_session` (JSON URL-encoded с `token`) либо `Authorization: Bearer <token>`. Демо-задания из сида: `asg-001` (тренировка, билеты c-010 и c-050) и `asg-002` (экзамен, c-071 и c-090) для `ivanov` / `petrova`.

```bash
curl -s -X POST localhost:8000/api/v1/tickets/c-010/audio -H 'cookie: arm112_session=…' -H 'content-type: application/json' -d '{"voice":"auto"}'
```

Ожидаемо (преподаватель): 202, `transcript` со всеми фактами билета; через ≤ 1 мин `GET /api/v1/tickets/c-010/audio` → `status: ready`, `durationMs` (без модели Silero — `failed`, `emergency: true`, расшифровка остаётся).

```bash
curl -s -X POST localhost:8000/api/v1/operator112/attempts -H 'cookie: arm112_session=…' -H 'content-type: application/json' -d '{"assignmentId":"asg-001","cardId":"c-010"}'
```

Далее (курсант): `POST …/attempts/{id}/answer` → `POST …/events` (`signSelected`, `fieldChanged`, `replay`, `hintShown`) → `GET …/notification-list` → `POST …/submit` с `CardDraft` → `GET …/evaluation` с `fieldDiff`; `GET /api/v1/streets?q=Дуб` — подсказка улиц; `GET /api/v1/tickets?source=operator112` — карточки, сформированные курсантами. Экзамен (`asg-002`): билет и запись выдаются один раз, `evaluation.passed` по порогу 70. Проверка целиком — `uv run pytest -q tests/contract/test_v1_operator112.py`; метрики режима A — `uv run python -m ml.scripts.eval_assessor --mode operator112`.

Phase 12 добавляет `/api/v1/assignments`: преподаватель создаёт задание из выбранных билетов или `randomRule`; для экзамена случайный набор фиксируется сразу, подсказки выключаются. Обучающийся вызывает `POST /assignments/{id}/start`, получает следующий `OperatorAttempt` либо DDS `CardAttemptResponse`, а `GET /assignments/{id}` показывает `progress`. Истечение `timeLimitSec` фиксируется при следующем обращении к заданию с нулевой оценкой и `passed: false`. Завершает задание его преподаватель через `POST /assignments/{id}/finish`.

Проверка Phase 12: `uv run pytest -q tests/contract/test_v1_assignments.py tests/integration/test_exam_flow.py tests/contract/test_v1_operator112.py`.

## 8. Офлайн-приёмка

Отключить сеть, повторить п. 3–5: 0 исходящих запросов за пределы localhost (проверка — `netstat`/захват трафика), генерация сценариев работает по шаблонному пути, если Ollama не запущен.

### Phase 11: валидация и ручное создание

После входа преподавателя или администратора: `POST /api/v1/tickets` создаёт ручной билет с эталоном по ЕКП, difficulty (1–5), grammarErrors и аудитом `ticket.create` (тип `content`). `POST /api/v1/tickets/{id}/validate` без тела возвращает отчёт шести проверок; `GET /api/v1/tickets` возвращает сохранённый отчёт в `validation`. Проверка не утверждает билет автоматически. Для студента POST → 403, без сессии → 401, неизвестный билет → 404.

Метрики SC-005: `cd backend` → `uv run python -m ml.scripts.eval_validator`. Результаты сохраняются в `var/metrics.json`, раздел `validator`: 20/20 корректных, 20/20 дефектных, 2 ручные проверки (22.09.2026). Это регрессионная выборка из банка билетов. API метрик реализован: `GET /api/v1/metrics/ml` с сессией администратора.
