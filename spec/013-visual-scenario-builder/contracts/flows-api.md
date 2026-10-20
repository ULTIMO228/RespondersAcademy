# Контракт API: конструктор сценариев (фича 013)

Все пути — под `/api/v1` (бэкенд, `backend/app/api/v1/flows.py`, `flow_runs.py`). Ответы в camelCase; TS-типы — `src/shared/api/types/scenario-flow.ts`. Авторизация — существующая cookie-сессия. Матрица прав — `data-model.md` §8. Ошибки — существующий формат `backend/app/api/errors.py`.

## Каталог блоков

| Метод и путь | Кто | Ответ |
|---|---|---|
| `GET /flow-blocks?mode=dds\|operator112` | teacher, admin | `FlowBlockCatalog` |

```ts
interface FlowBlockCatalog {
  schemaVersion: "flow/1";
  groups: { id: string; title: string }[];                 // «Начало и конец», …
  blocks: {
    type: FlowNodeType; title: string; groupId: string; icon: string; keywords: string[];
    input: boolean;
    outputs: { port: string; title: string; required: boolean }[];
    props: FlowPropSpec[];                                  // поле, подпись, вид контрола, справочник, обязательность, подсказка
    scoring: "check" | "penalty" | "none";
  }[];
  stages: { id: string; title: string }[];                  // этапы режима (error_map_stages)
  dictionaries: Record<string, { value: string; title: string }[]>; // статусы, службы, номера, поля, признаки…
}
```

## Сценарии-схемы

| Метод и путь | Кто | Тело | Ответ | Отказы |
|---|---|---|---|---|
| `GET /flows?scope=mine\|all&status=&q=` | teacher, admin | — | `ScenarioFlowSummary[]` | 403 студент |
| `POST /flows` | teacher | `{ title, mode, description?, difficulty?, copyFrom?: { flowId, version } }` | 201 `ScenarioFlow` (черновик с «Начало» и «Завершение») | 403 студент, админ |
| `GET /flows/{id}` | см. §8 | — | `ScenarioFlow` (с черновиком только для автора и админа) | 404 чужой черновик без версий |
| `PUT /flows/{id}/draft` | автор | `{ revision, graph, title?, description?, difficulty?, categories? }` | `{ revision, savedAt }` | 409 `stale_revision`, 403 не автор, 422 нарушен формат `flow/1` |
| `POST /flows/{id}/validate` | автор, (П/Р/Адм для версии) | `{ graph? , version? }` | `FlowValidationReport` | 403 |
| `POST /flows/{id}/publish` | автор | `{ revision, comment? }` | 201 `ScenarioFlowVersion` (`published` или `review`) | 409 `stale_revision`, 422 `validation_failed` (с отчётом), 409 `review_pending` |
| `POST /flows/{id}/versions/{v}/review` | П, Р, Адм (не автор) | `{ decision: "approve"\|"return", comment }` | `ScenarioFlowVersion` | 403 автор, 409 версия не на согласовании, 422 пустой комментарий при `return` |
| `POST /flows/{id}/versions/{v}/comments` | А, П, Р, Адм | `{ text, nodeId? }` | 201 `FlowComment` | 403 студент |
| `POST /flows/{id}/edit` | автор | — | `ScenarioFlow` (черновик из последней версии) | 409 черновик уже есть |
| `POST /flows/{id}/archive` | автор, админ | — | `ScenarioFlow` | 403 |
| `DELETE /flows/{id}` | автор, админ | — | 204 | 409 есть версии (нужен архив) |
| `GET /flows/{id}/versions/{v}` | все, кроме студента | — | `ScenarioFlowVersion` | 404 |
| `GET /flows/{id}/history` | все, кроме студента | — | `FlowHistoryEntry[]` (из `audit_log`) | 403 |
| `GET /flows/{id}/stats?groupId=&version=` | автор, Р своей группы, админ | — | `FlowStats` | 403 чужая группа |

Аудит (`audit_log.action`): `flow.create`, `flow.save`, `flow.publish`, `flow.review.approve`, `flow.review.return`, `flow.comment`, `flow.edit`, `flow.archive`, `flow.delete`, `flow.copy`. Автосохранение пишет одну запись `flow.save` не чаще раза в 10 минут на автора и сценарий.

## Задания (расширение существующего контракта)

`POST /assignments` принимает необязательное `flowVersions: { flowId: string; version: number }[]`. Задание со схемой не содержит `cardIds` и `randomRule`: карточки создаёт схема. Можно указывать только версии в состоянии `published` и не в архиве (иначе 422). `GET /assignments/{id}` возвращает `flowVersions`. `POST /assignments/{id}/start` для задания со схемой создаёт `FlowRun` и возвращает `flowRunId`.

## Прохождение

| Метод и путь | Кто | Ответ | Отказы |
|---|---|---|---|
| `GET /flow-runs/{runId}` | владелец прохождения; преподаватель задания | `FlowRunState` | 403 чужой студент (с парным 200 для владельца) |
| `POST /flow-runs/{runId}/finish` | владелец | `FlowRunResult` | 409 уже завершено |
| `GET /flow-runs/{runId}/result` | владелец после завершения; преподаватель задания; Р группы; админ | `FlowRunResult` | 403; 409 студенту до завершения |
| `POST /flows/{id}/test-runs` | автор (черновик), П/Р (версия) | 201 `FlowRunState` (`isTest: true`) | 422 есть ошибки проверки |
| `POST /flow-runs/{runId}/test-events` | автор теста | `FlowRunState` | 403 не тестовое прохождение |

```ts
interface FlowRunState {
  id: string; flowId: string; version: number | "draft"; isTest: boolean;
  state: "running" | "finished";
  startedAt: string; deadlineAt?: string;
  cards: { cardRef: string; attemptId?: string; cardId: string }[];
  feed: { at: string; kind: "callerReply" | "briefing" | "hint"; text: string; cardRef?: string }[];
  activeNodeId?: string;          // только в тесте и преподавателю
  trace?: FlowTraceStep[];        // только в тесте и преподавателю
}

interface FlowRunResult {
  runId: string; score: number; passed: boolean; maxPoints: number; earnedPoints: number;
  errors: FlowError[];            // формат — data-model.md §7
  path: string[];                 // id блоков; студенту — только подписи шагов
  finishReason: "end" | "student" | "timeout";
}
```

Студенту `FlowRunState` не содержит `activeNodeId`, `trace`, ожидаемых значений и следующих веток (FR-024; контрактный тест проверяет отсутствие ключей).
