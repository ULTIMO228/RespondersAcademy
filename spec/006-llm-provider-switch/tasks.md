# Tasks: Выбор языковой модели и контроль её использования (фича 006)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/ai-endpoints.md](contracts/ai-endpoints.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Порядок**: TDD (красный тест → код → зелёный), как в `CLAUDE.md`. Для отказов (400/401/403) рядом парный запрос, возвращающий 200. `[X]` — только после реальной проверки.
**Исполнитель** (тег в конце задачи): `[Opus]` = Opus 5.5 medium, `[Sonnet]` = Sonnet 5.5 medium, `[Haiku]` = Haiku 5.5 xhigh. Субагенты обязательны; результат каждой задачи проверяю сам по диффу и тестам.
**Вне рамок (не менять)**: `call_reply`, `call_script`, диалог звонящего, `backend/.env` (не читать и не печатать). Все пути ниже — от корня репозитория.
Формат: `- [ ] Tnnn [P?] [USn?] описание с путём [исполнитель]`; `[P]` — можно параллельно (другие файлы, нет зависимости от незавершённых).

## Phase 1: Setup и решения владельца

- [X] T001 Проверить, что `cryptography` есть в `backend/uv.lock` (транзитивно через `python-jose[cryptography]`) и `from cryptography.fernet import Fernet` импортируется в `uv run python`; новых зависимостей не добавлять; результат записать в `research.md` R2 [Haiku]
- [X] T002 Решение владельца 2026-10-20: для этой опциональной функции принцип I не применяется; конституция и `AGENTS.md` §2 не меняются, источник по умолчанию остаётся `local`. Расхождение записано в `constitution-amendment.md`.
- [X] T003 Подтвердить по документации Polza.ai и пробным вызовом форму закрепления модели `qwen/qwen3.8-27b` и маршрута `cerebras/fp16`; записать, возвращается ли фактический маршрут в ответе [Opus] — подтверждено 2026-10-20: `provider.only` + `allow_fallbacks=false`; ответа с фактическим маршрутом нет; неверный route вернул 503 `noProvidersFiltered`; R1 обновлён, стопор снят

## Phase 2: Foundational (блокирует все истории)

- [X] T004 [P] Тесты (красные) шифрования: `backend/tests/unit/test_ai_secrets.py` — шифр≠открытый текст, расшифровка возвращает исходный ключ, неверный мастер-ключ → ошибка, мастер-ключ из `AI_SETTINGS_KEY` либо HKDF от `JWT_SECRET` (≥ 32 байт), `repr` не содержит ключ [Haiku]
- [X] T005 Реализовать `backend/app/services/ai_secrets.py` (Fernet, `encrypt/decrypt/last4`) [Opus]
- [X] T006 [P] Модели `backend/app/models/ai_settings.py` (`AiSettings`, `AiHealth` — поля и enum строго по `data-model.md`: `source` ∈ `local|cloud`; `cloud_key_cipher` text null; `cloud_key_last4` varchar(4) null; `last_error_reason` ∈ `invalid_key|insufficient_funds|rate_limited|daily_limit|timeout|network|wrong_route|bad_response|local_down`) и миграция `backend/alembic/versions/0006_ai_settings.py` (+ регистрация в `backend/app/models/__init__.py`; в `AGENTS.md` обновить число таблиц 45→47 и отметить `app.seed.load --reset` после изменения моделей); инвариант: `source='cloud'` только при непустом `cloud_key_cipher` (CHECK) [Opus]
- [X] T007 [P] Тесты (красные) `backend/tests/unit/test_ai_settings_service.py`: эффективный источник = строка БД, иначе окружение (`AI_PROVIDER`, `POLZA_API_KEY`) (FR-016); сохранение применяется со следующего вызова (инвалидация кэша), TTL 5 с; `clearKey` при `cloud` → переключение на `local`; `cloud` без ключа → ошибка [Haiku]
- [X] T008 Реализовать `backend/app/services/ai_settings_service.py` (`effective()`, `save()`, `clear_key()`, кэш с инвалидацией; ключ расшифровывается только внутри вызова модели) [Opus]
- [X] T009 [P] Тесты (красные) `backend/tests/unit/test_complete_json.py` — в том числе стопор: `source=cloud` отклоняется, пока `CLOUD_ROUTE_VERIFIED` ложен или решение по конституции не отмечено; на `httpx.MockTransport`/подменённых клиентах: облако OK → `source=cloud`; облако 401/402/429/таймаут/мусор/`wrong_route` → автоматически локальная (`source=local`, `reason` заполнен); локальная недоступна → `source=template`; облако не запрашивается при `source=local`; в запросе только константы модели и маршрута; ключ не попадает в `repr`, логи, события [Haiku]
- [X] T010 `complete_json`/`LlmOutcome`, цепочка облако→локальная→шаблон, подтверждённый маршрутный payload и `LlmCallContext`; события связаны с контекстом вызова. `generation_client()` использует сохранённые настройки через `llm_scope`; `external_client()` совместим с T014 [Opus] — обе части завершены; T003 подтвердил `provider.only` и отсутствие фактического маршрута в ответе; focused tests и Ruff прошли 2026-10-20
- [X] T011 [P] Тесты (красные) `backend/tests/unit/test_ai_health_service.py`: каждый исход обновляет `ai_health`; состояние `ok|degraded|down` по `data-model.md`; смена даты сбрасывает `errors_today/calls_today`; повторные сбои не создают дубликатов (счётчик) [Haiku]
- [X] T012 Реализовать `backend/app/services/ai_health_service.py` и подключить запись исхода в `complete_json`; аудит `ai.external_call` (облако и запас) без текстов и ключа, `flush` в контексте вызова [Opus]

**Checkpoint**: ядро настроек, шифрования, вызова и здоровья готово; можно идти по историям.

## Phase 3: US1 — выбор модели и ключ (P1) 🎯 MVP

**Цель**: админ выбирает источник, вводит ключ; сохраняется, переживает перезапуск, ключ маскируется (FR-001…005, 007, 008, 016).
**Независимая проверка**: quickstart шаги 1, 3, 7.

- [X] T013 [P] [US1] (проверено 2026-10-20: `uv run pytest tests/contract/test_ai_settings_api.py` зелёный; общая фикстура `ai_env` в `backend/tests/conftest.py`, autouse-сброс кэша в `backend/tests/contract/conftest.py`) Контрактные тесты (красные) `backend/tests/contract/test_ai_settings_api.py` (включая: настройки и «ключ задан» переживают пересоздание приложения — SC-002): `GET/PUT /admin/ai/settings` по `contracts/ai-endpoints.md`; admin 200, teacher/student 403, без сессии 401; `cloud` без ключа 400; `clearKey` при `cloud` → `source:"local"`; ответы без ключа и с `Cache-Control: no-store`; тест-утечка: ключ отсутствует в ответах, аудите, логах [Haiku]
- [X] T014 [US1] Реализовать `GET/PUT /admin/ai/settings`; аудит `ai.settings.change` без значений ключа; `cloudFunctions` по FR-014. Legacy `GET /admin/ai/provider` также читает эффективные DB-настройки и учитывает `cloud_allowed()` [Opus] — endpoint и интеграционные тесты проверены 2026-10-20
- [X] T015 [P] [US1] Типы и клиент: `src/shared/api/types/ai-settings.ts` (+ `ai-settings.ts` в `src/shared/api/`), экспорт через public API; после правки типов `cd backend && uv run python scripts/extract_ts_fields.py` [Haiku]
- [X] T016 [P] [US1] Тест (красный) `src/pages/account/ui/AccountAiPage.test.tsx`: выбор источника, поле ключа пустое при «ключ задан …abcd», сохранение, состояния loading/empty/error/success, не-админ → `/forbidden` [Haiku]
- [X] T017 [US1] Первым шагом сверить структуру корневого `app/` по существующему `/account/security`. Экран `src/pages/account/ui/AccountAiPage.tsx` (+ CSS-модуль, только токены платформы `--pf-*`), роут `app/account/ai/page.tsx` как тонкая обёртка, пункт в `AccountNav.tsx`, гвард admin в `proxy.ts`/серверном лэйауте; в автономном режиме без бэкенда — состояние «требуется сервер» (пути v1 вне `ai/*` по умолчанию переводят клиент в «требуется сервер», AGENTS.md §3) [Sonnet] (⚠️ юнит-тесты зелёные; в браузере и на реальном бэкенде не проверялось)
- [ ] T018 [US1] Визуальная проверка экрана в браузере (desktop 1920+, светлая тема платформы), скриншот в отчёт; сверка с `docs/platform-design.md` [Sonnet] — не завершена: существующий порт 3130 обслуживает устаревшую сборку (новый `/account/ai` отдаёт 404); локальный запуск новой сборки блокируется sandbox bind `operation not permitted`, пользовательский сервер не перезапускался.

## Phase 4: US2 — «Проверить подключение» (P1)

**Цель**: пробный запрос с понятной причиной, ничего не сохраняя (FR-006, SC-008).

- [X] T019 [P] [US2] (проверено 2026-10-20: `tests/contract/test_ai_settings_test_api.py` зелёный) Контрактные тесты (красные) `backend/tests/contract/test_ai_settings_test_api.py` (проба укладывается в таймаут 15 с — SC-008): `POST /admin/ai/settings/test` — неверный ключ → `ok:false, reason:"invalid_key"`; рабочий (подмена транспорта) → `ok:true`, `route:"cerebras/fp16"`, `latencyMs`; `source:"local"` — без внешних запросов; настройки не меняются; права как в T013; аудит `ai.connection_test` [Haiku]
- [X] T020 [US2] (проверено 2026-10-20; проба не меняет настройки/состояние модели, её расход отдельно хранится в `ai_health.probe_calls_today` и атомарно входит в общий persisted daily cap) Реализовать `POST /admin/ai/settings/test` в `backend/app/api/v1/ai_settings.py`: одна проба через `complete_json`-клиент с таймаутом ≤ 15 с, ключ из тела либо сохранённый, маршрут проверяется, ключ в ответ не попадает [Opus]
- [X] T021 [US2] Кнопка «Проверить» и вывод причины в `AccountAiPage.tsx` (русские тексты причин из enum), предупреждение при неудачной пробе без блокировки «Сохранить» (стенд может быть без сети) [Sonnet]

## Phase 5: US3 — уведомление о проблемах с LLM (P1)

**Цель**: баннер у админа/преподавателя, автоснятие, без дублей (FR-009…011, 015, 018; SC-005).

- [X] T022 [P] [US3] Контрактные тесты `backend/tests/contract/test_ai_health_api.py`: admin details, teacher redaction, student 403, anonymous 401, transitions, day rollover and `Cache-Control: no-store` [Haiku] — реализовано и проверено 2026-10-20
- [X] T023 [US3] `GET /ai/health` в `backend/app/api/v1/ai_settings.py`; daily usage persisted through `ai_health.calls_today + probe_calls_today`, minute limiter in process, `daily_limit` handling covered in existing LLM limiter tests [Opus] — реализовано; contract/integration tests passed 2026-10-20
- [X] T024 [P] [US3] (баннер преподавателя — FR-010) Тест (красный) `src/widgets/ai-health-banner/ui/AiHealthBanner.test.tsx`: admin видит причину и ссылку на `/account/ai`; teacher — краткое сообщение; student — ничего; пропадает после `ok`; без бэкенда скрыт; один баннер со счётчиком [Haiku]
- [X] T025 [US3] Виджет `src/widgets/ai-health-banner/` (опрос раз в 30 с, public API `index.ts`), подключение в лэйауты админа и преподавателя (`src/app/layouts/…`); не импортировать в симулятор `/arm/*` (граница `simulatorBoundary.test.ts`) [Sonnet] (⚠️ баннер подключён в PlatformLayout (src/app/layouts); в браузере и на реальном бэкенде не проверялось)
- [X] T026 [US3] Интеграционный тест `backend/tests/integration/test_ai_fallback_flow.py`: неверный ключ → локальная модель (`degraded`), локальная недоступна → шаблон (`down`), восстановление облака → `ok`; аудит без утечек [Haiku] — проверено 2026-10-20

## Phase 6: US4 — везде реальная модель, шаблон помечен (P2)

**Цель**: тексты отчётов, рекомендаций, пояснений идут через модель и несут источник; ложные бейджи убраны (FR-011…014, 017; SC-006, SC-007).

- [X] T027 [P] [US4] Тесты (красные) `backend/tests/unit/test_report_ai_text.py`: промпты строятся только из агрегатов и формулировок правил (без ФИО и идентификаторов людей); валидация ответа (русский, длина, без служебных фрагментов); не прошёл → `template`; результат сохраняется с `source` и не регенерируется при просмотре [Haiku] — ГОТОВО: tests/unit/test_report_ai_text.py (31 тест, зелёные)
- [X] T028 [US4] (FR-019: синхронно, таймаут 20 с на текст, при превышении запасной путь + пометка; тест на долгий ответ) Подключить `report_ai_text.py` в `report_builder.py` (`aiComment`, `groupInsights`) и `recommendation_service.py`; сохранять source, старые данные читать как `template` [Sonnet] — реализовано; источники передаются в контрактах, существующие рекомендации не регенерируются. Целевые отчётные/рекомендательные тесты прошли 2026-10-20
- [X] T029 [US4] `explain_stage` в `backend/app/ai_gateway.py` и `backend/app/services/error_map_explain.py` перевести на `complete_json` (работает и на локальном источнике, и с запасным путём; текст ≤ двух фраз как сейчас); сценарии: `scenario_service.py`/`ai_scenario_service.py` — `generation.provider` из исхода, `source="generated"` только для ответа модели, название «Вариация N (ИИ)» → без «(ИИ)» у шаблона [Opus] — сценарная половина исправлена и проверена 2026-10-20; `Scenario.source` оставлен `generated` для сохранения семантики прав
  - Проверено 2026-10-20: пояснение карты ошибок и сценарии используют исход `complete_json`; тип ответа — `cloud|local|template`, старые `ai` совместимы. Шаблоны без бейджа «ИИ»; `llamacpp:`/`polza:` относятся к модельному исходу. `Scenario.source="generated"` оставлен для прав доступа, удаления и дедупликации.
- [X] T030 [P] [US4] Тесты контракта и выгрузок: `backend/tests/contract/test_report_sources.py` и `backend/tests/unit/test_report_export_source.py` проверяют источник ответа и подписи PDF/XLSX/CSV [Haiku] — CSV сейчас не содержит ИИ-текста, проверка зафиксирована тестом; 12 тестов прошли 2026-10-20
- [X] T031 [US4] Подпись источника в `report_export.py` (PDF, лист «Выводы» XLSX через `xlsx_export.py` `Sheet`, CSV при наличии ИИ-текста) [Sonnet] — PDF/XLSX помечены; CSV не экспортирует ИИ-текст, поэтому подпись не требуется
- [X] T032 [P] [US4] Тест и компонент `src/shared/ui/AiSourceBadge/` (режимы: облако «ИИ · облако», локально «ИИ · локально», шаблон «шаблон»; токены платформы; public API) [Sonnet]
- [X] T033 [US4] Заменить бейджи в отчётах, оценках, рекомендациях, карте ошибок и сценариях; детерминированные тексты EtalonBlock и SessionErrorSummaryPanel подписать по правилам/ML; `CallTranscript.tsx` не менять; обновить тесты [Sonnet] — 61 Vitest + 28 contract-shape тестов, ESLint, Prettier и diff-check прошли 2026-10-20
- [X] T034 [US4] Мигрировать поле `source` пояснения карты ошибок `ai|template` → `cloud|local|template` (типы `src/shared/api/types/`, `backend/app/schemas`, потребитель `AiExplain.tsx`, совместимость старого значения `ai`, принцип V). После правки типов фронта: `cd backend && uv run python scripts/extract_ts_fields.py`, затем `uv run pytest tests/contract -q` [Haiku] — извлечение 236 типов; focused 69 pytest + 11 Vitest; contract 272 passed, 3 известных сбоя (2 audio и 1 feature 007)
- [X] T035 [US4] Закрыть FR-013: перепроверить лично `файл:строка` из раздела «Results of audit» в `spec.md`, дополнить фактическими решениями по каждой строке, нерешённых вопросов аудита — 0 (SC-007) [Haiku] — актуальные call-site refs и фактические решения сверены 2026-10-20; оставшиеся реализации/legacy API перечислены отдельными T-задачами

## Phase 7: US5 — сводка статуса (P3)

- [X] T036 [P] [US5] Тест и блок «Состояние» в `AccountAiPage.tsx`: активный источник, модель, маршрут, последний успех, ошибок за сутки, расход суточного лимита (данные `GET /ai/health` для admin) [Sonnet] (⚠️ юнит-тесты зелёные; на реальных данных /ai/health не проверялось)

## Phase 8: Polish и сквозная проверка

- [X] T037 [P] Документация: `backend/.env.example` (`AI_SETTINGS_KEY`), `backend/README.md`, `docs/offline-check.md` (облако — опция, ключ в БД зашифрован), запись в `spec/README.md`, обновление `spec/004-polza-provider/spec.md` (отметка «ключи в БД — см. 006») [Haiku] — обновлено 2026-10-20
- [X] T038 [P] HTTP-сценарий `scripts/e2e-ai.sh` и ключ `ai` в `backend/scripts/run_frontend_e2e.sh --only ai` (настройки, права, утечка ключа grep'ом по ответам/логам/файлам выгрузок, баннер) [Haiku] — добавлен проверочный сценарий с локальным источником и фиктивным маркером; bash -n прошёл 2026-10-20; сквозной запуск отложен до T040 (не затрагивать активные порты пользователя)
- [X] T039 Ревью безопасности (`security-audit`/`deep-review`): шифрование, утечки ключа во всех каналах, права, SSRF/подмена базового URL (URL провайдера не редактируется из интерфейса), гонка двух админов [Opus] — повторная проверка 2026-10-20: рабочие вызовы и cloud probes атомарно резервируют общий daily cap до HTTP в SQLite/PostgreSQL; probe usage отдельно сохраняется; timeout не отправляет HTTP после ответа `timeout`. Проверенные ключи/PII не попадают в ответы, аудит и промпты. SQLite concurrency проверена; PostgreSQL concurrency-тест не запускался. Найдено ограничение пула: `llm_scope` удерживает request session во время генерации, отчёт генерирует sequentially; follow-up T043.
- [ ] T040 Полный прогон: `cd backend && uv run pytest -q && uv run ruff check .`; `npm run test`; `npm run check` (известный блок prettier на чужих файлах — назвать, не маскировать); `backend/scripts/run_frontend_e2e.sh --only ai`; симулятор не затронут (`src/app/layouts/simulatorBoundary.test.ts`); итог занести с датой и командой [Haiku] — backend `1153 passed, 4 failed, 2 skipped`: 2 известных проверок audio (`test_ready_applicant_audio…[wav/mp3]`), feature-007 `test_dds_exam_timeout_and_no_repeat`, известный `test_release_invariants`; последняя целевая проверка квоты/миграции/API фичи 006: `65 passed`; `ruff check .` прошёл. Полный frontend suite ранее: 6 известных падений (фича 007, IncidentScreen, IncidentJournal); `npm run check` блокируется ESLint-ошибками фичи 007, форматирование затрагивает чужие файлы, Steiger в clone упирался в `EMFILE`. E2E не запустился: sandbox запрещает loopback bind даже на выделенных портах (`operation not permitted`); полный результат не зелёный.
- [ ] T041 Ручная проверка (включает SC-001: ≤ 3 действия и ≤ 1 мин на смену источника и ввод ключа) с реальным ключом по `quickstart.md` шаги 2–6 (владелец вводит ключ; ключ не печатать); результат записать в `quickstart.md`. До выполнения облачный источник честно считается непроверенным [Opus] — live route был подтверждён отдельным тестовым вызовом владельца, но UI-flow и сохранение ключа через браузер не проверены; текущая сборка на 3130 устарела.
- [X] T042 Завершение сессии по `AGENTS.md` §15: `.ai/SESSION_STATE.md`, `.ai/SESSIONS.md`, уроки в `.ai/LESSONS.md` (формат DenseCode) [Haiku] — snapshot, append-only handoff и урок L016 обновлены 2026-10-20
- [ ] T043 [P] Сократить удержание DB connection во время LLM I/O: отделить создание отчётного контекста и запись health/audit от долгих вызовов модели, сохранив атомарность операций; добавить тест параллельных отчётов при ограниченном пуле [Haiku]

## Зависимости

- T035 (проверка `файл:строка` аудита) выполнять до T033.
- T003 подтверждает форму маршрута и снимает стопор облака; T002 — решение владельца по принципу I.
- Phase 2 (T004–T012) блокирует все истории; внутри: T004→T005, T006 независим, T007→T008, T009→T010, T011→T012; T008, T010, T012 связаны (T010 использует T008, T012 использует T010).
- US1 (Phase 3) — MVP; US2 после T014; US3 после T012 (и T014 для маршрутов); US4 после T010 и T012; US5 после T023 и T017.
- Фронтовые задачи [Sonnet] идут после соответствующего контракта бэкенда, тесты-красные — раньше кода.

## Параллельность

- Foundational: T004, T006, T007, T009, T011 (тесты и модели) стартуют вместе.
- US1: T013, T015, T016 параллельно; US2: T019 с US1-фронтом; US3: T022, T024; US4: T027, T030, T032.
- Разные истории US2/US3/US4 можно вести разными субагентами после Phase 2, если они не правят одни файлы (общий `ai_settings.py` — T014→T020→T023 последовательно).

## Стратегия

1. **MVP** = Phase 1–3 (US1): настройка и зашифрованный ключ работают, источник применяется без перезапуска.
2. Затем US3 (баннер и запасной путь) — без него сбои скрыты, потом US2, US4, US5.
3. Облачный маршрут закреплён после T003; поведение по умолчанию остаётся локальным.
4. Каждую задачу отдавать субагенту указанной модели с точными путями и ссылкой на `data-model.md`/контракт; перед `[X]` — мой просмотр диффа и прогон тестов.
