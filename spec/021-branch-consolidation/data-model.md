# Data Model: поэтапное сведение веток (021)

Сущности процесса, а не продукта. Хранятся в `merge-journal.md` этой папки.

## Ветка-источник

| Поле | Значение |
|---|---|
| name | имя на origin |
| tip | хеш вершины на момент замера (F0); перед каждым шагом сверяется с `git rev-parse origin/<name>` |
| authors | авторы коммитов `origin/main..tip` |
| alias_of | имя ветки с той же вершиной (`kind-goldberg` → `feat/011-dds-card-feed`, `practical-hawking` → `feature/scenario-graph-builder`) |

Замер 2026-10-20: `SASHA` ad5e271, `develop` db44740, `feat/011-dds-sasha` ada3e78, `feat/011-dds-card-feed` 32e2160,
`fix/ai-connection-probe-timeout` 5e309ef, `codex/feature-007-learner-role-split` 971261d,
`feature/scenario-graph-builder` cdef678, `claude/gracious-darwin-x0znyd` 8c992c6, `claude/zealous-goldberg-mu6erp` ce6c3dd,
`claude/optimistic-maxwell-wxwdzs` d9782c6, `main` ba1f7d8.

## Кусок (K0–K12)

| Поле | Правило |
|---|---|
| id | K0…K12 (spec.md, таблица «Куски») |
| source | ветка или диапазон `A..B` |
| commits | список хешей; объединение по всем кускам = все не-merge коммиты `origin/* ^origin/main` (SC-001) |
| features | папки спек (прежние номера) |
| migrations | ревизии alembic |
| verdict | `взять` · `уже содержится в Kx` · `взять частично` · `отложить` · `решение владельца` |
| depends_on | куски, которые должны быть влиты раньше |
| step | F1…F7 или `—` |

Переходы: `разобран` → `влит` (merge-коммит есть, быстрый гейт записан) → `проверен` (гейт кластера);
или `разобран` → `откатан` (revert, причина) → `разобран`.

Вердикты 2026-10-20: K1–K4, K7–K11 — взять; K5, K6 — уже содержится в K4 (подтвердить в F4);
K12 — решение владельца (В4); K0 — уже в main.

## Пересечение

| Поле | Правило |
|---|---|
| id | P1…P5 |
| kind | `данные` (решается до куска) · `интерфейс` (вливаются обе стороны) · `внутреннее` (решает интегратор) |
| pieces | куски-участники |
| options | варианты и что теряется |
| decision | решение, кто принял и когда |

- P1 модель специализации: K2 и K7, `данные`, В1.
- P2 конструктор: K10 и K11, `интерфейс`, В3.
- P3 сводка по обучающимся: K2 и K7, `интерфейс`, В3.
- P4 окно 112 (удаления и переименование группы роутов): K3 и K7–K9, `внутреннее`, R6.
- P5 слот simulator-bar: K3 и K4, `внутреннее`, R7.

## Фича

| Поле | Правило |
|---|---|
| old_dir / new_dir | `research.md` R2; номер уникален в итоговом дереве (SC-004) |
| source_branch | ветка |
| tasks_status | `[X]` / `[ ]` из `tasks.md` на момент слияния, без пересчёта задним числом |

## Запись журнала

Формат — [contracts/merge-journal.md](contracts/merge-journal.md).
