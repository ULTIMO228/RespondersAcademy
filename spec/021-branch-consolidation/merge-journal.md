# Журнал слияния (021)

Формат — [contracts/merge-journal.md](contracts/merge-journal.md). Только дописывать.

## Шапка

- Интеграционная ветка: `merge/021-branch-consolidation`, worktree `../RespondersAcademy-merge`
- База: `origin/main` `ba1f7d8` (2026-10-20)
- Вершины на старте (2026-10-20, после `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`):
  SASHA `ad5e271` · develop `db44740` · feat/011-dds-sasha `ada3e78` · feat/011-dds-card-feed `32e2160` ·
  fix/ai-connection-probe-timeout `5e309ef` · codex/feature-007-learner-role-split `971261d` ·
  feature/scenario-graph-builder `cdef678` · claude/gracious-darwin-x0znyd `8c992c6` ·
  claude/zealous-goldberg-mu6erp `ce6c3dd` · claude/optimistic-maxwell-wxwdzs `9924210` (K12, сдвинулась с `d9782c6`:
  `9924210` «папка presa с презентацией…»; не вливается, Q3)
- Решения перед стартом: В1 → `specializations`; В2 → внешнее только опцией, выключено по умолчанию; коммиты в
  интеграционной ветке разрешены владельцем; push и main — нет (spec.md, Clarifications)
- ⚠️ main `ba1f7d8`: имя pptx в коммите хранится в NFD, при `core.precomposeunicode=true` git показывает файл как
  неотслеживаемый `??`. Особенность main, на слияние не влияет; файл не стейджить
- Окружение: Node 24.15.0, next 16.3.5, `node_modules` — APFS-клон из основного дерева (`package.json`/lock ни одна
  ветка не меняет — проверено `git diff origin/main...<ветка>` по всем 12), `uv sync --group dev`

## T007 — карта «коммит → кусок» (2026-10-20)

Диапазоны: K1 `develop ^main` · K2 `d0c9d2f ^develop ^main` · K3 `SASHA ^d0c9d2f` · K4 `feat/011-dds-sasha ^d0c9d2f` · K5 `feat/011-dds-card-feed ^develop` · K6 `zealous-goldberg ^main` · K7 `7fb9013 ^main` · K8 `codex ^7fb9013` · K9 `fix ^7fb9013` · K10 `gracious-darwin ^main` · K11 `scenario-graph-builder ^main` · K12 `optimistic-maxwell ^main`

Полнота ✅: сумма по кускам 128 = уникальных 128 = `git rev-list --no-merges --count <все ветки origin> ^origin/main` 128 (127 на замере спеки + `9924210` в K12).

| Кусок | Не-merge | Коммиты |
|---|---|---|
| K1 | 25 | db44740 09c02e3 0cbcf90 f843729 766e7a0 8782b21 b4ffdd3 8bc369e 6ba71d5 08ac459 5eb9816 cb9531b 0cf776b ffb6e63 67e26fe 13c970d dd8048b 2de1135 d82045f 751b9fa a1375a9 2719d8d 820ae3c 3720f58 a4d46d7 |
| K2 | 17 | d0c9d2f 7edccf6 4e16680 cba2b3e 15f20fc 5c0f770 4517486 eb3208e 8862034 fa6d6fb e078add bdc331d 8d8b4f7 aaea013 98705b7 5d6bb33 dfb7d3a |
| K3 | 26 | 623bdc6 54a4537 285fda4 d9ca9ae baf328a 95fb45c 7cd2caf 16ab893 a2dfd45 8878cd6 ecd1568 889a31b da634ac 5073abf 600a0fa 2c05070 27f56cf 78c969f 858d743 87d63c3 9f50e2d 9929614 738b57e 5affa4d b9c3443 9c62e27 |
| K4 | 8 | ada3e78 a71f14d da1e96f d35871b f6af6e0 d9ce4da 57061d8 f219be2 |
| K5 | 3 | 32e2160 50be798 150d786 |
| K6 | 1 | ce6c3dd |
| K7 | 9 | 7fb9013 5812755 31c9387 8b3189a bd29eae 3eb6e2a de69c7f 4fc8ff8 28a48c4 |
| K8 | 1 | 971261d |
| K9 | 7 | 5e309ef 4424196 75936ee a74070c 30dfc2c 79cba68 3e8509b |
| K10 | 4 | 8c992c6 c2ecd7c 640bca3 a79cff0 |
| K11 | 24 | cdef678 fc53460 87aab7f 925ad9a 2e588a0 26b8a28 9179f33 e7d35ae 83299ee ee02195 052342e c23629b 8b031fa 097e58b 74a8653 2354745 658d56c 1316e87 7bed9d3 9d3eba9 a2671e8 8594a92 d3d7caf 936b7c4 |
| K12 | 3 | 9924210 d9782c6 5225c83 |

## T008 — разбор сплющенного `98705b7` (aleksandraneev, 2026-10-20 15:16, 182 файла)

Команда: `git show --name-status 98705b7`. Принадлежность файлов по каталогам и спекам коммита:
- 016 (было 005-arm-reference-panel): `src/features/arm-reference/*` (8 A), `src/widgets/simulator-bar` (1 M), `spec/005-arm-reference-panel` (8 A)
- 017 (было 006-student-rating): `backend/app/api/v1/student_rating.py` (A), `src/pages/teacher/rating/*` (7 A), `src/pages/teacher-dashboard` (4 M), часть `backend/app/services` (12 M / 3 A)
- 018 (было 008-operator112-student): `backend/alembic/versions/0006_user_training_profile.py`, `backend/app/models` (user), `backend/app/seed`, `src/features/assignment-create` (15 M), `src/pages/admin-users` (4 M), `src/shared/api` (13 M / 2 A)
- 007, 009, 010: только спеки (2 A каждая), кода в этом коммите нет
- ⚠️ Удаления, которые надо учесть в F5 (P4): `backend/scripts/seed_chain_demo.py` (фикстура цепочки A→B, `AGENTS.md` §3 T031), `backend/tests/integration/{test_ai_chain,test_seed_chain_demo}.py`, `e2e/two-mode-full-path.spec.ts`. Цепочка A→B в 018 переосмыслена (ivanov — только 112); при слиянии seva проверить, покрыт ли сценарий A→B другим тестом (лента 011 `student_cards`), иначе — записать как сознательно снятый
- Перепроверено интегратором: 3 файла (`0006_user_training_profile.py`, `student_rating.py`, `src/pages/teacher/rating/index.ts`) действительно добавлены этим коммитом

## T006 — сеть по умолчанию (В2), 2026-10-20

Источник: субагент Sonnet (read-only), перепроверено интегратором `git show origin/<ветка>:backend/app/config.py`.
- develop/SASHA: `AI_PROVIDER=local` (config.py:33), `POLZA_MODEL=None` (:37), `LIVE_CALLS_ENABLED=False` (:46), `SPEECHKIT_API_KEY=None` (:87); grpc/yandexcloud импортируются лениво; веса GigaAM качаются только при `LIVE_CALLS_ENABLED` + `LIVE_CALL_STT_ENGINE=gigaam` + extra `stt-local` → **сети без явного включения нет** ✅
- fix (006/010): ключ облака — шифртекстом в `ai_settings`, `source` по умолчанию `local`; `CLOUD_ROUTE_VERIFIED=True` (ai_settings_service.py:31); `CHAT_CLOUD_ENABLED=True` (config.py:43) — чат уходит в облако, только если администратор выбрал cloud и сохранил ключ → **сети без явного действия нет** ✅
- ⚠️ fix: `POLZA_MODEL` по умолчанию `openai/gpt-4o-mini` (config.py:36), в develop — `None` с обязательной явной моделью. Решить при конфликте `config.py` в F5: оставить требование явной модели, если код 006 не зависит от дефолта
- Фронт: внешних URL нет (`http://arm112.internal` — фиктивный origin для разбора URL)
- Итог: T011 разблокирован. Расхождение с текстом принципа I конституции фиксируется в `AGENTS.md` §2 (T032)

## T009 — сверка K5 → K4 (F4)

- `150d786 → f219be2`: уже содержится; отличия — адаптация под «цепочку A → B» (spec 007 Clarifications 20.10): `issue_submitted_card` без выдачи в идущие занятия ДДС, тест заменён `test_submitted_card_gets_source_etalon_and_is_not_pushed_to_dds_sessions`; поля `scenarioVersions`/`chain` убраны вместе с цепочками. Функциональных потерь нет
- `50be798 → 57061d8`: уже содержится; отличие — только `note` в `spec/000-фронт/mocks/users.json`
- `32e2160 → d9ce4da`: уже содержится; код идентичен, отличие — `.ai/SESSION_STATE.md`
- Вердикт K5: **уже содержится в K4**, не вливается

## T010 — сверка K6 → K4 (F4)

- `ce6c3dd` vs `57061d8`: тот же набор файлов; отличие — расширенная `note` в users.json; u-010 egorov в итоговом дереве `isActive:true` + `trainingProfile:"dds"` (`f6af6e0`). Остальные строки вне `.ai/` присутствуют в `origin/feat/011-dds-sasha`
- Вердикт K6: **уже содержится в K4**, не вливается. ⚠️ `trainingProfile` в моках переводится на `specializations` в F5 (В1)

## T004 — эталон `origin/main` `ba1f7d8` (2026-10-20)

- lint ✅ · steiger ✅ · test 234 файла / **1912 passed** ✅ · typecheck ✅ (первый прогон до `mocks:sync` — TS2307 на `@mocks/*`, артефакт порядка; порядок гейта исправлен в quickstart) · ruff ✅
- pytest: **911 passed / 3 failed / 2 skipped** (110 с). Красные (известный долг, `AGENTS.md` §3):
  - `tests/contract/test_v1_operator112.py::test_ready_applicant_audio_is_playable_from_recordings[wav-…]`
  - `tests/contract/test_v1_operator112.py::test_ready_applicant_audio_is_playable_from_recordings[mp3-…]`
  - `tests/unit/test_ai_dataset_build.py::test_release_invariants`

## F1 — K1 develop @ db44740

- Дата: 2026-10-20 · База: `f7f6e8e` · Вершина сверена ✅ · Merge-коммит: `8608bc1`
- Конфликты: 0
- Генерируемые: `uv lock --check` ✅ (lock develop уже согласован), `uv sync --group dev`
- Миграции: голова `0005_error_map_verdicts` (develop миграций не добавляет)
- Быстрый гейт: lint ✅ · steiger ✅ · test **1951 passed** ✅ · typecheck ✅ · pytest **1033 passed / 0 failed / 4 skipped** ✅ · ruff ✅
- Красные: нет — 3 красных эталона main починены коммитом `3720f58` из K1
- Итог: влит
