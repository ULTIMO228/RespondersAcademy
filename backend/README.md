# Бэкенд Responders Academy (АРМ-112)

Python 3.11+ / FastAPI / SQLAlchemy 2 (async) / PostgreSQL (для разработки — SQLite). Заменяет мок-слой фронта
`/api/mock/*` без смены контракта (`docs/mock-api.md`, `spec/05-data-models.md`) и добавляет `/api/v1` для
режима специалиста-112, экзамена и лобби. Спецификация и план — `specs/002-two-mode-simulator/`.

## Быстрый старт (SQLite)

До запуска задайте `JWT_SECRET` случайным секретом длиной не менее 32 байт в окружении или `backend/.env` (см. `.env.example`).

```bash
cd backend
uv sync --group dev
uv run python -m app.seed.load          # сиды из spec/000-фронт/mocks, mocks/local, mocks/admin
uv run uvicorn app.main:app --port 8000 # http://localhost:8000/api/docs
uv run pytest -q
```

Существующая `var/dev.db` может быть старой схемы: `create_all` не добавляет новые столбцы. Например, база без `users.locked_until` даёт 500 при входе. Для демо используйте новую базу, задав `DATABASE_URL=sqlite+aiosqlite:///./var/demo-preview.db` **до** `python -m app.seed.load` и запуска Uvicorn; старую `dev.db` не сбрасывайте без сохранения данных. Миграция существующей PostgreSQL-базы остаётся в T109.

Справочник лобби (Phase 13) собирается из ЕКП и учебных билетов в `data/kb/`:

```bash
uv run python -m ml.scripts.build_kb
uv run python -m app.seed.load
```

Повторная загрузка добавляет новые статьи и сохраняет правки преподавателя в существующих статьях.

Рекомендации и адаптивная сложность (Phase 14): `GET /api/v1/me/recommendations`, профиль и групповые инсайты преподавателя. Для адаптивного подбора в тренировочном задании задайте `params.adaptive: true`, в плане занятия — `adaptive: true`. Метрика SC-008 воспроизводится командой `uv run python -m ml.scripts.eval_recommender`.

Цепочка A → B (Phase 15): создайте задание `trainingMode: "chain"` с исходным билетом и курсантами оператора 112 и ДДС. После отправки карточки адресат из списка оповещения получает её в `cardFlow` с `issuedBy: "chain"`; если адресата нет, в `params.noRecipient` задания появляется запись с `cardId`. Эталон ДДС сверяется с исходным билетом. В отчёте связи попыток доступны в `chainLinks`. Преподаватель может выдать ловушку через `POST /sessions/{id}/control` с `{"action":"issue","studentId":"...","cardId":"...","trapType":"wrongType"}`; доступны также `addressTypo`, `outOfZone`, `duplicate`.

Сообщения о ходе работ (Phase 16): включите `workMessagesEnabled: true` в `plan` занятия или `params` задания. Интервалы после статуса `accepted` задаются массивом `workMessageIntervalsSec` из четырёх возрастающих секунд (по умолчанию 20, 50, 90, 150); для отдельных категорий используйте `workMessageIntervalsByGroup`. Курсант получает наступившие сообщения через `GET /api/v1/attempts/{id}/work-messages?since=<ISO>`. Оценщик проверяет статус до сообщения и задержку более 30 секунд.

Аудиодоклад: установите `uv sync --extra stt` и подготовьте локальную модель Vosk small-ru командой `uv run python -m ml.scripts.prepare_models --only stt` (или задайте `MODELS_DIR`). Курсант загружает WAV из открытой карточки; `POST /api/v1/attempts/{id}/report-audio` принимает моно PCM 16 бит, 8/16 кГц, сохраняет транскрипт, чек-лист и файл в попытке. В карточке запись можно прослушать, преподаватель видит её в мониторинге через «Записи по карточке». Без модели эндпоинт возвращает 503 с причиной. Проверка чек-листа на 20 размеченных докладах: 95 из 100 пунктов.

Для демонстрации карточки `c-010` подготовьте локальный пример `uv run python scripts/prepare_demo_audio.py`; скрипт синтезирует `backend/var/demo-dds-report.wav` (16 кГц, файл не хранится в Git). При локальной проверке Vosk распознал этот файл, чек-лист отметил 5/5 пунктов. Голос заявителя — отдельная запись TTS: подготовьте Silero командой `uv run python -m ml.scripts.prepare_models --only tts`, затем запустите генерацию через `POST /api/v1/tickets/c-010/audio` под преподавателем; после статуса `ready` запись появляется в мониторинге и доступна по `/api/v1/tickets/c-010/audio/file`. Это озвученная реплика заявителя, а не запись двустороннего телефонного разговора. Для свежего сида генерацию нужно запустить заново.

Сквозной прогон 2026-09-29 на отдельной `demo-preview.db`: Next.js `:3000` → FastAPI `:8000`, TTS `ready`, файл заявителя 200, загрузка доклада 201, чек-лист 5/5, файл доклада 200. Headless Edge подтвердил загрузку и плеер в карточке курсанта, обе записи — в мониторинге преподавателя. Локальные серверы используют `BACKEND_URL=http://localhost:8000` на этапе сборки Next.js; при изменении адреса бэкенда пересоберите фронт.

Фронт через бэкенд (rewrite в `next.config.ts` направляет `/api/mock/*` и `/api/v1/*` на FastAPI):

```bash
BACKEND_URL=http://localhost:8000 npm run dev
```

## PostgreSQL

```bash
uv sync --extra pg --group dev
DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://arm112:arm112@localhost:5432/arm112 uv run python -m app.seed.load
```

Схемой PostgreSQL управляет Alembic; сиды её не создают. `uv run pytest tests/integration/test_alembic.py` проверяет миграцию и сиды на новой SQLite-базе, а также компиляцию миграций в офлайн SQL PostgreSQL (45 `CREATE TABLE`, 70 колонок JSONB); `uv run alembic check` выявляет расхождения моделей и схемы. `docker compose up` из `backend/` выполняет миграцию и сиды перед запуском API (профиль `llm` поднимает Ollama). Для проверки `upgrade head` и сидов на реальном PostgreSQL 14 нужен доступный сервер и extra `pg`; офлайн-компиляция не заменяет этот прогон.

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
uv run python -m ml.scripts.prepare_models      # rubert-tiny2, multilingual-e5-small, SymSpell → models/
uv run python -m ml.scripts.prepare_models --tts --stt  # опциональные Silero и Vosk
uv run python -m ml.scripts.prepare_models --llm        # опционально: ollama pull OLLAMA_MODEL
uv run python -m ml.scripts.prepare_models --verify-only  # сверка локальных SHA-256 без сети
uv run python -m ml.scripts.eval_assessor       # метрики оценщика на data/labeled → var/metrics.json
uv run python -m ml.scripts.calibrate [--db]    # ridge-подбор весов (+ правки преподавателей) → var/weights.json
```

- Без extra `nlp`/модели оценщик работает: смысловые компоненты считаются лексически и помечаются
  `available=false` (FR-043). Первая загрузка модели ~10 с, дальше — в памяти процесса.
- Данные в репозитории: `data/streets/moscow_streets.json` (OSM, `ml.scripts.build_streets`),
  `data/dict/ru_frequency.txt` + `data/domain_words.txt` (`ml.scripts.build_domain_words`) для symspell,
  `data/labeled/` (размеченная выборка, `ml.scripts.build_labeled`, правила — `data/labeled/README.md`).
- Индекс spellcheck кэшируется в `var/symspell_ru.pkl` (пересобирается при изменении словарей).
- Подготовка сверяет SHA-256 фиксированных файлов и хеши Git/LFS для Hugging Face, затем пишет `.sha256.json` рядом с каждой моделью. `--only embedder` или `--only dedup` ограничивает загрузку. Словарь SymSpell в `models/symspell/` — проверенная копия; рантайм читает исходный `data/dict/ru_frequency.txt`.
- `GET /api/v1/health` показывает `installed` (файлы есть) и `loaded` (модель уже в памяти) для пяти компонентов. `GET /api/v1/metrics/ml` доступен администратору, возвращает `var/metrics.json` без преобразований; до генерации метрик возвращает 404.

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

## Phase 8: администрирование

- `/admin/users` (список с фильтрами `role/state/group/q`, `POST` 201 / 409 при занятом логине, `PATCH`, `block/unblock/toggle-active`, `reset-password` — временный пароль показывается один раз). Инициатор — cookie администратора либо `adminId` в теле; студент/преподаватель на `/admin/*` → 403.
- `/admin/system/services` (+ `integrity`: БД, каталоги `var/`, модели), `POST …/{id}/action` (`start/stop/restart`; критичный сервис при идущем занятии → 409), `/admin/system/settings` (`PATCH` по секциям, `database` read-only, нормативы ТЗ → 422 со списком нарушений), `/admin/system/logs?level=`, `/admin/system/monitoring`, `/admin/system/usage-stats?period=`, `/admin/audit` (фильтры `type/operator/card/from/to/q`, пагинация).
- Бэкап «Выполнить сейчас» (`PATCH {backup:{lastAt}}`): SQLite — копия БД, PostgreSQL — `pg_dump` (нужен в `PATH`) → `var/backups/`; сбой пишется в системные журналы, настройки всё равно сохраняются.
- Сиды раздела: `mocks/admin/{system-services,system-settings,system-logs,monitoring,usage-stats,audit-log}.json` — грузятся `python -m app.seed.load` (после обновления схемы — `--reset`).

## Phase 9: гейт волны A

- Формы ответов: `uv run python scripts/extract_ts_fields.py` извлекает обязательные поля из `src/shared/api/types/*.ts` в `tests/contract/expected_fields.json`; `tests/contract/test_response_shapes.py` сверяет с ними все GET-эндпоинты таблицы контракта (тест `test_expected_fields_are_fresh` требует перегенерации после изменения TS-типов).
- Демо-путь `docs/demo-script.md` целиком через HTTP — `tests/integration/test_demo_path.py` (admin → teacher → занятие на двух курсантов → попытки со звонком → отчёт → правка → обратная связь → данные `/arm/progress`).
- Сквозные скрипты фронта: `backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]` (Linux/macOS/WSL/Git Bash) или `pwsh -File backend/scripts/run_frontend_e2e.ps1` — поднимают бэкенд на `:8130` с чистым сидом (`var/e2e.db`), собирают фронт, запускают `next start -p 3130` с `BACKEND_URL` и прогоняют `scripts/e2e-{student,teacher,admin}.sh`; логи — `var/e2e-logs/`. Windows-скрипт принимает отдельные `-DatabasePath` и `-LogDirPath` внутри `backend/var/`. В Git Bash в `PATH` подставляется системный `C:\Windows\System32\curl.exe` — mingw-curl портит кириллицу в argv.
- Ограничения Git Bash/Windows: `sort` из System32 добавляет CR (дедуп в скрипте через `awk`), порты освобождаются через `netstat`/`taskkill`, `PYTHONUTF8=1`; фронт собирается `mocks:sync` + `mocks:validate` + `npx next build` (не `npm run build` — его строка с `NEXT_TELEMETRY_DISABLED=1` под cmd не работает). Rewrite по `BACKEND_URL` запекается в `.next/routes-manifest.json` при сборке, поэтому `.env.local` на время прогона откладывается и восстанавливается по завершении.
- Правки бэкенда ради гейта (согласованы 2026-09-21, подробности — `specs/002-two-mode-simulator/research.md`):
  - Фильтр профиля курсанта (T054): если «категории плана ∩ профиль ∩ реакция службы» пусто, план откатывается на «категории плана ∩ категории профиля» с `WARN` в системных журналах (`session_engine.resolve_student_profile` → `(groups, strict)`).
  - Сгенерированный сценарий содержит две карточки — новую и исходную карточку группы (`cardIds = [новая, исходная]`, как мок); эталон исходной — отдельный сегмент без ловушки; валидатор прогоняется по обеим.
  - `GET /admin/audit` доступен и преподавателю (студент → 403).
  - Прогрев ML при старте: `ML_WARMUP=1` (по умолчанию) в фоне загружает эмбеддер, symspell и классификатор (~25 с), иначе первая оценка попытки упирается в тайм-аут прокси Next; в тестах `ML_WARMUP=0`.

## Phase 10: режим специалиста-112 (`/api/v1`, US3)

- Эндпоинты `app/api/v1/tickets.py` и `app/api/v1/operator112.py` по `specs/002-two-mode-simulator/contracts/v1-endpoints.md`: билеты и аудио (`GET/POST /tickets`, `POST|GET /tickets/{id}/audio`, `GET …/audio/file`), попытка режима A (`POST /operator112/attempts` → `answer` → `events` → `notification-list` → `submit` → `evaluation` с `fieldDiff`), `GET /streets?q=`. Все — с сессией (401), обучающийся — только свои попытки (403).
- Задания: модели `assignments`/`assignment_attempts` (API — Phase 12); демо-сид `app/seed/assignments_seed.py` — `asg-001` тренировка (c-010, c-050), `asg-002` экзамен (c-071, c-090, порог 70) для `ivanov`/`petrova`. Экзамен: билет и запись — один раз, подсказки отключены.
- Аудио билета: текст — `AiGateway.call_script` (команда ИИ) или шаблон `ml/generate/call_script.py`; синтез — Silero v4 ru (`uv run python -m ml.scripts.prepare_models --only tts` → `models/silero/v4_ru.pt`, ≈40 МБ), файлы `var/audio/{cardId}.wav`, в фоне. Без модели или `TTS_ENABLED=0` — `status: failed` и расшифровка с `emergency: true` (аварийный режим). Генерируется лениво: первая попытка по билету, `POST /tickets/{id}/audio`, утверждение сценария.
- Оценщик режима A: `ml/assess/operator112.py` (`operator112-1.0.0`), правила `op-*` в `ml/assess/rules.py`, список оповещения по ЕКП — `ml/classify/notification_list.py`. Разметка: `uv run python -m ml.scripts.build_labeled_operator112` (58 карточек) и `uv run python -m ml.scripts.eval_assessor --mode operator112` → `var/metrics.json[assessorOperator112]` (2026-09-22: согласие 1,0, Pearson 0,97, Spearman 0,83).
- Схема БД изменилась (`attempts`: answered_at, aon, incident_number, state, events; новые `ticket_audio`, `streets`, `assignments`, `assignment_attempts`) — `uv run python -m app.seed.load --reset`.
- Тесты: `tests/unit/test_assess_operator112.py` (5 карточек US2), `tests/unit/test_call_script_tts.py` (реплика, числа для Silero, список оповещения; синтез WAV при наличии модели), `tests/contract/test_v1_operator112.py` (полный цикл, экзамен, шлюз ИИ).

## Проверено 2026-09-22: quickstart §1–§6 на чистом окружении (T076)

Свежий `git clone --depth 1` (коммит `a1bef24`), Windows 11 / Git Bash, Python 3.13 через `uv`, Node 24.19 / npm 11.17, SQLite. Ничего, кроме репозитория, не переносилось (модели и артефакты собраны заново).

| § | Шаг | Результат |
|---|---|---|
| 1 | `uv sync --extra nlp --extra pg --group dev` → `prepare_models` → `train_classifier` | 15 с; rubert-tiny2 115 МБ; `ekp_group_lr.joblib` — 2767 примеров, 105 классов, ~2 мин |
| 2 | `python -m app.seed.load` ×2 | users 24, classifier 1283, incidentCards 96, armCardFixtures 12, scenarios 36, sessions 2, reports 3, auditLog 22, addresses 14 (+ profileMapping 6, reference 10, admin-сиды); повтор не дублирует (`var/` создаётся сам) |
| 3 | `uvicorn` + curl | `/reference` 200; `x-classifier-version` есть; `POST …/status` без комментария → 400 `validationFailed`; `/api/docs` 200; прогрев ML 29,8 с (embedder, spellcheck, classifier=lr) |
| 4 | `uv run pytest -q`, `ruff check .` | 146 passed за 32 с; ruff чисто |
| 5 | `npm ci` + `backend/scripts/run_frontend_e2e.sh` | e2e-student 40/40, e2e-teacher 96/96, e2e-admin 140/140, EXIT=0 |
| 6 | `eval_classifier`, `eval_assessor`, `pytest tests/unit/test_validator.py` | классификатор accuracy 1,0 / top-3 1,0 на 96 (cv 0,57, 0,15 с/текст); оценщик `dds-1.1.0` на 110 образцах — согласие 1,0, κ 1,0, Pearson 0,93, **Spearman 0,76** (ниже 0,8: критерий `eval_assessor` — Pearson ≥ 0,8; ранговая корреляция занижена связками в экспертных баллах — у образцов `refusedProfile-noComment` эксперт ставит 0, оценщик 39–45), MAE 10,5; валидатор 9 passed (20/20 и 20/20) |

Не входило в тот прогон: PostgreSQL 14 и Docker. Миграция Alembic проверена на SQLite; PostgreSQL-часть T109 остаётся открытой. Повторный Windows-прогон 2026-09-29 на отдельной базе: студент 40/40, преподаватель 96/96, администратор 141/141, EXIT=0. Офлайн-проверка и её оставшееся ограничение описаны в `docs/offline-check.md`.

## Замер производительности T113 (2026-09-29)

`cd backend && uv run python scripts/perf_smoke.py` создаёт отдельную SQLite-базу с 20 обучаемыми и пятью готовыми оценками для каждого, прогревает ML вне измерения, выполняет запросы через `httpx.ASGITransport` и удаляет базу. Это замер приложения на локальном SQLite без сетевых накладных расходов, не замер целевого PostgreSQL 14.

| Операция | Факт | Порог |
|---|---:|---:|
| Оценка одной попытки | 244 мс | ≤ 5 с |
| Отчёт 20 × 5 | 1717 мс | ≤ 30 с |
| Лента, 20 одновременных запросов к одному занятию, p95 | **92 мс** (последний прогон) | ≤ 200 мс |

Устранены повторные запросы оценок для каждой попытки; p95 ленты снизился с 5,84 с до 472–491 мс в ранних локальных прогонах. Диагностика показала, что сборка событий занимает около 2 мс, а задержка возникает при параллельных чтениях SQLite (последний p95 до изменения — 347 мс). Одновременные чтения метаданных и попыток одного занятия теперь объединяются; готовый результат не кешируется, поэтому следующий запрос видит новые данные. Три последовательных прогона дали p95 **85, 93 и 92 мс**. Полный набор тестов: 378 passed, включая проверку одновременных запросов и чтения после новой записи. Скрипт возвращает код 1 при нарушении любого порога. PostgreSQL 14 будет проверен отдельно в T109.

## Переменные окружения

См. `.env.example`. Ключевые: `DATABASE_URL`, `JWT_SECRET`, `SEED_DIR`, `MODELS_DIR`, `OLLAMA_URL`.
