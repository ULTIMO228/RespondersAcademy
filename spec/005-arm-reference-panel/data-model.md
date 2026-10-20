# Data Model: Справочник в АРМ (005)

## 1. Статья справочника — без изменений
`KbArticle { id, group, title, sections: { signs[], notification[], clarify[], ddsDecision[], typicalErrors[] }, updatedBy?, updatedAt? }` — таблица `kb_articles`, 105 строк. Фича только читает.

## 2. Параметр задания `referenceAllowed` (новый ключ `Assignment.params`)

| Поле | Тип | Правило |
|---|---|---|
| `params.referenceAllowed` | `boolean` | Необязательно во входе. Если не задан — по формату: `training → true`, `exam → false`. Сервер записывает итоговое значение явно. |

Эффективное значение для старых заданий без ключа: `params.get("referenceAllowed", format == "training")`.

## 3. Замок справочника (вычисляемый, не хранится)

```
ReferenceAccess { allowed: boolean; assignmentId?: string; message?: string }
```

`allowed = false`, если у обучающегося есть `AssignmentAttempt` со `state ∈ {ringing, answered}`, задание `state = active` и эффективный `referenceAllowed = false` (после `_expire` для экзаменов с лимитом времени). Для ролей `teacher`/`admin` — всегда `allowed = true`.

Переходы: попытка открыта (`ringing`/`answered`) → замок; `submitted` / `notCompleted` / задание `finished` → замка нет.

## 4. Результат поиска (клиент)

```
KbSearchHit { article: KbArticle; score: number; matchedStems: string[] }
```

Нормализация: нижний регистр, `ё→е`; слова < 3 букв отбрасываются; основа — слово без типового окончания (не короче 3 букв). Вес: название 3, группа 2, тезис 1; в выдаче — статьи, где найдены все основы запроса; сортировка по `score` ↓, затем по названию.
