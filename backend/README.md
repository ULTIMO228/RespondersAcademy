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

## Phase 6: сценарии, генерация, валидация

- Эндпоинты `/api/mock` (и `/api/v1`): `GET/POST /scenarios`, `GET/PATCH/DELETE /scenarios/{id}`, `POST /scenarios/{id}/validate` (`submit` из draft/rejected/approved, `approve`/`approvePartial`/`reject` из pending, иначе 409), `POST /scenarios/generate` (201, категория → 3 вариации с ловушками `—`/`foreignTerritory`/`operatorMistake`; повтор по категории возвращает существующие), `GET /training-cards` (96 исходных + сгенерированные `c-097…`), `GET/POST /materials`, `POST /grammar-check`. Удаление мягкое; шаблоны и сценарии из занятий не удаляются (409). Отчёт валидатора — в ответе как дополнительное поле `validationReport`.
- Роли: без cookie — как мок (id из тела/query); с cookie студент → 403, чужой преподаватель → 403, администратор — без ограничений.
- Классификатор групп ЕКП (`ml/classify/ekp_group_classifier.py`, rubert-tiny2 + LogisticRegression). Артефакт `models/ekp_group_lr.joblib` **не в git** — после клона обучить:

```bash
uv run python -m ml.scripts.build_synthetic_groups   # строки classifier.json → data/labeled/synthetic_groups.json (уже в репозитории)
uv run python -m ml.scripts.train_classifier         # 96 карточек + синтетика → models/ekp_group_lr.joblib
uv run python -m ml.scripts.eval_classifier          # accuracy на 96 карточках + 5-блочная кросс-валидация → var/metrics.json
uv run python -m ml.scripts.build_labeled_tickets    # 20 корректных + 20 дефектных билетов → data/labeled/tickets/ (уже в репозитории)
```

  Без артефакта классификатор работает по прототипам (центроиды групп), без эмбеддингов — лексически с `available=false`. Текущие метрики: accuracy 1,0 на 96 карточках (в обучении) и 0,57 на кросс-валидации.
- Валидатор (`ml/generate/validator.py`): критерии `category`, `address`, `requiredFields`, `duplicate`, `grammar`, `consistency`; на `data/labeled/tickets/` — 20/20 и 20/20 (`uv run pytest tests/unit/test_validator.py`). Дедупликация (`ml/nlp/dedup.py`) использует `multilingual-e5-small`, если скачан (`prepare_models --only dedup`), иначе rubert-tiny2; порог 0,92.
- Генератор (`ml/generate/scenario_generator.py`): шаблонный путь без сети; при заданных `OLLAMA_URL` / `OLLAMA_MODEL` (`OLLAMA_TIMEOUT_SEC`, см. `.env.example`) и доступном сервере — LLM-путь с JSON-схемой и ≤ 2 повторами, при сбое — шаблон. Подключён в `LocalAiGateway.generate_scenario` (`app/ai_gateway.py`); подмена реализации командой ИИ-агентов — через `set_gateway()`.
- `scripts/e2e-teacher.sh` на Windows не гоняется (curl из Git Bash портит кириллицу в argv); генерация проверена на живом сервере, общий гейт — T074.

## Phase 7: софтфон B→C

- `POST /calls/reply` (`{ toNumber, turn: answer|reply, text? }` → `AiResponse<CallReply>`): сначала `AiGateway.call_reply` (зона команды ИИ-агентов, заглушка `None`), затем детерминированный `ml/insights/call_responder.py` — «Слушаю вас» / «Понял, информация принята» с вариациями по службе, голос по чётности номера, `speakerTitle` из `reference.internalNumbers`; 404 «Абонент не найден».
- `POST /cards/{id}/calls` (`{ studentId, toNumber, startedAt, endedAt, transcript }` → 201 `{ sessionId, attemptId, call }`): вызов дописывается в `CardEvent.calls` последней попытки курсанта по карточке (идущее занятие приоритетно); попытку создаёт открытие карточки. Расширение `call.report` — сверка доклада с фактами карточки (номер карточки, адрес, тип, пострадавшие, решение); при оценке попытки без `etalon.reportChecklist` пропуски попадают в ошибку `reportIncomplete` (оценщик `dds-1.1.0`).

## Переменные окружения

См. `.env.example`. Ключевые: `DATABASE_URL`, `JWT_SECRET`, `SEED_DIR`, `MODELS_DIR`, `OLLAMA_URL`.
