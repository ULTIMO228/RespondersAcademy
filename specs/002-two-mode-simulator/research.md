# Research: технические решения (Phase 0)

Формат: **Decision** — **Rationale** — **Alternatives**. R1–R14 унаследованы из `specs/001-dispatcher-simulator/research.md` (там — полные обоснования); здесь — только изменения и новые решения R15–R22. Все решения соответствуют принципу I конституции (офлайн, CPU).

## Унаследованные решения (с правками)

| # | Решение | Статус в 002 |
|---|---|---|
| R1 | Эмбеддер `cointegrated/rubert-tiny2` (≈120 МБ) для смыслового сравнения и классификатора; `multilingual-e5-small` — для дедупликации сценариев | без изменений |
| R2 | Грамматика/опечатки — `symspellpy` + доменный словарь; LanguageTool — опциональный плагин при наличии Java | без изменений; выход приводится к `GrammarError { field, fragment, wrong, expected, type: spelling \| syntax }` фронта |
| R3 | Справочник улиц Москвы (OSM-выгрузка) + `rapidfuzz`, «похожая улица» при ratio ≥ 85 | без изменений; в волне A применяется к `enteredText` попытки и полям сценария; в волне B — к адресному блоку карточки |
| R4 | Классификатор группы ЕКП: эмбеддинги + логистическая регрессия; SC-006 ≥ 80 % на 96 задачах | целевые классы — `reference.incidentGroups` (105) с обучением на 96 карточек + синтетика; метрика считается по группам, встречающимся в билетах |
| R5 | Ollama + `qwen2.5:7b-instruct` для генерации сценариев | **опционально**: см. R19 — обязательный шаблонный фолбэк |
| R6 | STT Vosk small-ru, TTS Silero v4 ru | TTS переезжает в волну A? — нет: в волне A `calls/reply` текстовый; TTS нужен для аудиозаписи билета (волна B, R20) |
| R7 | Аудио софтфона через WebSocket | **отложено**: фронт волны A ведёт софтфон текстом (`POST /calls/reply`), аудио — после появления экрана |
| R8 | Архитектура оценщика: компоненты → `score ∈ [0,1]`, реестр правил с `source` | без изменений; добавлен маппинг на `Evaluation` фронта (R17) |
| R9 | Калибровка на размеченной выборке + правки преподавателя | без изменений |
| R10 | Адаптивная сложность — Эло-подобный рейтинг | без изменений; используется в `cardFlow` при `plan.adaptive` и в рекомендациях (R22) |
| R11 | CSV — стандартная библиотека; PDF — reportlab | Recharts не нужен: графики рисует фронт по `Report.charts` / `GroupReport.charts`; бэкенд отдаёт данные и файлы экспорта |
| R12 | Аутентификация: argon2 + JWT | адаптировано под cookie фронта — R16 |
| R13 | Развёртывание: docker-compose (Linux) / локально через `uv` (Windows) | без изменений; PostgreSQL на Windows ставится отдельно; для разработки — SQLite (R18) |
| R14 | WebSocket для мониторинга | **отложено**: фронт опрашивает `GET /sessions/[id]/feed` каждые 2–5 с (`createFeedSubscription`); WS не нужен |

## R15. Совместимость контракта: тот же URL-префикс, rewrite в Next.js

- **Decision**: FastAPI монтирует совместимый роутер под `/api/mock` и зеркально под `/api/v1`. Фронт подключается через `rewrites()` в `next.config.ts` (`beforeFiles`: `/api/mock/:path*` → `${BACKEND_URL}/api/mock/:path*`, только если задан `BACKEND_URL`). Без переменной фронт работает на своём мок-слое, как сейчас.
- **Rationale**: FR-059 — фронт не меняется; `beforeFiles` перекрывает route-handler'ы `app/api/mock/**`; запросы остаются same-origin, cookie `arm112_session` уходит без CORS/credentials; `scripts/e2e-*.sh` работают без правок (они ходят через `BASE_URL/api/mock`). В проде nginx делает то же самое.
- **Alternatives**: `NEXT_PUBLIC_MOCK_API_BASE_URL=http://host:8000/api/mock` + CORS — клиент `fetch` не шлёт cookie кросс-ориджин (`credentials` по умолчанию `same-origin`), пришлось бы править `client.ts`; удалять route-handler'ы фронта — ломает Vitest фронта.

## R16. Сессия: cookie фронта + подписанный токен

- **Decision**: `POST /auth/login` возвращает `AuthSession { userId, role, token, twoFactorUsed, issuedAt }`, где `token` — JWT HS256 (`sub=userId`, `role`, `iat`, `exp = iat + 24 ч`). Фронт сам кладёт JSON в cookie `arm112_session` (URL-encoded). Бэкенд в `deps.get_viewer()` читает cookie → JSON → проверяет подпись и срок `token`; также принимает `Authorization: Bearer <token>` (для тестов и будущих клиентов). Пароли — argon2-хэши, сиды хэшируются при загрузке; `reset-password` генерирует временный пароль и возвращает его один раз, как в моке. 2FA: `twoFactorCode` принимается и не проверяется (заглушка, как во фронте; `AuthPolicy.twoFactorRequired` из настроек).
- **Rationale**: FR-062; фронт уже разбирает cookie в `proxy.ts` и серверных лэйаутах по своим правилам (24 ч от `issuedAt`) — бэкенд не должен менять формат. Мок-эндпоинты cookie не проверяют, а бэкенд обязан (изоляция T2.5-01) — поведение для анонима повторяет мок: без cookie запросы с `sessionId` работают, с `studentId` → 401.
- **Alternatives**: HttpOnly-cookie, выставляемая бэкендом, — фронт её не прочитает для `sessionStore`; сессии в БД — лишняя таблица для 20 пользователей.

## R17. Оценщик → `Evaluation` фронта

- **Decision**: `ml.assess.engine.assess(attempt, scenario, cards, config) -> AssessmentResult` (компоненты, ошибки с правилами, предупреждения) и адаптер `to_evaluation()`: `timeScore` = компонент `timing`; `correctnessScore` = среднее взвешенное `decision + statuses + fields + multitask`; `grammarScore` = `grammar + address`; `semanticScore` = `comments (+ report)`; `totalScore` = Σ weight·score × 100 (веса — `Scenario.successCriteria`/план занятия, по умолчанию из R14-001: время 0,25; решение 0,2; статусы 0,15; комментарии 0,15; поля 0,1; грамотность 0,1; многозадачность 0,05); `errors[] = { type, severity, message }`, где `message` = «<текст> — <правило-источник>»; `grammarErrors[]` из R2/R3; `aiComment` — детерминированный текст из шаблонов по компонентам (без LLM), начинается с «ИИ-оценка:». Полный `AssessmentResult` (компоненты, веса, `ruleId`, `step`, `fixed`) хранится в `evaluations.components` для разбора и калибровки.
- **Rationale**: контракт `Evaluation` фиксирован фронтом; принципы II/III требуют сохранить детализацию — храним обе формы. Эталон волны A — `Scenario.etalon` (`expectedActions`, `keyPhrases`, `expectedFields`, `expectedText`) + `IncidentCard.expectedServices/expectedTags` + `timeNorms`.
- **Alternatives**: расширять `Evaluation` новыми полями — допустимо (фронт игнорирует лишние), но менять существующие нельзя.

## R18. Хранилище: PostgreSQL целевая, SQLite для разработки

- **Decision**: SQLAlchemy 2 async; `DATABASE_URL` по умолчанию `sqlite+aiosqlite:///backend/var/dev.db`; в проде `postgresql+asyncpg://…`. Вложенные структуры фронта (`notificationList`, `cardFlow`, `statuses[]`, `charts`, `etalon`, `settings`) — `JSON().with_variant(JSONB, "postgresql")`. Alembic-миграции генерируются под PostgreSQL; для SQLite используется `metadata.create_all` (тесты).
- **Rationale**: на машине разработчика нет PostgreSQL и Docker; тесты должны бежать без внешних сервисов; конституция требует PostgreSQL 12+ для поставки — обеспечено. Запросов, требующих JSONB-операторов, в контракте нет (фильтры карточек делаются по колонкам + в памяти на 108 карточках).
- **Alternatives**: только PostgreSQL — блокирует разработку сегодня; `testcontainers` — нужен Docker.

## R19. Сиды и семантика ID

- **Decision**: `backend/app/seed/load.py` читает `spec/mocks/*.json`, `spec/mocks/fixtures/arm-cards.json`, `mocks/local/addresses.json`, `mocks/admin/*.json` (пути относительно корня репо, переопределяются `SEED_DIR`); загрузка идемпотентна (upsert по `id`); `meta.*` игнорируется; `reference.classifierRows.$ref` разрешается в таблицу классификатора; `X-Classifier-Version` = `classifier.meta.version`. Новые записи получают ID в тех же форматах: `u-NNN`, `s-NNN`, `ses-NNN`, `att-NN`, `mat-NNN`, `rep-<хвост sessionId>-<studentId>`, `rep-…-group` (счётчики — по максимальному существующему номеру). Отчёты `reports.json` помечаются `static=true` и никогда не пересобираются.
- **Rationale**: FR-060 и тесты фронта (`scripts/e2e-*.sh` ссылаются на `ivanov/student112`, `c-063`, `ses-2026-09-16-01`, `att-01`); `sessions.json` уже содержит миграцию ID (см. `meta.note`).
- **Alternatives**: UUID + маппинг — ломает e2e и демо-подсказки на `/login`.

## R20. Репликация рантайм-семантики мок-слоя

- **Decision**: перенести 1:1 доменную логику фронта (TypeScript → Python) для: (a) машины статусов ДДС из `reference.ddsStatuses[].next` (`invalidTransition` 409, `requiresComment` 400); (b) `cardFlow` при старте занятия по `SessionPlan` (темп, порядок, конвейер, категории, профили; без плана — шаг 3 мин); (c) окна ленты `(since, at]` с порядком «выдача → открытие → статус → завершение → оценка ИИ, затем курсант, карточка»; (d) `control` (pause/resume/issue/report) и переход `finished → reported` с формированием отчёта; (e) ленивой сборки отчёта при `GET /reports` для завершённого занятия, идемпотентно; (f) проекции `GET /cards` для `c-NNN` поверх фикстуры по `fixture-map`; (g) расширенного поиска карточек (AND между полями, OR внутри, ё/е и регистр не различаются). Источник истины — `src/entities/*/model/**`, `src/shared/api/mock/**`; каждый пункт покрывается unit-тестом с теми же примерами, что в `*.test.ts` фронта.
- **Rationale**: FR-059: e2e-скрипты и экраны зависят от этих деталей; проще перенести, чем переизобретать.
- **Alternatives**: считать «достаточно похожее» поведение — риск расхождений на защите.

## R21. Генерация сценариев без LLM и с LLM

- **Decision**: `POST /scenarios/generate` синхронно, как в моке (≤ 3 сценария): при доступном Ollama (`OLLAMA_URL`, health-check при старте) — LLM с JSON-схемой и повторами; иначе — детерминированный шаблонный генератор (вариации по группе: комбинирует карточки `cards.json` той же группы, меняет адрес из `mocks/local/addresses.json`/справочника улиц, ловушки по параметрам). Оба пути проходят валидатор R22 и помечаются `source: generated`, `validation.status: pending`. Повторный вызов с той же категорией не дублирует (по `title`), как в моке.
- **Rationale**: демо не должно зависеть от наличия 4,7 ГБ модели; принцип IV. LLM-путь остаётся для SC-008.
- **Alternatives**: фоновая задача с `job_id` (как в 001) — контракт фронта синхронный; оставить асинхронность для `/api/v1` волны B.

## R22. Валидатор билетов, справочник ситуаций и рекомендательная система

- **Decision**: **Валидатор** (FR-023) — `ml.generate.validator.validate(ticket) -> ValidationReport { checks: [{ id, passed, confidence?, message }] }`: категория (R4, порог уверенности 0,6 → «требует ручной проверки»), адрес (R3), обязательные поля, дубликат (косинус e5 ≥ 0,92 к существующим), грамматика (R2), согласованность фактов (правила: «пострадавшие» в тексте ↔ `victims`, «03 не требуется» ↔ `noAmbulance`, регион ↔ `crossRegion`). **Справочник** (FR-046) — статьи генерируются скриптом из классификатора и памятки в `backend/data/kb/*.md` (по группе ЕКП: признаки, службы, что уточнить, ожидаемое решение ДДС, типичные ошибки) и загружаются как сид; правки преподавателя — в БД. **Рекомендации** (FR-047) — детерминированная модель: профиль ошибок обучаемого (тип × категория × режим, экспоненциальное затухание по времени) → ранжирование билетов (незнакомая категория со слабым результатом выше; сложность ≈ рейтинг R10 + δ) и статей (по типам ошибок); каждая рекомендация несёт `reason { errorType, count, ruleId }`; повторно выданные и выполненные — понижаются. Метрика SC-008 — `eval_recommender.py` на синтетических историях.
- **Rationale**: требования команды к ML; всё офлайн, воспроизводимо, объяснимо преподавателю (принцип II).
- **Alternatives**: коллаборативная фильтрация — нет данных; LLM-рекомендации — невоспроизводимы.

## Бюджет моделей (принцип I)

| Компонент | Модель | Диск | Отклик CPU | Обязателен |
|---|---|---|---|---|
| Эмбеддер | rubert-tiny2 | 120 МБ | < 20 мс/фраза | да |
| Дедупликация | multilingual-e5-small | 470 МБ | < 100 мс/текст | да |
| Спеллчекер | symspell ru + домен | 30 МБ | < 5 мс/строка | да |
| Справочник улиц | OSM-выгрузка | 2 МБ | < 5 мс | да |
| Классификатор ЕКП | LR поверх эмбеддингов | < 1 МБ | < 30 мс | да |
| TTS | Silero v4 ru | 50 МБ | ~1 с на 10 с речи | волна B |
| STT | Vosk small-ru | 45 МБ | реальное время | волна B, опц. |
| LLM | qwen2.5:7b-instruct q4 | 4,7 ГБ | 3–6 ток/с | опционально |

## Открытые вопросы (не блокируют)

- Не получен типовой сценарий заказчика «ДТП с разливом топлива» — при получении добавить в сиды.
- Аудио для режима A: один голос Silero на билет или вариативность по полу заявителя (по ФИО) — предложено второе, решается при реализации волны B.
