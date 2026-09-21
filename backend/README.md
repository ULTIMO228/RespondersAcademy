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

## ML: модели и данные

```bash
uv sync --extra nlp --group dev                 # torch CPU + sentence-transformers (~500 МБ)
uv run python -m ml.scripts.prepare_models      # rubert-tiny2 → backend/models (единственная точка сети)
uv run python -m ml.scripts.eval_assessor       # метрики оценщика на data/labeled → var/metrics.json
uv run python -m ml.scripts.calibrate [--db]    # ridge-подбор весов (+ правки преподавателей) → var/weights.json
```

- Без extra `nlp`/модели оценщик работает: смысловые компоненты считаются лексически и помечаются
  `available=false` (FR-043). Первая загрузка модели ~10 с, дальше — в памяти процесса.
- Данные в репозитории: `data/streets/moscow_streets.json` (OSM, `ml.scripts.build_streets`),
  `data/dict/ru_frequency.txt` + `data/domain_words.txt` (`ml.scripts.build_domain_words`) для symspell,
  `data/labeled/` (размеченная выборка, `ml.scripts.build_labeled`, правила — `data/labeled/README.md`).
- Индекс spellcheck кэшируется в `var/symspell_ru.pkl` (пересобирается при изменении словарей).

## Phase 5: профили и экспорт

- `GET/PUT /api/mock/profile-mapping` (также `/api/v1`): шесть профилей из `app/seed/profile_mapping_seed.py`, подсчёт курсантов из БД, проверка групп ЕКП, атомарное сохранение и аудит `profileMapping.save`.
- Для автоматического плана ДДС: категории занятия ∩ категории профиля ∩ реакция службы в классификаторе. Профили без `classifierName` используют категории преподавателя; `operator112` фильтруется только по категориям. Явная выдача преподавателем и занятия без плана сохраняют семантику мока.
- `GET /api/v1/reports/{id}/export.csv` и `export.pdf`: индивидуальный или групповой id из `/reports`. Требуется cookie или Bearer; студент скачивает свой отчёт, преподаватель — отчёты своих занятий, администратор — любые. CSV с BOM содержит строку на попытку; PDF использует локальный `data/fonts/DejaVuSans.ttf` (лицензия рядом, шрифт включён в wheel).
- Времена и отклонения — в миллисекундах; незавершённые/неоценённые результаты пустые, правки преподавателя учитываются. «Сдал/не сдал» — только для экзамена с явно заданным `exam.passThreshold`.
- Добавленные профили можно загрузить `uv run python -m app.seed.load`; схема БД не изменилась. Как и остальные сиды, повторная загрузка восстанавливает исходные значения профилей.
- Визуальная QA PDF: `uv run python scripts/check_report_pdf.py` создаёт тестовые файлы в `var/` на отдельной БД в памяти; затем отрисовать `pdftoppm -png var/report-export-qa.pdf var/report-export-qa`.
- Полный `scripts/e2e-teacher.sh` остаётся гейтом T074 после фаз 6/8; этапы мастера/контроля/отчётов покрываются pytest сейчас. Категория скрипта по умолчанию «пожар в жилом доме» исключается для Чертаново строгой проверкой реакции `Деп. ЖКХ` в текущем классификаторе (решение T054).

## Переменные окружения

См. `.env.example`. Ключевые: `DATABASE_URL`, `JWT_SECRET`, `SEED_DIR`, `MODELS_DIR`, `OLLAMA_URL`.
