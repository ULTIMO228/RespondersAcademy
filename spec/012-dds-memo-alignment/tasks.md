# Задачи фичи 012 — диспетчер ДДС по памятке

- [X] T001 Оценщик: `dispatcherAction` / `outfitNumber` закрываются комментарием и номером наряда статуса (FR-003) — `backend/ml/assess/components/fields.py`, фронтовый мок-оценщик
- [X] T002 Эталоны 36 сценариев без `call:101…104`, `transfer:*` и чужих ключевых фраз (FR-004) — `spec/000-фронт/mocks/scenarios.json`, синк, сид
- [X] T003 Доклад точке C необязателен (FR-005)
- [X] T004 Софтфон без «Ожидается по эталону» (FR-006) — `src/features/call-control`
- [X] T005 Карточка ДДС без «Действия диспетчера», наряда в теле, «Отработок», таймера (FR-001) — `src/widgets/incident-card`
- [ ] T006 Нормативы в полосе тренажёра (FR-002) — `src/widgets/simulator-bar`, `src/pages/incident`
- [ ] T007 Своя служба = служба обучающегося (FR-007) — `src/pages/incident/lib/cardView.ts`, `src/widgets/incident-list/lib/mapContext.ts`
- [ ] T008 Проверки (pytest, ruff, vitest, tsc, steiger) и проход в браузере (SC-001…SC-004)

## Состояние 2026-10-20

Сделаны T001–T005 (pytest 1135 passed/4 skipped; vitest затронутых каталогов зелёный; tsc, eslint, prettier, steiger, ruff чисто).
Не сделаны: T006 (нормативы в полосу тренажёра — таймер пока в шапке карточки), T007 (своя служба), T008 (браузер).
