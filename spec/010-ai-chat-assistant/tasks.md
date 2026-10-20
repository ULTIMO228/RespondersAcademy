# Tasks: ИИ-чат-ассистент разбора попытки

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)
**Tests**: включены (TDD по `CLAUDE.md`): красный тест по правильной причине → код → зелёный; для 401/403/404/429 всегда парный запрос на 200.
**Формат**: `- [ ] T### [P?] [US?] Описание с путём`. `[X]` — только после реальной проверки.
**Открытое решение владельца**: облако для чата (`AGENTS.md` §2, research R2) — см. T020; принято владельцем 2026-10-20: чат следует модели администратора (выключатель `CHAT_CLOUD_ENABLED`).

## Phase 1: Setup

- [X] T001 Перед кодом прочитать актуальные гайды Next.js в `node_modules/next/dist/docs/` (Route Handlers, клиентские компоненты) и зафиксировать версию из `node_modules/next/package.json` в заметке к PR/сессии. (Прочитано: `route.md`, `15-route-handlers.md`, `05-server-and-client-components.md`; версия Next 16.3.5.)
- [X] T002 Найти реальный источник фактов оценки для студента: прочитать `backend/app/services/evaluation_service.py` (`get_or_create_evaluation`, `evaluate_if_possible`), `backend/app/api/v1/operator112.py:68`, `backend/app/api/compat/attempts.py:45`; записать в `research.md` R3 точные поля баллов, нарушений, нормативов и эталона (сейчас «не проверял»).
- [X] T003 [P] Прочитать `backend/app/services/report_ai_text.py` (`_ask`, `attempt_comment`, `_record_timeout`) и `backend/app/services/report_builder.py:206-230` как образец вызова `complete_json` внутри `llm_scope`; заметки — в `research.md` R1.

## Phase 2: Foundational (блокирует все истории)

- [X] T004 [P] Тест контракта схем в `backend/tests/unit/test_attempt_chat_schemas.py`: `message` после trim 1–1000 символов; `history` не более 6 реплик, `role` только `user`/`assistant`, `content` ≤ 1000; `mode` ∈ `operator112|dds`; `reply` ≤ 600; вне границ — 422.
- [X] T005 Pydantic-схемы `ChatRequest`/`ChatResponse` (camelCase, `source` ∈ `cloud|local|template`, `provider` и `modelName` nullable) в `backend/app/schemas/v1/ai_chat.py` (зависит от T004).
- [X] T006 [P] TS-контракт `ChatRequest`/`ChatResponse`/`ChatMessage` в `src/shared/api/types/ai-chat.ts` (`source` — существующий `AiServedBy` из `ai-settings.ts`), экспорт через `src/shared/api/types/index.ts`; затем `cd backend && uv run python scripts/extract_ts_fields.py` (обновит `tests/contract/expected_fields.json`). **Открыто:** TS-часть сделана (файлы созданы, `tsc --noEmit` = 0); `extract_ts_fields.py` НЕ запускался — оставлено оркестратору (скрипт берёт все `types/*.ts` через glob, `ai-chat.ts` подхватится); `test_expected_fields_are_fresh` до этого красный.
- [X] T007 [P] Клиент `postAttemptChat(request, signal)` в `src/shared/api/endpoints/ai-chat.ts` через `aiApiClient` из `src/shared/api/ai-client.ts` + экспорт в `src/shared/api/index.ts`; тест рядом.
- [X] T008 Тест сервиса фактов в `backend/tests/unit/test_attempt_chat_facts.py`: факты содержат баллы, превышение нормативов режима, формулировки нарушений (`ERROR_TITLES`), эталонные требования; НЕ содержат ФИО, id попытки/карточки/людей, введённый текст карточки, сырые `message` проверки (проверка по подстроке).
- [X] T009 Сервис `backend/app/services/attempt_chat.py`: `build_facts(db, attempt, mode)` по T002, `build_prompt(facts, message, history)` (системный промпт по смыслу спеки §4.3, история усечена до последних 6 реплик), `template_reply(facts)` (справочный ответ из фактов без модели).
- [X] T010 Контрактные тесты эндпоинта `backend/tests/contract/test_attempt_chat.py`: 401 без сессии; 403 для чужой попытки и для роли не `student`; 404 для несуществующей и для попытки без оценки; 422 на неверное тело; в каждом случае парный запрос своей попытки → 200 с полями `reply/source/provider/modelName`.
- [X] T011 Роутер `backend/app/api/v1/ai_chat.py` (`POST /ai/chat`, доступ через `ai_access.require_attempt_access` + проверка роли `student`) и подключение в `backend/app/api/v1/__init__.py`; пока ответ — `template_reply` с `source="template"` (зелёные T010).

**Checkpoint**: эндпоинт отвечает шаблоном с корректными правами.

## Phase 3: User Story 1 — шторка на экране результатов (P1) 🎯 MVP

**Цель**: кнопка в шапке разбора открывает шторку, обучающийся задаёт вопрос и видит ответ с бейджем.
**Независимый тест**: quickstart п. 1–3 на мок-режиме и на бэкенде.

- [X] T012 [P] [US1] Тесты `src/widgets/attempt-chat/ui/ChatDrawer.test.tsx`: открытие, закрытие по ✕, `Escape` и клику по подложке; фокус-ловушка (Tab циклирует внутри); фокус в поле ввода при открытии; `role="dialog"` + `aria-modal`.
- [X] T013 [P] [US1] Тест кнопки в `src/pages/student/results/ui/StudentResults.test.tsx`: «Обсудить результат с ИИ» есть при загруженной оценке и отсутствует при «Оценки пока нет» и при ошибке загрузки.
- [X] T014 [US1] Интерфейс хранилища истории в `src/shared/lib/chat-history/` (ключ `arm112_chat_attempt_{attemptId}`, до 50 реплик — старые отбрасываются, всё в try/catch, подмена в тестах) + тест (приватное окно/исключение → чат работает без восстановления).
- [X] T015 [US1] Хук `src/widgets/attempt-chat/model/useChat.ts`: состояние `closed|open|waiting|error`, отправка через `postAttemptChat`, отмена `AbortSignal` при закрытии/смене попытки, статус реплики `failed` + «Повторить», приветствие строится на клиенте из балла и числа замечаний (без запроса и без бейджа), в запрос уходят последние 6 реплик.
- [X] T016 [US1] Компоненты `ChatDrawer.tsx`, `MessageFeed.tsx` и `ChatDrawer.module.css` в `src/widgets/attempt-chat/ui/` строго на токенах `--pf-*` (ширина 460px, `max-width: 100vw`, анимация 250 мс `cubic-bezier(0.16, 1, 0.3, 1)`, `prefers-reduced-motion` → без анимации, баббл пользователя `--pf-bg-selected`, ассистента `--pf-bg-subtle`, ответ — простой текст с сохранением абзацев); у каждого ответа ассистента `AiSourceBadge` (`src/shared/ui/AiSourceBadge`) с `source` и `modelName`; кнопка «Очистить переписку»; подпись «Оценку выставляет преподаватель, ответы ИИ справочные». Публичный API — `src/widgets/attempt-chat/index.ts` без `export *`.
- [X] T017 [US1] Кнопка «Обсудить результат с ИИ» в `actions` `PageHeader` и монтирование шторки в `src/pages/student/results/ui/StudentResultDetailScreen.tsx` (только при `loaded.review`); `mode` из пропсов экрана.
- [X] T018 [P] [US1] Route Handler автономного режима `app/api/v1/ai/chat/route.ts` (тот же контракт, детерминированный ответ с `source: "template"`, учитывает проверку сессии как соседние `app/api/v1/ai/*/route.ts`) + тест.
- [ ] T019 [P] [US1] **Открыто: сделана unit-часть (`src/widgets/attempt-chat/boundary.test.ts`, зелёный), e2e-проверка в `/arm/*`/`/teacher/*` не писалась и не запускалась.** Негативная проверка границ: тест `src/widgets/attempt-chat` не подключается в `src/pages/arm*`/`teacher*`/`admin*` (поиск импортов) и e2e-проверка отсутствия кнопки в `/arm/*` и `/teacher/*` (FR-001, FR-014, SC-006) — в `e2e/smoke.spec.ts` или отдельном тесте.

**Checkpoint**: MVP — шторка работает на шаблонных ответах бэкенда и мока.

## Phase 4: User Story 3 — гибридный контур Polza.ai / локальная модель / шаблон (P1)

**Цель**: ответы строит выбранная модель, бейдж честный, каскад работает, лимиты и аудит учтены.
**Независимый тест**: integration-тесты с подменой клиентов + quickstart п. 3, 5.

- [X] T020 [US3] Решение владельца по облаку для чата получено 2026-10-20 («включи в облако … чтобы работало то что указано в модели от администратора»): поправка внесена в `AGENTS.md` §2; `CHAT_CLOUD_ENABLED` по умолчанию `True` (выключатель). `CLAUDE.md` подключает `AGENTS.md` и не менялся.
- [X] T021 [US3] Интеграционные тесты `backend/tests/integration/test_attempt_chat_cascade.py` (по образцу тестов фичи 006): источник `local` → ответ `local`; источник `cloud` с разрешением → `cloud`; сбой/таймаут/лимит облака → `local`; обе модели недоступны → `template`; ответ не прошёл `validate_text` → `template`; `source` в ответе равен `LlmOutcome.source` (SC-003).
- [X] T022 [US3] В `backend/app/services/attempt_chat.py` вызвать `llm.complete_json("attempt_chat", system, user, {"text": str})` внутри `ai_health_service.llm_scope(db, viewer, release_connection=True)`, проверить `report_ai_text.validate_text(max_len=600)`, ограничить ожидание константой чата (старт 20 с, `asyncio.to_thread` как в `report_ai_text._ask`), вернуть `source/provider/modelName` из исхода; облачный путь гейтится флагом из T020; подключить в `ai_chat.py` вместо заглушки T011.
- [X] T023 [P] [US3] Добавить цель `attempt_chat: "ответ чата разбора попытки"` в `PURPOSES` в `backend/app/services/external_ai_audit.py` и тест записи аудита.
- [X] T024 [P] [US3] Лимит запросов на пользователя (старт 10/мин, in-memory, 429 с понятным текстом) в `backend/app/services/attempt_chat.py` + тест (11-й запрос → 429, затем после окна → 200); фронт показывает 429 в ленте и разрешает «Повторить».
- [X] T025 [US3] Отметить `backend/tests/contract/test_attempt_chat.py` как покрывающий реальные источники; прогнать `cd backend && uv run pytest -q tests -k attempt_chat && uv run ruff check .`.

## Phase 5: User Story 2 — поле ввода без файлов (P1)

**Цель**: эргономичное поле: auto-grow, Enter/Shift+Enter, кнопка «Отправить», нет файлов.
**Независимый тест**: quickstart п. 4.

- [X] T026 [P] [US2] Тесты `src/widgets/attempt-chat/ui/ChatInput.test.tsx`: пустое/из пробелов → кнопка `disabled`; `Enter` отправляет, `Shift+Enter` переносит; рост от 44px до 140px, затем скролл; после отправки высота 44px; `maxLength` 1000 + счётчик; во время ожидания Enter и клик игнорируются; в DOM нет `input[type=file]`, нет скрепки/«+»; `drop` и `dragover` — `preventDefault` без ошибок.
- [X] T027 [US2] `ChatInput.tsx` + стили в `src/widgets/attempt-chat/ui/` по спеке §2.2 и §5.1: рамка `--pf-border-control`, фокус `--pf-focus-ring`, placeholder «Спросите, почему снижен балл или как действовать по регламенту...», кнопка 36×36 `--pf-action`/`--pf-action-hover`/disabled `--pf-bg-hover`, спиннер во время ожидания, `aria-label="Отправить"`, `aria-live` для ленты.
- [X] T028 [US2] Подключить `ChatInput` в `ChatDrawer` и проверить контраст токенов (≥ 4.5:1 текст, ≥ 3:1 границы) существующим тестом токенов `src/shared/ui/styles/tokens-platform.test.ts` или добавить кейс.

## Phase 6: User Story 4 — чипы вопросов по ошибкам попытки (P2)

**Цель**: 2–3 чипа, соответствующих реальным нарушениям попытки.
**Независимый тест**: попытка с превышением времени и пропуском службы показывает соответствующие чипы; клик отправляет вопрос.

- [X] T029 [P] [US4] Тесты `src/widgets/attempt-chat/model/chips.test.ts`: из модели разбора (`ReviewModel`) строятся 2–3 чипа по нарушениям (время → «Почему превышен норматив времени?», служба → «Зачем привлекать … (название службы)?», всегда «Как избежать этих ошибок?»); нет нарушений → только общий чип; не более 3.
- [X] T030 [US4] `chips.ts` и `QuickChips.tsx` в `src/widgets/attempt-chat/`; показывать только пока в чате нет реплик пользователя; клик вызывает ту же отправку, что и ручной ввод; тест клика.

## Phase 7: Polish & сквозная проверка

- [ ] T031 [P] Сквозной тест: Playwright-сценарий в `e2e/` (вход обучающимся, разбор попытки, открыть шторку, вопрос, ответ с бейджем, Esc) на свежем сервере; для бэкендного режима — HTTP-проверка 200/403/404 в `scripts/e2e-student.sh` (сначала 200 своей попытки, потом 403 чужой).
- [ ] T032 [P] Замерить время ответа локальной модели и облака на чат-нагрузке (`SC-002`), записать цифры в `spec.md` SC-002 вместо ориентиров; оценить долю шаблонных ответов из-за `validate_text` (риск плана).
- [X] T033 [P] Обновить `spec/README.md` (статус 010), `spec/010-ai-chat-assistant/quickstart.md` при расхождениях и `docs/mock-api.md` (новый маршрут).
- [ ] T034 Полная проверка: `npm run check`, `npm run test`, `cd backend && uv run pytest -q && uv run ruff check .`; невыполнимое — назвать с причиной (песочница блокирует loopback для e2e).
- [ ] T035 Обновить `.ai/SESSION_STATE.md` и дописать `.ai/SESSIONS.md` (DenseCode, английский); урок в `.ai/LESSONS.md`, если был.

## Зависимости и порядок

- Phase 1 → Phase 2 → остальные. T002 блокирует T008/T009.
- US1 (Phase 3) опирается на Phase 2; US3 (Phase 4) заменяет заглушку T011 (зависит от T009, T011); US2 и US4 зависят от каркаса `ChatDrawer` (T016), но не друг от друга.
- T020 (решение владельца) блокирует только облачную ветку T022; локальный и шаблонный пути идут без него.
- Параллельно: T003 ∥ T001; T004 ∥ T006 ∥ T007; T012 ∥ T013 ∥ T018 ∥ T019; T023 ∥ T024; T026 ∥ T029.

## Стратегия

MVP = Phase 1–3 (шторка на шаблонных ответах, права и границы). Затем Phase 4 (настоящие модели), Phase 5 и 6 (шлифовка ввода и чипы), Phase 7 (замеры и сквозная проверка). Коммиты — только по вашей просьбе, стейджить только свои файлы (дерево общее с фичей 007).
