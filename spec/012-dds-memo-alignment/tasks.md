# Задачи фичи 012 — диспетчер ДДС по памятке

- [X] T001 Оценщик: `dispatcherAction` / `outfitNumber` закрываются комментарием и номером наряда статуса (FR-003) — `backend/ml/assess/components/fields.py`, фронтовый мок-оценщик
- [X] T002 Эталоны 36 сценариев без `call:101…104`, `transfer:*` и чужих ключевых фраз (FR-004) — `spec/000-фронт/mocks/scenarios.json`, синк, сид
- [X] T003 Доклад точке C необязателен (FR-005)
- [X] T004 Софтфон без «Ожидается по эталону» (FR-006) — `src/features/call-control`
- [X] T005 Карточка ДДС без «Действия диспетчера», наряда в теле, «Отработок», таймера (FR-001) — `src/widgets/incident-card`
- [X] T006 Нормативы в полосе тренажёра (FR-002) — `src/widgets/simulator-bar`, `src/pages/incident`
- [X] T007 Своя служба = служба обучающегося (FR-007) — `src/pages/incident/lib/cardView.ts`, `src/widgets/incident-list/lib/mapContext.ts`
- [X] T008 Проверки (pytest, ruff, vitest, tsc, steiger) и проход в браузере (SC-001…SC-004)

## Состояние 2026-10-20 (вечер)

Сделаны T001–T008.

- T006: `showTimer` у `IncidentCardView`/`CardHeader` (у обучающегося `false`, зеркало преподавателя и предпросмотр редактора —
  по умолчанию с таймером); слот `data-simulator-bar-slot` в `SimulatorBar` + `SimulatorBarSlot` (портал);
  `pages/incident/ui/TrainerNorms` — «Реакция … · норматив 0:30», «Отработка … · норматив 3:00» (токены `--color-*`).
- T007: `entities/service` `resolveTraineeServiceId` (User.service → `PROFILE_MAPPING_SEED` → первая служба профиля);
  `pickMyServiceId(…, student.service)` + `withMyService` (плитка своей службы первой, если её нет в списке оповещения);
  журнал — `resolveMyServiceId` через тот же резолвер, «Статус службы» своей службы («Добавлена»), а не первой в списке.
- T008 (локально, macOS): `uv run pytest -q` 1135 passed / 4 skipped; `uv run ruff check .` чисто; `npx vitest run`
  2033/2033 (teacher-v1 Blob тоже зелёный); `npx tsc --noEmit`, eslint/prettier изменённых, `npm run steiger` чисто.
  Браузер (`./scripts/demo-up.sh`, свежая demo.db): egorov → «Задания» → «Начать» → c-009: в шапке нет таймера,
  в полосе тренажёра нормативы, карандаш на «Упр. Обручевский»; «Принята» (наряд 17 + комментарий) → Начало реагирования →
  Прибытие → Проведение работ → «Работы завершены»: корректность 100, нет «пропущен звонок 101/103» и «dispatcherAction».

Риски: «Реакция» = openedAt − issuedAt (спека 000), в задании ДДС всегда 0:00 — не время до «Принята» (памятка, 30 с);
грамотность ругает «деблокирован», «убыла» (словарь); petrova в браузере не проходилась (покрыто тестом IncidentScreen).
