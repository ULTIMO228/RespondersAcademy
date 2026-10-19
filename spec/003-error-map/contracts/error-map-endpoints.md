# Контракт: эндпоинты карты ошибок (`/api/v1/error-map/*`)

Формы ответов — Pydantic в camelCase (`backend/app/schemas/error_map.py`) 1:1 с TS-типами `src/shared/api/types/error-map.ts`; сверка — `backend/scripts/extract_ts_fields.py` → `tests/contract/expected_fields.json`. Режим всегда `operator112 | dds`. Все эндпоинты требуют сессию (cookie `arm112_session`); ошибки — в общей форме `app/api/errors.py` (на русском).

## Общие параметры запроса

| Параметр | Значения | По умолчанию | Примечание |
|---|---|---|---|
| `mode` | `dds`, `operator112` | `dds` | Определяет набор этапов |
| `period` | `2w`, `1m`, `all` | `1m` | От текущей даты по московскому времени |

## Эндпоинты

| Метод и путь | Роль | Назначение | Коды |
|---|---|---|---|
| `GET /error-map/groups` | teacher, admin | Группы, доступные пользователю (для выбора) | 200, 401 |
| `GET /error-map/groups/{groupId}` | teacher*, admin | Карта группы: этапы, уровни, вывод | 200, 401, 403, 404 |
| `GET /error-map/groups/{groupId}/stages/{stageId}` | teacher*, admin | Разбор этапа: типовые ошибки, кто ошибается, пример, статья, цепочка, ИИ-пояснение | 200, 401, 403, 404 |
| `GET /error-map/groups/{groupId}/journal` | teacher*, admin | Журнал: обучающиеся × этапы | 200, 401, 403, 404 |
| `GET /error-map/students/{studentId}` | teacher*, admin | Карта обучающегося с сравнением «лучше / как у группы / хуже» | 200, 401, 403, 404 |
| `GET /error-map/students/{studentId}/stages/{stageId}` | teacher*, admin | Разбор этапа для обучающегося | 200, 401, 403, 404 |
| `PUT /error-map/verdicts` | teacher*, admin | Сохранить вердикт «Согласен / Не согласен» | 200, 400, 401, 403 |
| `GET /error-map/export.pdf` | teacher*, admin | PDF карты или журнала (`scope=group\|student\|journal`, `groupId` или `studentId`, `mode`, `period`) | 200, 400, 401, 403, 404 |
| `GET /me/focus` | student | «Над чем поработать»: до трёх этапов обучающегося | 200, 401, 403 |
| `GET /error-map/settings` | admin | Пороги светофора | 200, 401, 403 |
| `PUT /error-map/settings` | admin | Изменить пороги (в аудит) | 200, 400, 401, 403 |

PDF отдаётся с `Content-Disposition: inline` и `Cache-Control: no-store`: открывается во вкладке просмотра PDF, откуда печатается или сохраняется; `scope=student` требует `studentId`, `group` и `journal` — `groupId` (иначе 400).

`teacher*` — только свои группы (см. «Права»). Путь `/me/focus` лежит рядом с остальными `/me*` обучающегося.

## Формы ответов (TS-эскиз)

```ts
type ErrorMapMode = "operator112" | "dds";
type ErrorMapPeriod = "2w" | "1m" | "all";
type StageLevelWord = "rare" | "sometimes" | "often" | "noData";
type StageComparison = "better" | "same" | "worse";

interface ErrorMapGroup { groupId: string; title: string; studentCount: number }   // ответ GET /error-map/groups: ErrorMapGroup[]

interface ErrorMapStage { id: string; order: number; title: string; articleId?: string }

interface ErrorMapStageLevel {
  stageId: string;
  attempts: number;
  attemptsWithError: number;
  share: number | null;          // null при noData
  level: StageLevelWord;
  comparison?: StageComparison;  // только для карты обучающегося
  affectedStudents: number;
}

interface ErrorMapHeadline { kind: "problems" | "clean" | "noData"; stageIds: string[]; text: string }

interface ErrorMapResponse {
  scope: { kind: "group" | "student"; groupId: string; studentId?: string; title: string };
  mode: ErrorMapMode;
  period: ErrorMapPeriod;
  attempts: number;
  stages: ErrorMapStage[];          // включая "other", если на нём есть ошибки
  levels: ErrorMapStageLevel[];
  headline: ErrorMapHeadline;
  generatedAt: string;              // ISO 8601, МСК
}

interface ErrorMapTypicalError {
  ruleId: string; plainText: string; severity: "critical" | "major" | "minor";
  studentCount: number; students: { id: string; name: string }[];
  exampleAttemptId?: string; exampleSessionId?: string;
}

interface ErrorMapChainLink { from: string; to: string; caption: string }

interface ErrorMapExplanation {
  text: string;                     // 1–2 фразы
  source: "ai" | "template";        // "ai" → бейдж «ИИ»; "template" → «справочное пояснение»
  textHash: string;
  verdict?: "agree" | "disagree";   // текущий вердикт этого преподавателя
}

interface ErrorMapStageDetail {
  stage: ErrorMapStage;
  level: ErrorMapStageLevel;
  typicalErrors: ErrorMapTypicalError[];   // ≤ 3
  chain: ErrorMapChainLink[];              // связи, исходящие из этапа
  explanation: ErrorMapExplanation | null; // null при noData
}

interface ErrorMapJournalResponse {
  mode: ErrorMapMode; period: ErrorMapPeriod; groupId: string;
  stages: ErrorMapStage[];
  rows: { studentId: string; name: string; attempts: number; levels: ErrorMapStageLevel[] }[];
}

interface ErrorMapVerdictRequest {
  groupId: string; studentId?: string; mode: ErrorMapMode; period: ErrorMapPeriod;
  stageId: string; textHash: string; source: "ai" | "template"; verdict: "agree" | "disagree";
}

interface MyFocusResponse {
  mode: ErrorMapMode | null;
  items: { stageId: string; title: string; hint: string; articleId?: string }[]; // ≤ 3
  message?: string;   // «Пока замечаний нет» / «Пройдите ещё несколько тренировок…»
}

interface ErrorMapSettings {
  sometimesFrom: number; oftenFrom: number;
  minAttemptsGroup: number; minAttemptsStudent: number; sameBandPoints: number;
}
```

## Права (FR-028)

| Роль | Правило | Нарушение |
|---|---|---|
| teacher | Группа доступна, если она закреплена за преподавателем (`assigned_groups`; правило уточняется по сидам — `research.md` R4); обучающийся — если его группа доступна | 403 «Нет доступа к группе / обучающемуся» |
| admin | Через API видит все группы и обучающихся (только чтение) и меняет пороги светофора; экранов карты для администратора в версии 1 нет (FR-028) | — |
| student | Только `GET /me/focus`; все остальные эндпоинты карты — 403 | 403 |
| не авторизован | — | 401 |

В ответе `GET /me/focus` нет данных группы и имён других людей (FR-020). Несуществующие `groupId`/`studentId`/`stageId` — 404; неизвестный `mode`/`period` — 400.

## Аудит (FR-029)

| Действие | Когда | Содержимое `details` |
|---|---|---|
| `error_map.verdict` | `PUT /verdicts` | Группа, обучающийся (если есть), этап, источник текста, вердикт |
| `error_map.settings` | `PUT /settings` | Старые и новые пороги |

Создание задания из карты отдельного аудита не требует (действие `error_map.assign` не вводится, решение D10 в `research.md`): его фиксирует существующее действие `assignment.create` (`backend/app/services/assignment_service.py:153`); мастер получает название вида «Тренировка: <этап>», по которому видно происхождение задания. Вердикт без `studentId` хранится с пустым `student_id` (`''`).

## Совместимость

Существующие контракты `src/shared/api/types/*` и `compat`-эндпоинты не меняются; добавляются новые файл типов `error-map.ts` и экспорт в `types/index.ts`. Метод шлюза `explain_stage` добавляется в Protocol как необязательный (реализация по умолчанию возвращает `None`), чтобы не ломать подмену через `set_gateway()`.

## Автономный режим фронта

Пути `/api/v1/error-map/*` и `/api/v1/me/focus` вне `ai/*`: при отсутствии бэкенда клиент переходит в состояние «требуется сервер» (T007), как страницы `/teacher/groups`. Решение D2 в `plan.md`.
