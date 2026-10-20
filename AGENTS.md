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

- **локальный изолированный контур**: никаких внешних API, CDN, шрифтов, аналитики и сетевых вызовов; все ассеты локальные (ТЗ §3, Q&A в11). Единственное согласованное исключение (фича 004, решение владельца 2026-10-19): опциональный провайдер Polza.ai, **по умолчанию выключен** (`AI_PROVIDER=local`), включается только переменными окружения и отдаёт наружу лишь генерацию сценариев, пояснение карты ошибок голос ИИ-заявителя (фича 005-live-caller: речь оператора и реплики по синтетическому билету, без имён реальных людей; выключен по умолчанию `LIVE_CALLS_ENABLED=false`), ИИ-тексты отчётов и ответы чата разбора попытки (фича 010-ai-chat-assistant, решение владельца 2026-10-20: чат следует модели, выбранной администратором; в запрос уходят только обезличенные агрегаты и вопрос обучающегося, выключатель `CHAT_CLOUD_ENABLED=false`); без ключа сеть не используется. Условие организаторов (модератор кейса, 17–19.10.2026): через API — только модели с открытыми весами, которые заказчик сможет развернуть у себя на сервере из ТЗ; модели и адрес — только в настройках, без значений по умолчанию в коде;
- **только синтетические обезличенные данные** (`spec/000-фронт/mocks/`); реальных персональных данных и выгрузок из боевой системы-112 здесь нет и быть не должно;
- **система — не рабочая система-112**: не обрабатывает реальные вызовы, не содержит функционал основной системы-112, не выполняет функции реального диспетчерского центра (ТЗ §4);
- **аутентичность АРМ-112 1:1**: структура экранов, поля, термины и статусная семантика — как в боевом ПОВ-112; тренажёрные добавления незаметны (§9);
- **язык интерфейса, ответов и коммитов — русский**;
- **ИИ честно помечается**: имитация через мок-шлюз, бейдж «ИИ» в UI, приоритет итоговой оценки — за преподавателем (Q&A в3);
- **нормативы**: реакция на новую карточку — 30 сек, полная отработка — 3 мин; полный жизненный цикл статусов реагирования обязателен (Q&A в6);
- обратная совместимость контрактов `src/shared/api/types/*` и `spec/000-фронт/05-data-models.md` ломается только осознанно: бэкенд (`backend/app/api/compat`, схемы `backend/app/schemas` в camelCase) повторяет их 1:1, контрактные тесты бэкенда сверяются с TS-типами (§11).

## 3. Текущая реальность репозитория

Карта начальная — перед серьёзным изменением перепроверять файлы. Фронт и бэкенд замерены 2026-09-29 (фича 002); состав после слияния веток (фича 021) сверен с кодом веток 2026-10-20. Числа тестов здесь не хранятся — актуальные в `.ai/SESSION_STATE.md`.

### Фронт

- **Стек**: Next.js (App Router) + React + TypeScript strict. В `package.json` версии `next`/`react` указаны как `latest` — фактическую смотреть в `node_modules/next/package.json`. Это НЕ тот Next.js, который «все знают»: перед кодом читать релевантный гайд в `node_modules/next/dist/docs/` (см. автоблок в конце файла).
- **Архитектура**: Feature-Sliced Design в `src/`; корневой `app/` — только тонкие роуты-обёртки (реэкспорт слайсов `src/pages/*`) и Route Handlers мок-API `app/api/mock/*` (15 групп: admin, attempts, auth, calls, cards, classifier, grammar-check, materials, profile-mapping, reference, reports, scenarios, sessions, training-cards, users, плюс `_server`) и `app/api/v1/{ai,_server}` (локальные мок-ответы ИИ-панелей в автономном режиме). Корневой `pages/` — пустая заглушка, чтобы Next.js не принял `src/pages` за Pages Router.
- **Сессия и гварды**: cookie `arm112_session` — подписанный токен (JWT HS256), его выдаёт и проверяет **сервер** (бэкенд либо мок-слой), выставляя `HttpOnly; SameSite=Lax; Path=/` (+`Secure` за https); в JS токен, роль и `document.cookie` не используются, клиент сессию не хранит. `proxy.ts` в корне — только оптимистичный гвард (наличие cookie, `exp`, роль из полезной нагрузки **без проверки подписи**; matcher `/arm`, `/student`, `/teacher`, `/admin`, `/reference`, `/account`); основная проверка — `verifySession()` в серверных лэйаутах (`src/entities/user/index.server.ts`, запрос `GET /auth/session` на собственный origin с пробросом cookie без чтения `BACKEND_URL`). Чужая роль → `/forbidden`, нет сессии → `/login?returnUrl=…`, потеря сессии на клиенте (401) → `/login?reason=expired`. Вход — логин и пароль, без 2FA и без номера АРМ (решение A14).
- **Специализация обучающегося** (фича 019, решение В1 слияния 021): единственный источник — `users.specializations` (список: `operator112`, `dds`; у пользователя могут быть обе). Прежнее `training_profile` (фича 018) убрано либо производное от списка; задания, мастер назначения, админка и экраны фильтруются по списку.
- **Данные**: спек-моки `spec/000-фронт/mocks/` → `npm run mocks:sync` копирует их в `mocks/` и `icons/` → `public/icons/`. **`mocks/*` и `public/icons/` игнорируются гитом** (`.gitignore:16`, `/mocks/*`); в git лежат только `mocks/local/` (адресный справочник) и `mocks/admin/` (аудит, состояние «Системы») — app-уровень, синк их не затирает. Рабочая копия `mocks/` создаётся синком на каждой машине (`predev`, `prebuild`; перед `npm run test` и `tsc` запускать `npm run mocks:sync` вручную); перед `tsc` без синка будет TS2307 на `@mocks/*`. Код импортирует JSON только через алиас `@mocks/*` и `src/shared/api/{mocks.ts,mock/readers.ts}`; к `spec/` код не обращается никогда. Мутации — in-memory store процесса (`src/shared/api/mock/store.ts`): перезапуск сервера сбрасывает состояние (повторные e2e-прогоны — только на свежем сервере).
- **ИИ-имитация**: мок-шлюз `src/shared/api/ai-gateway.ts` (+ `ai-gateway.mock.ts`) с фиксированным контрактом `AiResponse` и пометкой «ИИ-модуль: заменить на реальный сервис»; разбор грамматики — `src/shared/lib/grammar-check`.
- **Слои `src/`** (объединение всех слитых веток; Steiger допускает не более 20 негруппированных слайсов в слое `pages` — страницы кабинетов сгруппированы):
  - `app` (лэйауты, прокси сессии, стили);
  - `pages`: login, journal, incident, phone, operator112, forbidden, reference, account (включая экран ИИ-настроек `/account/ai`, фича 006), группа `student/{home,assignments,results,analytics,scenarios}`, группа `teacher/{assignments,students,groups,error-map,rating,performance,constructor}`, группа `admin/{home,audit,security}`, teacher-dashboard, teacher-monitor, teacher-scenarios, teacher-scenario-editor, teacher-session, teacher-reports, teacher-report-session, admin-users, admin-system, dev-map, dev-ui. `rating` — фича 017, `performance` — фича 005-performance-report (общий экран для `/teacher/performance` и `/admin/performance`), `constructor` — фича 013, `student/scenarios` — фича 015;
  - `widgets`: incident-list, incident-card, service-panel, monitor-grid, report-charts, platform-nav, app-nav, simulator-bar (один слот для норм и «Справочника»), recommendation-list, attempt-review, attempt-chat (ИИ-чат разбора, фича 020), ai-health-banner (уведомления о проблемах LLM, фича 006), error-map, my-focus, work-message-feed, operator112-journal, operator112-card (окно специалиста-112 по фиче 009), scenario-graph-editor (фича 015). **Удалены слиянием** (реализация SASHA заменила их): `operator112-softphone` и `features/operator112-questionnaire`, страница `Operator112Workspace`;
  - `features`: auth-form, password-change, assignment-create, error-map-assign, группа `operator112/{address,incoming,type-tabs,services}`, card-links, problem-report (фича 009), arm-reference (справочник-панель, фича 016), report-recorder, call-control, incident-type-picker, report-export, scenario-builder, группа `flow/{canvas,inspector,library,preview}` (конструктор, фича 013), session-control, session-wizard, statement-form, status-form;
  - `entities`: incident, service, user, session, report, system, assignment, error-map, operator112-attempt, scenario-flow (фича 013);
  - `shared` (api, config, lib, ui). Карта слайсов — `spec/000-фронт/10-code-rules.md` §3.
- **Роуты**: две зоны. Платформа-обложка (`src/shared/ui/platform`, токены `--pf-*`, навигация `PLATFORM_NAV`): `/login`; обучающийся — `/student`, `/student/assignments`, `/student/results[/attemptId]`, `/student/analytics`, `/student/scenarios[/scenarioId/version]` (прохождение графовых сценариев, фича 015); общие `/reference`, `/account`, `/account/security`, `/account/ai` (выбор модели и ключа, фича 006); преподаватель — `/teacher` (главная), `/teacher/assignments[/new|/[id]]`, `/teacher/students[/[studentId]]`, `/teacher/groups/[groupId]`, `/teacher/monitor/[studentId]`, `/teacher/scenarios[/id]` (внутри — вкладка «Граф», фича 015), `/teacher/constructor` (прототип визуального конструктора без сервера, фича 013, рабочее место во весь экран), `/teacher/session`, `/teacher/reports[/sessionId]`, `/teacher/rating` (рейтинг и профиль ученика, фича 017), `/teacher/performance` (сводная успеваемость своих групп, фича 005-performance-report), карта ошибок (фича 003) — `/teacher/error-map[/groupId]`, `/teacher/error-map/[groupId]/{journal,present}`, `/teacher/error-map/students/[studentId]`; администратор — `/admin` (главная), `/admin/performance` (все группы), `/admin/audit`, `/admin/security`, `/admin/users`, `/admin/system`; служебные `/dev`, `/dev/ui`, `/forbidden`. Симулятор (реплика АРМ-112, §9, навигация `NAV_ITEMS`): `/arm` (группа `(journal)`), `/arm/card/[cardId]` (группа `(card)`), `/arm/phone`, окно специалиста-112 `/arm/operator112` (группа `app/arm/(operator112)`, лэйаут `ArmOperator112Layout` без AppNav, фича 009; прежняя группа `(section)` для этого роута удалена), отдельное окно справочника для второго монитора `/arm/reference-window` (фича 016); прежние `/arm/progress` и `/arm/help` — редиректы на `/student/analytics` и `/reference`. Карта — `spec/002-full-system-integration/03-architecture.md`.
- **Проверки**: `npm run check` = ESLint + Prettier + Steiger (FSD-гейт) + tsc + build; `npm run test` — Vitest + RTL (тесты рядом с кодом); `npm run mocks:validate` — Python-валидатор моков (входит в `prebuild`); e2e — Playwright (`e2e/demo-path.spec.ts`, `e2e/smoke.spec.ts`, `e2e/platform.spec.ts`, `e2e/auth-security.spec.ts`, `e2e/simulator-visual.spec.ts`, плюс специфичные для влитых фич `e2e/constructor.spec.ts` (013) и `e2e/scenario-graph.spec.ts` (015); порт 3140/3130, workers=1, webServer сам собирает и поднимает прод-сборку) и HTTP-скрипты `scripts/e2e-{student,teacher,admin,error-map}.sh` (+ `e2e-ai.sh` фичи 006/020). Сквозной `e2e/two-mode-full-path.spec.ts` и фикстура цепочки A → B (`backend/scripts/seed_chain_demo.py`) удалены сплющенным коммитом `98705b7` (фича 018): цепочка 112 → ДДС заменена лентой карточек ДДС (фича 011) — не восстанавливать без решения владельца.
- **ИИ-клиент фронта и проксирование v1**: `src/shared/api/ai-client.ts` ходит на `/api/v1/ai/*`. Rewrite `beforeFiles` в `next.config.ts` проксирует `/api/v1/:path*` на бэкенд (T004); в автономном режиме фронта без бэкенда Route Handlers `app/api/v1/ai/**` отдают локальные мок-ответы для ИИ-панелей (T006), а пути v1 вне `ai/*` переводят клиент в состояние «требуется сервер» (T007). Демо-стенд одной командой поднимается через `./scripts/demo-up.sh` (T060; `--live` — звонок в гарнитуре, фича 014).

### Бэкенд `backend/`

- **Стек**: Python 3.11+, FastAPI, SQLAlchemy 2 async, Pydantic v2; зависимости — `uv` (`pyproject.toml`, `uv.lock`; extras `pg`, `nlp`, а из влитых веток также `stt-local` и `speechkit` для живого заявителя), линтер — `ruff`. БД для разработки — SQLite `backend/var/dev.db` (демо: `backend/var/demo.db`), целевая — PostgreSQL (extra `pg`). Подробности по фазам — `backend/README.md`, переменные — `backend/.env.example`.
- **Подключение к фронту**: при заданном `BACKEND_URL` rewrite `beforeFiles` в `next.config.ts` перекрывает `app/api/mock/**` и `app/api/v1/**`, направляя вызовы на бэкенд; cookie `arm112_session` остаётся same-origin. Rewrite запекается в `.next/routes-manifest.json` при `next build` — после смены переменной нужна пересборка. `BACKEND_URL` может быть задан в `.env.local`: проверять, на каком слое идёт работа.
- **Сводная успеваемость (фича 005-performance-report)**: `GET /api/v1/performance/{report,export.xlsx,export.pdf}` (`app/api/v1/performance.py`, `app/services/performance_service.py`, `performance_export.py`), экран `PerformanceScreen` в `src/pages/teacher/performance` на роутах `/teacher/performance` (свои группы) и `/admin/performance` (все; руководство = admin). Нормативы по умолчанию 30 с / 3 мин, минимум попыток 3/5, риск < 60 — константы сервиса. Список обучающихся преподавателя для разграничения — `app/api/v1/teacher_students.py`.
- **Выгрузки**: отчёт занятия — `GET /reports/{id}/export.{csv,pdf,xlsx}` (`report_export.py`), карта ошибок — `GET /error-map/export.{pdf,xlsx}` (`error_map_pdf.py`); Excel собирает общий модуль `app/services/xlsx_export.py` (`openpyxl`, текст никогда не формула). Новая выгрузка = новый `Sheet`, а не отдельный писатель.
- **Карта ошибок (фича 003)**: `app/api/v1/error_map.py` (`/error-map/*`, `/me/focus`), сервисы `app/services/error_map_*.py`, пороги — раздел `errorMap` настроек «Системы»; пояснение «Почему так происходит» — `AiGateway.explain_stage` (необязательный, иначе шаблон), вердикты преподавателя — `error_map_verdicts`; демо-набор — `backend/scripts/seed_error_map_demo.py`; HTTP-сценарий — `scripts/e2e-error-map.sh` (`run_frontend_e2e.sh --only error-map`).
- **Выбор модели и ИИ-чат (фичи 006-llm-provider-switch, 020)**: `app/api/v1/ai_settings.py` (источник local/cloud, ключ Polza.ai зашифрованным текстом в `ai_settings`, источник по умолчанию `local`), `app/api/v1/ai_chat.py` (`POST /ai/chat`, шторка в `widgets/attempt-chat`), источники ИИ в отчётах — миграция `0008_report_ai_sources`; проба соединения с таймаутом и квота — `0009_ai_probe_quota`, `0010_ai_request_started_at` (БД-соединение освобождается на время вызова модели). Облако для чата включается только выбором администратора и сохранением ключа.
- **Живой заявитель (фича 014)**: `app/api/v1/live_calls.py`, `realtime_calls.py`, сервисы `app/services/{live_call_service,live_caller_api,live_caller_provider,realtime_*}.py`, STT/TTS — `backend/ml/speech` (Silero, GigaAM), транспорт `LIVE_CALL_REALTIME_TRANSPORT` (по умолчанию `polza`), прототипы `speechkit` и `omni` вне условий ТЗ. Выключено по умолчанию: `LIVE_CALLS_ENABLED=False`, ключи `SPEECHKIT_API_KEY`/`POLZA_*` пусты; веса GigaAM скачиваются только при явном включении (`journal T006`, фича 021).
- **Граф-конструктор сценариев (фича 015)**: `app/api/v1/ai_scenarios.py`, `ai_scenario_runs.py`, `scenario_permissions.py` (права эксперта на пользователе), формат `scenario-graph/1` (контракт — `spec/001-ai/contracts/ai-workflow-v1.md`), движок `app/scenario_runtime`, workflow `app/services/scenario_workflow.py`, прохождения `scenario_runs.py`. Визуальный конструктор фичи 013 (`flow/1`) — отдельный прототип на `/teacher/constructor` без сервера; его перенос на сервер (фазы Ф1–Ф6) не начат, решение об объединении двух конструкторов — за владельцем.
- **Специалист-112, лента ДДС, жалобы (фичи 009, 011, 012, 016, 017, 018)**: `app/api/v1/{tickets,operator112,problem_reports,student_cards,student_rating}.py` — журнал `GET /operator112/journal?assignmentId=`, совпадения `GET /operator112/attempts/{id}/matches`, `POST /problem-reports`, `/teacher/problem-reports/*`, банк карточек обучающихся-112 для заданий ДДС (`student_cards`), рейтинг для преподавателя (`student_rating`).
- **API** (`app/main.py`): `app/api/compat` — копия контракта мок-API, монтируется под каждым префиксом `API_PREFIXES` (по умолчанию `/api/mock` и `/api/v1`); `app/api/v1/*` (полный список модулей): `ai_access`, `ai_assessments`, `ai_chat`, `ai_errors`, `ai_provider`, `ai_scenario_runs`, `ai_scenarios`, `ai_settings`, `assignments` (тренировки/экзамены), `error_map`, `live_calls`, `lobby`, `operator112`, `performance`, `problem_reports`, `realtime_calls`, `recommendations`, `reports_export`, `scenario_permissions`, `student_cards`, `student_rating`, `teacher_students`, `tickets`, `validation`, `work_messages`. OpenAPI — `/api/docs`.
- **Слои**: `models/` (SQLAlchemy) → `services/` (логика: `session_engine`, `evaluation_service`, `assignment_service`, `report_builder`…) → `api/`; `schemas/` — Pydantic в camelCase 1:1 с `src/shared/api/types`.
- **ML** (`backend/ml/`): оценщики `assess` (`dds-*`, `operator112-*`, правила — `assess/rules.py`), классификатор групп ЕКП `classify`, генератор/валидатор сценариев `generate`, NLP/спеллчек `nlp`, речь `speech` (TTS Silero, STT), промпты `prompts`, пайплайн `pipeline`, скрипты метрик `scripts`. Модели и артефакты (`backend/models/`, `ekp_group_lr.joblib`) не в git — собираются `ml.scripts.prepare_models` (единственный шаг бэкенда с сетью) и `ml.scripts.train_classifier`. Без моделей всё работает на детерминированных и лексических фолбэках с пометкой `available=false` / «аварийный режим». Справочные материалы для поиска в справочнике — `backend/data/kb`.
- **ИИ-шлюз бэкенда**: `app/ai_gateway.py`, подмена реализации — `set_gateway()`. Граница с командой ИИ-агентов проходит по нему: заглушки (`call_reply`, `call_script`) остаются, бэкенд даёт детерминированный фолбэк. LLM — через `LLAMA_URL` (дообученная Qwen3.5-0.8B) либо опционально `OLLAMA_URL`/`OLLAMA_MODEL`; внешний провайдер Polza.ai (фичи 004, 006, 014, 020) — только опция, выключен по умолчанию (§2).
- **Данные**: сид `python -m app.seed.load` грузит те же `spec/000-фронт/mocks`, `mocks/local`, `mocks/admin` (+ сиды в `app/seed/`). Схема БД синхронизирована с Alembic, одна голова. Файлы `backend/alembic/versions`:
  - общий ствол: `0001_initial`, `0002_ai_auth_ai_and_auth_schema`, `0003_widen_classifier_signs`, `0004_ai_immutability_guards`, `0005_error_map_verdicts`;
  - линия SASHA (фичи 009, 016–018): `0006_user_training_profile`, `0007_problem_reports`;
  - линия seva (фичи 005-performance-report, 006, 019, 020): `0006_ai_settings`, `0007_user_specializations`, `0008_report_ai_sources`, `0009_ai_probe_quota`, `0010_ai_request_started_at`;
  - линия графа (фича 015): `0006_scenario_builder`, `0007_scenario_run_revision`, `0008_scenario_run_active_unique`, `0009_scenario_run_result`;
  - merge-ревизии слияния 021: `0011_merge_sasha_seva` (сводит головы SASHA и seva; затем `0012_specializations_from_training_profile` (rev `0012_specs_from_training_profile`) переносит `training_profile` → `specializations` и удаляет колонку), `0013_merge_scenario_graph` (сводит граф-ветку). Номера файлов в разных линиях совпадают намеренно — ревизии не перешивались; порядок определяют `down_revision`, а не номера;
  - защитные триггеры неизменяемости утверждённых версий и ревизий (T002); 49 таблиц по `Base.metadata` (2026-10-20); после изменения моделей `--reset`. Рантайм (БД, аудио, бэкапы, логи e2e, `metrics.json`) — `backend/var/`, вне git.
- **Тесты**: `backend/tests/{unit,contract,integration}`; контракт — по таблицам `specs/002-two-mode-simulator/contracts/{compat-endpoints,v1-endpoints}.md`, формы ответов — против `tests/contract/expected_fields.json`, извлечённого из TS-типов фронта скриптом `scripts/extract_ts_fields.py`. Числа и известные красные — `.ai/SESSION_STATE.md`, `docs/FINAL-GATE.md`.

### Спецификации и состояние работ

- **Фичи**: `spec/000-фронт/` — первая и завершённая фича (тестовый фронт целиком: 3 роли, все экраны, мок-API; волны 0–5, 283 задачи — `spec/000-фронт/12-tasks.md`; доказательства — `docs/FINAL-GATE.md`). Фичи 001–021 и их статусы — `spec/README.md`. После слияния веток (021) номера уникальны: 005-visual-scenario-builder→013, 005-live-caller→014, 005-scenario-graph-builder→015, 005-arm-reference-panel→016, 006-student-rating→017, 008-operator112-student→018, 007-learner-role-split→019, 010-ai-chat-assistant→020; остальные сохранили номера (005-performance-report, 006-llm-provider-switch, 007-arm-one-to-one, 008-full-cycle-review, 009-arm-112-student, 010-lesson-call-session, 011-dds-card-feed, 012-dds-memo-alignment). Новые фичи — новые папки `spec/NNN-имя/` со следующим свободным номером (§8). Текущая фича speckit — `.specify/feature.json`.
- **`specs/`** (не путать со `spec/`) — speckit-пакеты бэкенда: `001-dispatcher-simulator`, `002-two-mode-simulator` (фазы бэкенда, точка останова — `STATUS.md`) и база знаний домена `specs/kb/`. Speckit-скиллы — `.claude/skills/speckit-*`, шаблоны и конституция — `.specify/`.
- **Точка останова сессии** — `.ai/SESSION_STATE.md` (формат densecode); читать перед продолжением фазы.
- **Документация сдачи** — `docs/`: COMPLIANCE (сверка с ТЗ), DELIVERY, FINAL-GATE (в том числе раздел о слиянии веток, фича 021), demo-script, demo-recording-plan, mock-api, offline-check, a11y-*, LIBRARIES. Скринкаст `docs/demo.mp4` не записан; честные ограничения перечислены в корневом `README.md` и не маскируются.
- **Исходники домена** (не код): `extracted.txt` (ТЗ), `hack/Фронт/` (памятка АРМ-112, Q&A, референс-скриншоты, норматив моков), `research/arm-112/` (разборы боевой системы: FIELDS, INTERFACE, MOSCOW-112, BRAND-AND-SOURCES), `icons/` (20 восстановленных SVG-иконок АРМ-112).

## 4. Старт задачи

Перед нетривиальной работой:

1. `git status --short` — сохранить все изменения пользователя (незакоммиченная работа здесь — норма).
2. Прочитать этот файл и `.ai/SESSION_STATE.md` (точка останова), `.ai/LESSONS.md` (ошибки, которые нельзя повторять), при необходимости `.ai/PROJECT_MAP.md`; для фичи/бага — спеку соответствующей папки `spec/NNN-*/` (бэкенд — `specs/002-*`), статус фронта — `docs/FINAL-GATE.md`, `STATUS.md` спеки.
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

Фронт через бэкенд — `BACKEND_URL=http://localhost:8000 npm run dev`. Установка «всё сразу» — `./scripts/setup.sh` (зависимости, сиды, модель ИИ + llama.cpp; `--no-model` без ИИ), стенд с ИИ — `./scripts/ai-up.sh [start|stop|status]` (модель :8081, бэкенд :8000, фронт :3000; логи `backend/var/logs/`). ИИ-модель проекта — дообученная Qwen3.5-0.8B через llama.cpp (`docs/model-report/QUICKSTART.md`), включается `LLAMA_URL`; Ollama не используется. Гейт «фронт на реальном бэкенде» (бэкенд на `:8130` с чистой `var/e2e.db`, `next start -p 3130`, три sh-скрипта, логи — `backend/var/e2e-logs/`):

```bash
backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]
```

Переменные окружения фронта в слайсах — только `NEXT_PUBLIC_*` и только через `src/shared/config/env.ts` (прямой `process.env` в слайсах запрещён): `NEXT_PUBLIC_DEMO_MODE=false` скрывает демо-подсказки на логине, `NEXT_PUBLIC_MOCK_API_BASE_URL` задаёт базу API. `BACKEND_URL` читается только в `next.config.ts`. E2E-настройки: `E2E_PORT`, `E2E_BASE_URL`, `E2E_REUSE_SERVER`; базовый адрес sh-скриптов — `BASE_URL`; `E2E_2FA` (код 2FA, по умолчанию `123456`) нужен лишь шагам admin-скрипта про 2FA, которых в системе нет (известное расхождение, `docs/COMPLIANCE.md` п. 11). Мок-режим сессии: `MOCK_SESSION_SECRET` (серверная переменная, подпись токена; не задана — секрет случайный на процесс, перезапуск сбрасывает сессии, как и in-memory стор). Бэкенд: `DATABASE_URL`, `JWT_SECRET` (≥ 32 байт), `SEED_DIR`, `MODELS_DIR`, `OLLAMA_*`, `ML_WARMUP` (фоновый прогрев ML ~25 с; в тестах `0`), `TTS_ENABLED`, `TWO_FACTOR_STUB`, `API_PREFIXES`.

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

HARD-правило (`spec/000-фронт/07-design-guidelines.md`), нарушение = брак. **Граница (решение A11, фича 002): правило действует в симуляторе — экранах `/arm/*`. Платформа-обложка (вход, кабинеты, справочник, профиль) строится по `docs/platform-design.md` и `spec/002-full-system-integration/07-platform-shell.md`. Токены `--pf-*` и `src/shared/ui/platform` в симулятор не импортируются (тест `src/app/layouts/simulatorBoundary.test.ts`); в симулятор добавлена лишь тонкая панель «В кабинет» в токенах АРМ. Внешний вид `/arm/*` защищают снимки `e2e/simulator-visual.spec.ts`.** Далее в разделе «экраны» = экраны симулятора:

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

## 14. Память проекта (`.ai/`) и DenseCode

`.ai/` — локальная память агентов между сессиями (не синхронизируется наружу, но лежит в git). Файлы:

| Файл | Назначение | Правило записи |
|---|---|---|
| `SESSION_STATE.md` | Точка останова: факты, что сделано, решения, следующие шаги, предостережения | Перезаписывается целиком при значимой смене контекста; только наблюдённые проверки |
| `SESSIONS.md` | Журнал сессий | Только дописывать в конец (append-only), одна запись на сессию |
| `LESSONS.md` | Ошибки, которые нельзя повторять (`L00N`) | Добавлять новый урок сразу после ошибки или поправки от владельца; не переписывать старые, устаревшее помечать `[устарело]` |
| `PROJECT_MAP.md` | Карта слайсов, модулей и фич | Обновлять, когда меняется структура; сверять с кодом |

Файлы `.ai/` — на английском, в сжатом формате DenseCode: заголовки `##`, пары `key:value`, один факт на строку, стрелки и символы (`→`, `=>`, `|`, `!`), метки ✅ сделано, ❌ провал, ⚠️ осторожно, 🧠 вывод. Без воды и без рассуждений; русский допустим только в цитатах интерфейса и имён.

## 15. Завершение сессии

После значимой работы (фича, багфикс, архитектурное решение), когда проверки пройдены, а не посреди реализации:

1. Обновить `.ai/SESSION_STATE.md`: что сделано, фактические результаты проверок **с датой и командой**, открытое, следующий шаг. Незапущенное записывать как «не проверялось».
2. Дописать запись в `.ai/SESSIONS.md` (дата, ветка, фокус, сделано, решения, next).
3. Если была ошибка, поправка владельца или неожиданная ловушка — добавить урок в `.ai/LESSONS.md` (`❌ как не надо` → `✅ как надо`, `!` — почему).
4. Не раздувать документы: числа тестов держать в `SESSION_STATE.md`, а не копировать по всем файлам — в других местах они быстро устаревают.
5. Новые файлы вне `.ai/` создавать только по запросу или по процессу спеки.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
