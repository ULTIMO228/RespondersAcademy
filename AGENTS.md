# Responders Academy — инструкции для агентов

Учебный эмулятор АРМ-112 для подготовки операторов ДДС г. Москвы (хакатон «Лидеры цифровой трансформации», задача № 9, ГБУ «Система 112» / Департамент ГОЧСиПБ). Два контура в одном репозитории: Next.js-фронт со встроенным мок-API (работает автономно) и Python-бэкенд `backend/` (FastAPI + ML), который подменяет мок-слой без смены контрактов. Внешних сетей в рантайме нет.

## 1. Область действия и источники истины

Файл действует на весь репозиторий `/Users/seva/Projects/RespondersAcademy`. Более глубокие `AGENTS.md` (если появятся) уточняют правила только для своего поддерева. Инструкции пользователя и системы всегда приоритетнее.

Корневой `CLAUDE.md` — стандартная шапка + `@AGENTS.md` (зеркало-импорт); истина живёт в этом файле, править надо его, а не зеркало.

При расхождении описаний проекта доверять в порядке:

1. текущий код, конфигурация и тесты;
2. этот `AGENTS.md` и README модулей;
3. `spec/` (спецификации фич) и `docs/` (артефакты сдачи);
4. корневой `README.md`;
5. материалы `hack/` и `research/` — исходные референсы домена, в деталях могут быть неактуальны.

План и роадмап — не реализованная функциональность. При расхождении документации и кода — сообщить о дрейфе и следовать коду.

## 2. Продукт и незыблемые инварианты

Тестовая система с тестовым фронтом: прототип тренажёра диспетчеров ДДС, работающих с карточками происшествий в АРМ-112. Назначение — показать экспертам полный учебный контур «настройка занятия преподавателем → отработка карточек обучающимся → отчёт». Фронт по умолчанию работает на своём мок-слое; реальный бэкенд подключается переменной `BACKEND_URL` (§3).

Не нарушать без явного архитектурного решения:

- **локальный изолированный контур**: никаких внешних API, CDN, шрифтов, аналитики и сетевых вызовов; все ассеты локальные (ТЗ §3, Q&A в11);
- **только синтетические обезличенные данные** (`spec/000-фронт/mocks/`); реальных персональных данных и выгрузок из боевой системы-112 здесь нет и быть не должно;
- **система — не рабочая система-112**: не обрабатывает реальные вызовы, не содержит функционал основной системы-112, не выполняет функции реального диспетчерского центра (ТЗ §4);
- **аутентичность АРМ-112 1:1**: структура экранов, поля, термины и статусная семантика — как в боевом ПОВ-112; тренажёрные добавления незаметны (§9);
- **язык интерфейса, ответов и коммитов — русский**;
- **ИИ честно помечается**: имитация через мок-шлюз, бейдж «ИИ» в UI, приоритет итоговой оценки — за преподавателем (Q&A в3);
- **нормативы**: реакция на новую карточку — 30 сек, полная отработка — 3 мин; полный жизненный цикл статусов реагирования обязателен (Q&A в6);
- обратная совместимость контрактов `src/shared/api/types/*` и `spec/000-фронт/05-data-models.md` ломается только осознанно: бэкенд (`backend/app/api/compat`, схемы `backend/app/schemas` в camelCase) повторяет их 1:1, контрактные тесты бэкенда сверяются с TS-типами (§11).

## 3. Текущая реальность репозитория

Карта начальная — перед серьёзным изменением перепроверять файлы. Фронт замерен 2026-09-21, бэкенд и спеки — 2026-09-28.

### Фронт

- **Стек**: Next.js (App Router) + React + TypeScript strict. В `package.json` версии `next`/`react` указаны как `latest` — фактическую смотреть в `node_modules/next/package.json`. Это НЕ тот Next.js, который «все знают»: перед кодом читать релевантный гайд в `node_modules/next/dist/docs/` (см. автоблок в конце файла).
- **Архитектура**: Feature-Sliced Design в `src/`; корневой `app/` — только тонкие роуты-обёртки (реэкспорт слайсов `src/pages/*`) и Route Handlers мок-API `app/api/mock/*` (15 групп: admin, attempts, auth, calls, cards, classifier, grammar-check, materials, profile-mapping, reference, reports, scenarios, sessions, training-cards, users, плюс `_server`). Корневой `pages/` — пустая заглушка, чтобы Next.js не принял `src/pages` за Pages Router.
- **Сессия и гварды**: `proxy.ts` в корне — middleware cookie-сессии `arm112_session` и ролевых гвардов; чужая роль → `/forbidden`, неавторизованный → `/login`.
- **Данные**: спек-моки `spec/000-фронт/mocks/` → `npm run mocks:sync` копирует их в `mocks/` (закоммиченная рабочая копия) и `icons/` → `public/icons/` (игнорируется гитом). `mocks/local/` (адресный справочник) и `mocks/admin/` (аудит, состояние «Системы») — app-уровень, синк не затирает. Код импортирует JSON только через алиас `@mocks/*` и `src/shared/api/{mocks.ts,mock/readers.ts}`; к `spec/` код не обращается никогда. Мутации — in-memory store процесса (`src/shared/api/mock/store.ts`): перезапуск сервера сбрасывает состояние (повторные e2e-прогоны — только на свежем сервере).
- **ИИ-имитация**: мок-шлюз `src/shared/api/ai-gateway.ts` (+ `ai-gateway.mock.ts`) с фиксированным контрактом `AiResponse` и пометкой «ИИ-модуль: заменить на реальный сервис»; разбор грамматики — `src/shared/lib/grammar-check`.
- **Слои `src/`**: `app` (лэйауты, прокси сессии, стили); `pages` (18 слайдов: login, journal, incident, phone, progress, help, forbidden, teacher-dashboard, teacher-monitor, teacher-scenarios, teacher-scenario-editor, teacher-session, teacher-reports, teacher-report-session, admin-users, admin-system, dev-map, dev-ui); `widgets` (incident-list, incident-card, service-panel, monitor-grid, report-charts, app-nav); `features` (auth-form, call-control, incident-type-picker, report-export, scenario-builder, session-control, session-wizard, statement-form, status-form); `entities` (incident, service, user, session, report, system); `shared` (api, config, lib, ui). Карта слайсов — `spec/000-фронт/10-code-rules.md` §3.
- **Роуты**: `/login`; обучающийся — `/arm`, `/arm/card/[cardId]`, `/arm/phone`, `/arm/progress`, `/arm/help`; преподаватель — `/teacher`, `/teacher/monitor/[studentId]`, `/teacher/scenarios`, `/teacher/scenarios/[id]`, `/teacher/session`, `/teacher/reports`, `/teacher/reports/[sessionId]`; администратор — `/admin/users`, `/admin/system`; служебные `/dev`, `/dev/ui`, `/forbidden`. Карта — `spec/000-фронт/03-architecture.md`.
- **Проверки**: `npm run check` = ESLint + Prettier + Steiger (FSD-гейт) + tsc + build; `npm run test` — Vitest + RTL (тесты рядом с кодом); `npm run mocks:validate` — Python-валидатор моков (входит в `prebuild`); e2e — Playwright (`e2e/demo-path.spec.ts`, `e2e/smoke.spec.ts`; порт 3140, workers=1, webServer сам собирает и поднимает прод-сборку) и HTTP-скрипты `scripts/e2e-{student,teacher,admin}.sh`.
- **ИИ-клиент фронта**: `src/shared/api/ai-client.ts` ходит на `/api/v1/ai/*` (база выводится из `NEXT_PUBLIC_MOCK_API_BASE_URL`). Route Handlers для `/api/v1/*` во фронте нет; при заданном `BACKEND_URL` rewrite в `next.config.ts` проксирует их в бэкенд.

### Бэкенд `backend/`

- **Стек**: Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2; зависимости — `uv` (`pyproject.toml`, `uv.lock`), линтер — `ruff`. БД для разработки — SQLite `backend/var/dev.db`, целевая — PostgreSQL (extra `pg`). Подробности по фазам — `backend/README.md`, переменные — `backend/.env.example`.
- **Подключение к фронту**: при заданном `BACKEND_URL` rewrite `beforeFiles` в `next.config.ts` перекрывает `app/api/mock/**` и шлёт `/api/mock/*` и `/api/v1/*` на бэкенд; cookie `arm112_session` остаётся same-origin. Rewrite запекается в `.next/routes-manifest.json` при `next build` — после смены переменной нужна пересборка. `BACKEND_URL` может быть задан в `.env.local`: проверять, на каком слое идёт работа.
- **API** (`app/main.py`): `app/api/compat` — копия контракта мок-API, монтируется под каждым префиксом `API_PREFIXES` (по умолчанию `/api/mock` и `/api/v1`); `app/api/v1/*` — новое: режим специалиста-112 (`tickets`, `operator112`), `assignments` (тренировки/экзамены), `validation`, `reports_export`, `ai_*` (фича 001). OpenAPI — `/api/docs`.
- **Слои**: `models/` (SQLAlchemy) → `services/` (логика: `session_engine`, `evaluation_service`, `assignment_service`, `report_builder`…) → `api/`; `schemas/` — Pydantic в camelCase 1:1 с `src/shared/api/types`.
- **ML** (`backend/ml/`): оценщики `assess` (`dds-*`, `operator112-*`, правила — `assess/rules.py`), классификатор групп ЕКП `classify`, генератор/валидатор сценариев `generate`, NLP/спеллчек `nlp`, TTS Silero `speech`, промпты `prompts`, пайплайн `pipeline`, скрипты метрик `scripts`. Модели и артефакты (`backend/models/`, `ekp_group_lr.joblib`) не в git — собираются `ml.scripts.prepare_models` (единственный шаг бэкенда с сетью) и `ml.scripts.train_classifier`. Без моделей/Ollama всё работает на детерминированных и лексических фолбэках с пометкой `available=false` / «аварийный режим».
- **ИИ-шлюз бэкенда**: `app/ai_gateway.py`, подмена реализации — `set_gateway()`. Граница с командой ИИ-агентов проходит по нему: заглушки (`call_reply`, `call_script`) остаются, бэкенд даёт детерминированный фолбэк. LLM — опционально через `OLLAMA_URL`/`OLLAMA_MODEL`.
- **Данные**: сид `python -m app.seed.load` грузит те же `spec/000-фронт/mocks`, `mocks/local`, `mocks/admin` (+ сиды в `app/seed/`). Схему создаёт сид через `create_all`, Alembic пока пуст — после изменения моделей `--reset`. Рантайм (БД, аудио, бэкапы, логи e2e, `metrics.json`) — `backend/var/`, вне git.
- **Тесты**: `backend/tests/{unit,contract,integration}`; контракт — по таблицам `specs/002-two-mode-simulator/contracts/{compat-endpoints,v1-endpoints}.md`, формы ответов — против `tests/contract/expected_fields.json`, извлечённого из TS-типов фронта.

### Спецификации и состояние работ

- **Фичи**: `spec/000-фронт/` — первая и завершённая фича (тестовый фронт целиком: 3 роли, все экраны, мок-API; волны 0–5, 283 задачи — `spec/000-фронт/12-tasks.md`; доказательства — `docs/FINAL-GATE.md`). `spec/001-ai/` — локальный ИИ-контур двух режимов, в работе (текущая фича speckit — `.specify/feature.json`). Новые фичи — новые папки `spec/NNN-имя/` (§8), реестр — `spec/README.md`.
- **`specs/`** (не путать со `spec/`) — speckit-пакеты бэкенда: `001-dispatcher-simulator`, `002-two-mode-simulator` (фазы бэкенда, точка останова — `STATUS.md`) и база знаний домена `specs/kb/`. Speckit-скиллы — `.claude/skills/speckit-*`, шаблоны и конституция — `.specify/`.
- **Точка останова сессии** — `.ai/SESSION_STATE.md` (формат densecode); читать перед продолжением фазы.
- **Документация сдачи** — `docs/`: COMPLIANCE (сверка с ТЗ), DELIVERY, FINAL-GATE, demo-script, demo-recording-plan, mock-api, offline-check, a11y-*, LIBRARIES. Скринкаст `docs/demo.mp4` не записан; честные ограничения перечислены в корневом `README.md` и не маскируются.
- **Исходники домена** (не код): `extracted.txt` (ТЗ), `hack/Фронт/` (памятка АРМ-112, Q&A, референс-скриншоты, норматив моков), `research/arm-112/` (разборы боевой системы: FIELDS, INTERFACE, MOSCOW-112, BRAND-AND-SOURCES), `icons/` (20 восстановленных SVG-иконок АРМ-112).

## 4. Старт задачи

Перед нетривиальной работой:

1. `git status --short` — сохранить все изменения пользователя (незакоммиченная работа здесь — норма).
2. Прочитать этот файл; для фичи/бага — спеку соответствующей папки `spec/NNN-*/` (бэкенд — `specs/002-*`), статус фронта — `docs/FINAL-GATE.md`, точку останова — `.ai/SESSION_STATE.md` и `STATUS.md` спеки.
3. Найти существующий аналог, тесты и реальную точку входа через Grep — не восстанавливать структуру по памяти.
4. Изменение больше двух файлов — короткий план (plan mode), актуализировать по ходу.
5. Новая фича начинается с пакета спек в `spec/NNN-имя/` (§8); код — после согласования спек.
6. Работа по фазам (бэкенд, ИИ): перед фазой — её задачи в `tasks.md`; открытые развилки согласовывать с владельцем, не закрывать допущениями; после фазы — `pytest` + `ruff`, отдельный коммит.

## 5. Рабочий процесс

- Выполнять запрос в согласованном объёме, включая проверки и обновление документации; дифф — минимальный и цельный, без посторонних зависимостей, абстракций и рефакторингов «заодно».
- После кодинга — самопроверка: логика, краевые случаи, изоляция ролей (RBAC), аутентичность UI, производительность, случайные изменения.
- Диагноз ≠ автоматическое исправление: если спрашивали причину — сначала объяснить её.
- Не объявлять о завершении без выполненной проверки или явного объяснения, что не удалось проверить и почему.

## 6. Команды проверки

```bash
npm ci                  # установка строго по lockfile (сеть нужна только для установки зависимостей)
npm run dev             # http://localhost:3000 (predev сам делает mocks:sync)
npm run check           # lint + format:check + steiger + typecheck + build
npm run test            # Vitest + React Testing Library
npm run mocks:sync      # spec/000-фронт/mocks → mocks/, icons → public/icons
npm run mocks:validate  # доменный валидатор моков (python3 ≥ 3.9)
npm run e2e             # Playwright: сам собирает build и поднимает сервер на порту 3140
```

Сквозные HTTP-прогоны (сценарии ТЗ §10 через реальные Route Handlers, cookie-сессия, проверка 403):

```bash
npm run build && npx next start -p 3130 &   # свежий сервер перед КАЖДЫМ прогоном — in-memory стор
scripts/e2e-student.sh && scripts/e2e-teacher.sh && scripts/e2e-admin.sh
```

Одиночные тесты фронта:

```bash
npx vitest run src/features/status-form   # файл или каталог
npx vitest run -t "название теста"
npx playwright test e2e/smoke.spec.ts
```

Бэкенд (из `backend/`):

```bash
uv sync --group dev                        # + --extra nlp (torch, sentence-transformers, ~500 МБ), --extra pg
uv run python -m ml.scripts.prepare_models # модели → backend/models (сеть); --only tts — Silero
uv run python -m ml.scripts.train_classifier
uv run python -m app.seed.load [--reset]   # схема + сиды; --reset после изменения моделей
uv run uvicorn app.main:app --port 8000    # http://localhost:8000/api/docs
uv run pytest -q                           # одиночный: uv run pytest tests/unit/test_validator.py -k имя
uv run ruff check .
```

Фронт через бэкенд — `BACKEND_URL=http://localhost:8000 npm run dev`. Гейт «фронт на реальном бэкенде» (бэкенд на `:8130` с чистой `var/e2e.db`, `next start -p 3130`, три sh-скрипта, логи — `backend/var/e2e-logs/`):

```bash
backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]
```

Переменные окружения фронта в слайсах — только `NEXT_PUBLIC_*` и только через `src/shared/config/env.ts` (прямой `process.env` в слайсах запрещён): `NEXT_PUBLIC_DEMO_MODE=false` скрывает демо-подсказки на логине, `NEXT_PUBLIC_MOCK_API_BASE_URL` задаёт базу API. `BACKEND_URL` читается только в `next.config.ts`. E2E-настройки: `E2E_PORT`, `E2E_BASE_URL`, `E2E_REUSE_SERVER`; базовый адрес sh-скриптов — `BASE_URL`, код 2FA — `E2E_2FA` (по умолчанию `123456`). Бэкенд: `DATABASE_URL`, `JWT_SECRET`, `SEED_DIR`, `MODELS_DIR`, `OLLAMA_*`, `ML_WARMUP` (фоновый прогрев ML ~25 с; в тестах `0`), `TTS_ENABLED`, `TWO_FACTOR_STUB`, `API_PREFIXES`.

## 7. Правила фронтенда

Норматив — `hack/Фронт/ПРАВИЛА-КОДА-ФРОНТ.md` (принят без оговорок: нарушение = код не принимается в ревью) + адаптации `spec/000-фронт/10-code-rules.md`. Кратко:

- Два «app» не смешиваются: `src/app/` — FSD-слой (провайдеры, лэйауты, стили), корневой `app/` — только роуты-обёртки без логики и вёрстки.
- Импорты между слоями — только вниз (app → pages → widgets → features → entities → shared); public API слайса — `index.ts`, без `export *`; слой `processes` не использовать.
- Стили — только CSS-модули; цвета и размеры — только токены `src/shared/ui/styles/vars.css`; хардкод hex в компонентах запрещён.
- Моки подключаются только через `shared/api`; компоненты и хуки не знают про `fetch`, URL и файлы моков. Зависимости (localStorage, audio, сеть) — за интерфейсами `shared/lib`, в тестах подменяются.
- Каждый асинхронный экран имеет состояния loading / empty / error / success; ошибки не прячутся.
- Steiger (`npm run steiger`) — обязательный FSD-гейт, его ошибки = ошибка сборки.
- Desktop-first 1920px+ (рабочее место оператора — 2–3 монитора); мобильная адаптация — этап 2, молча не закладывать.
- Новые зависимости — только по необходимости; перечень и лицензии — `docs/LIBRARIES.md`.

## 8. Спецификации и нумерация фич

- Каждая фича — папка `spec/NNN-короткое-имя/`; номер сквозной, по порядку постановки; реестр — `spec/README.md`.
- `spec/000-фронт/` — завершённая фича, её пакет — образец состава: обзор → карта требований → роли → архитектура → страницы (`04-pages/`) → модели данных → потоки → дизайн-правила → решения Q&A → глоссарий → правила кода → план → задачи → моки.
- Новая фича начинается с пакета спек (как минимум: обзор, роли/права, архитектура/роуты, модели данных, потоки, критерии приёмки), а не с кода. Трассировка требований обязательна (образец — `000-фронт/01-requirements-map.md`).
- Завершённая фича помечается статусом в реестре и не переписывается задним числом; изменения к ней оформляются новой фичей или явной поправкой с отметкой.

## 9. Дизайн и аутентичность АРМ-112

HARD-правило (`spec/000-фронт/07-design-guidelines.md`), нарушение = брак:

- Точная реплика ПОВ-112 1:1 («тютелька в тютельку») по референс-скриншотам (`hack/Фронт/images/`, `hack/Фронт/Источники/скриншоты_из_docx/`, `research/arm-112/screenshots/`): компоновка, поля, термины и статусная семантика не меняются.
- Новые тренажёрные элементы (таймеры занятия, бейдж «ИИ», прогресс) — только в тех же палитре, токенах и формах контролов; изменение должно быть незаметным, переход обучающегося на боевую систему — безвизуальным.
- Дизайны «из карты проекта» и собственные фантазии — не истина; истина — референсы и `07-design-guidelines.md`.
- Смена дизайна правится в одном месте — `vars.css`, не в компонентах.

## 10. Моки, ИИ-имитация и данные

- Источник моков — `spec/000-фронт/mocks/`; правки данных делаются там, затем `npm run mocks:sync && npm run mocks:validate`. `mocks/` руками не править (перезатрётся синком), кроме app-уровня `mocks/local/` и `mocks/admin/`.
- Валидатор проверяет форматы id, перекрёстные ссылки и доменные правила (норматив — `hack/Фронт/МОКИ-ДАННЫЕ.md`); красный валидатор блокирует build (`prebuild`).
- Мок-слой фронта: все «ИИ»-ответы — из моков через `AiGateway`; реальных моделей нет. Новый «ИИ»-ответ = данные в моках + тот же контракт `AiResponse` + бейдж «ИИ» в UI.
- Бэкенд: локальные модели (rubert-tiny2, классификатор ЕКП, Silero TTS, опционально Ollama) за `backend/app/ai_gateway.py`; контракт `AiResponse` и бейдж «ИИ» те же. GPU и внешние API не требуются.
- Бэкенд сидится из тех же моков: после правки спек-моков — `app.seed.load --reset`, иначе данные фронта и бэкенда разойдутся.
- Софтфон — UI-эмуляция контура B→C (без SIP/WebRTC и аудио, только транскрипты); точка A (заявитель → 112) не моделируется (Q&A в8).

## 11. Тесты и критерии завершения

- Тесты рядом с кодом (`*.test.ts(x)`); для новой логики — happy path + осмысленный краевой случай + ошибочный/неавторизованный сценарий; на багфикс — регрессионный тест.
- Перед отчётом о завершении: прогнать затронутый объём (`npm run check`, при необходимости `npm run test` / `npm run e2e` / sh-скрипты), посмотреть финальный дифф, убедиться что в изменении нет `.env`, кешей, логов и генерируемых артефактов (`.next/`, `public/icons/`, playwright-отчётов).
- `mocks/` — закоммиченная копия: после правок спек-моков обязателен синк, чтобы копия не расходилась с источником.
- Бэкенд: тесты — в `backend/tests/`, перед завершением `uv run pytest -q` и `uv run ruff check .`. После правки TS-типов `src/shared/api/types/*` — `cd backend && uv run python scripts/extract_ts_fields.py` (обновляет `tests/contract/expected_fields.json`), иначе падает `test_expected_fields_are_fresh`. Не коммитить `backend/var/`, `backend/models/`, `__pycache__`.
- Если проверку запустить нельзя (нет зависимостей, Python, браузеров Playwright) — назвать точную команду и причину, не маскировать ограничение.
- Завершено = запрос решён в объёме, проверки зелёные или ограничения названы, финальный дифф просмотрен. В финальном ответе: результат, изменённые файлы, проверки, существенные риски.

## 12. Git и артефакты

- Сохранять чужие изменения: `git status` до правок, `git diff` после.
- Без `git add .`, `git reset --hard` и других разрушительных команд без явного подтверждения; стейджить только конкретные файлы.
- Коммиты и пуши — только по прямой просьбе; Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), сообщения по-русски.
- Никогда не добавлять `Co-Authored-By`, подписи агента и упоминания инструментов в коммиты, ветки, теги и PR.
- Не коммитить `.env`, `node_modules`, `.next`, логи, playwright-отчёты и test-results.

## 13. Эпистемическая честность

- Неизвестность — нормальный ответ: «Не знаю — не проверял» лучше уверенной догадки, потому что пользователь действует по ответу. Предположения помечать как предположения.
- Утверждение о поведении кода — только после чтения кода, со ссылкой `файл:строка`; то, на что нельзя указать, — гипотеза.
- Не сообщать о незапущенных проверках как о пройденных; не запускал — так и сказать, с командой и причиной.
- Не выдумывать идентификаторы: версии (`next`/`react` здесь `latest` — проверять установленное), имена API, ключи конфигов, пути. Не уверен — проверить по `package.json`/`node_modules` или честно сказать «не знаю».
- «Не уверен» не переформулировать в «возможно/скорее всего» с тем же утверждением: либо проверил, либо не утверждаю.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
