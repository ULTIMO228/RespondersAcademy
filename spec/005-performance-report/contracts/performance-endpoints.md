# Контракт 005 — `/api/v1/performance/*`

| Метод и путь | Роли | Назначение | Коды |
|---|---|---|---|
| `GET /performance/report` | teacher\*, admin | Вся сводка для экрана: итого, группы, обучающиеся, топ ошибок | 200, 400, 401, 403, 404 |
| `GET /performance/export.xlsx` | teacher\*, admin | Те же данные в Excel (`attachment`) | 200, 400, 401, 403, 404 |
| `GET /performance/export.pdf` | teacher\*, admin | Краткая сводка для печати (`inline`) | 200, 400, 401, 403, 404 |

Параметры query (общие): `mode` (`all` по умолчанию | `dds` | `operator112`), `period` (`1m` по умолчанию | `2w` | `all` | `range`), `from` и `to` (`YYYY-MM-DD`, обязательны и допустимы только при `period=range`, `from ≤ to`), `groupId` (одна группа).

\*teacher — только группы из `assigned_groups`; чужая группа — 403, несуществующая — 404; student — 403; без сессии — 401. Неверное значение параметра — 400 `validationFailed`. Ответы отдаются с `Cache-Control: no-store`.

Формы ответа — `data-model.md`. Excel: листы «Сводка», «Группы», «Обучающиеся», «Ошибки», «Параметры» (период, режим, дата, кто сформировал).
