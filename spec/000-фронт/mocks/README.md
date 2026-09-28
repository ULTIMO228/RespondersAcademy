# spec/000-фронт/mocks/ — мок-данные тестового фронта

Все данные **синтетические и обезличенные** (Q&A в10 разрешает показ обезличенных данных; ФИО и телефоны вымышленные). Норматив — `hack/Фронт/МОКИ-ДАННЫЕ.md`; модели — `spec/000-фронт/05-data-models.md`.

## Файлы

| Файл | Содержание | Модель |
|---|---|---|
| `users.json` | 24 учётки (u-001..u-024): 1 admin + 3 teacher + 20 student; схема `User` с `isActive`/`armNumber` (один студент заблокирован — демо отказа входа). Логины/пароли тестовые | `User` |
| `reference.json` | 7 нормативных справочников (МОКИ-ДАННЫЕ п. 1.2): `ddsStatuses`, `serviceStatuses`, `callerStatuses`, `channels`, `services` (68 служб с `classifierName`-маппингом на имена `classifier.json`), `incidentGroups` (105 групп), `classifierRows`; плюс расширения тренажёра: `cardStatuses`, `districts`, `sources`, `internalNumbers` (учебные номера 101–104, точка C — 301–303) | `ReferenceData` |
| `classifier.json` | Классификатор ЕКП: 1283 записи, 105 групп, версия v.046_24 (корректировка МВД + Департамент). Извлечён из xlsx заказчика скриптом `_tools/parse_classifier.py` | `ClassifierEntry` |
| `cards.json` | 96 учебных карточек из 32 билетов × 3 ситуации (c-001..c-096; id = билет.ситуация: c-095 = 32.2). `expectedServices`/`expectedTags` — экспертная разметка по ЕКП | `IncidentCard` |
| `scenarios.json` | 36 сценариев: s-001..s-032 по билетам + s-033..s-036 advanced-вариации; эталоны, подсказки, критерии успешности, статусы валидации (approved/pending/rejected — workflow преподавателя) | `Scenario` |
| `sessions.json` | 2 занятия (завершённое + идущее) по групповому канону ТЗ §10: `cardEvents` с `primaryReactionMs`/`fullProcessingMs`, `statuses[].dutyNumber`, `servicesCalled` | `Session`, `CardEvent` |
| `reports.json` | 3 отчёта по студентам завершённого занятия + `groupReport`; графики `charts`: `byStage`/`byErrorType`/`dynamics` | `SessionReport` |
| `fixtures/arm-cards.json` | 12 UI-фикстур рабочей карточки ПОВ-112 (id вида `card-*`) для экранов `/arm` | `IncidentCard` |
| `_tools/` | `parse_classifier.py` — регенерация classifier.json; `validate_mocks.py` — валидация моков (см. ниже) | — |

Замечание по ссылкам: `sessions.json` и `reports.json` пока ссылаются на id прежнего формата (`card-*`, `scn-*`, `u-student-*` — см. `meta.note` в `sessions.json`); карточки `card-*` резолвятся через `fixtures/arm-cards.json`. Учебный датасет для новых занятий — `cards.json` (c-001..c-096) + `scenarios.json` (s-001..s-036).

## Подключение в Next.js

Вариант по умолчанию (`03-architecture.md`): скопировать файлы в приложение и раздавать через Route Handlers `app/api/mock/*/route.ts` с фильтрами/пагинацией. Замена на реальный бэкенд — только смена реализации data-access слоя, контракты не меняются.

Пример route handler:

```ts
// app/api/mock/cards/route.ts
import cards from '@/mocks/cards.json';
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  let list = cards.cards;
  const group = q.get('group'); // группа ЕКП из classifier.json
  if (group) list = list.filter(c => c.group === group);
  return Response.json(list);
}
```

## Инструменты (_tools/)

```bash
python3 spec/000-фронт/mocks/_tools/parse_classifier.py   # xlsx заказчика (v_046_24) → classifier.json
python3 spec/000-фронт/mocks/_tools/validate_mocks.py     # валидация JSON + перекрёстных ссылок
```

`parse_classifier.py` — только stdlib (xlsx = zip + XML), читает `hack/Фронт/Источники/Классификатор_происшествий_v_046_24_корректировка_МВД_+_Департамент.xlsx` и перезаписывает `classifier.json`. Пути захардкожены — поправить при переносе.

`validate_mocks.py` проверяет все 8 файлов: JSON-синтаксис, перекрёстные ссылки между коллекциями, доменные правила (последовательность статусов, обязательность комментариев, нормативные объёмы). Прогон из корня репо должен завершаться `PASS` (exit 0).

## Соглашения

- Даты: ISO 8601 с московским смещением (`+03:00`).
- id-форматы: пользователи `u-XXX`, учебные карточки `c-XXX`, сценарии `s-XXX`; UI-фикстуры рабочей карточки — формат `card-*` (fixtures/arm-cards.json).
- Статусы — только значения из `reference.json`: `ddsStatuses` (реагирование ДДС), `serviceStatuses` (статусы служб), `cardStatuses` (карточка).
- Привязка к ЕКП: `cards.json` — поле `group` → `classifier.json → entries[].group`; фикстуры — `what.classifierCode` → `entries[].code`.
- Контент с пометкой «ИИ» (оценки, инсайты, реплики абонента) — имитация; в UI показывать бейдж «ИИ» (`07-design-guidelines.md`).
