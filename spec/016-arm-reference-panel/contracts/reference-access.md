# Контракты: Справочник в АРМ (016)

Все пути — под `/api/v1`, требуют сессию (иначе 401 `unauthorized`).

## GET /me/reference-access (новый)

Доступен любой роли.

```json
200 { "allowed": true }
200 { "allowed": false, "assignmentId": "asg-007", "message": "Справочник недоступен в этом задании" }
```

TS: `ReferenceAccess` в `src/shared/api/types/kb.ts`; Pydantic — `app/schemas/v1/lobby.py`.

## GET /kb/articles, GET /kb/articles/{id} (изменение)

Для обучающегося с замком (см. data-model §3):

```json
403 { "error": { "code": "forbidden", "message": "Справочник недоступен в этом задании" } }
```

Без замка, а также для преподавателя и администратора — как раньше.

## POST /assignments (изменение)

`params.referenceAllowed?: boolean`. Ответ всегда содержит итоговое значение: если не передано — `true` для `training`, `false` для `exam`. Нелогическое значение → 400 `validationFailed` «Параметр «Справочник доступен» — да или нет». Запись аудита `assignment.create` содержит «справочник: доступен|недоступен».

TS: `AssignmentParams.referenceAllowed?: boolean` (`src/shared/api/types/assignments.ts`).

## UI-контракт

- `widgets/simulator-bar`: кнопка «Справочник» (`aria-expanded`, `aria-controls`), видна, только если `allowed`.
- `features/arm-reference`: `ReferencePanel { open, onClose, initialQuery?, initialArticleId? }`; поле поиска, список результатов с подсветкой (`<mark>`), статья тезисами, кнопка «Открыть в новом окне».
- Роут `/arm/reference-window?q=&article=` — только поиск и статья.
