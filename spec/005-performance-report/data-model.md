# Модель данных 005 — Сводная успеваемость

Новых таблиц нет: расчёт на чтении по `attempts`, `evaluations`, `teacher_overrides`, `sessions`, `users`.

## Что считается попыткой

Попытка с оценкой (`Attempt` ⋈ `Evaluation`) за период по `Evaluation.generated_at` и режиму. Итоговый балл — `Evaluation.total_score`, а если есть правка преподавателя — последний `TeacherOverride.score` (как `effective_score` в отчёте занятия).

## Показатели `PerformanceStats` (один и тот же набор на трёх уровнях)

| Поле | Тип | Правило |
|---|---|---|
| `students` | int | обучающихся в охвате (все в группе/организации, даже без попыток) |
| `activeStudents` | int | из них с ≥ 1 попыткой за период |
| `attempts` | int | оценённых попыток |
| `avgScore` | number \| null | среднее итоговых баллов, 1 знак; `null`, если попыток меньше минимума |
| `previousAvgScore` | number \| null | среднее за равный предыдущий период (для `2w`, `1m`, диапазона дат); `null` для `all` или без попыток |
| `delta` | number \| null | `avgScore − previousAvgScore` |
| `reactionInNormShare` | number \| null | доля измеренных реакций ≤ норматива (30 с по умолчанию); `null` при нехватке попыток |
| `processingInNormShare` | number \| null | доля измеренных отработок ≤ норматива (3 мин по умолчанию) |
| `exams` / `examsPassed` | int | попытки в занятиях формата `exam` и из них сданные (балл ≥ `exam.passThreshold`) |
| `weakStage` | string \| null | этап (название из карты ошибок) с наибольшим числом попыток с ошибкой; `null` при нехватке данных или без ошибок |
| `level` | `ok` \| `risk` \| `noData` | `noData` — попыток меньше минимума; `risk` — `avgScore` < порога риска; иначе `ok` |

Измеренная реакция — `primary_reaction_ms > 0`; измеренная отработка — `completed_at` задан и `full_processing_ms > 0`. Нормативы берутся по умолчанию (30 с / 3 мин, `TimeNorms`), а не по сценарию: в сводке сравнивается весь поток, а точные нормативы сценария видны в отчёте занятия.

Пороги (константы, позже — раздел настроек): минимум попыток обучающегося 3, группы и организации 5, порог риска 60 баллов.

## Ответ `PerformanceReport`

`{ filters, generatedAt, thresholds, totals: PerformanceStats, groups: [{ groupId, title, stats }], students: [{ studentId, name, groupId, stats }], topErrors: [{ label, attempts }] }`

- `filters`: `mode` (`all` | `dds` | `operator112`), `period` (`2w` | `1m` | `all` | `range`), `from`/`to` (даты `YYYY-MM-DD`, только для `range`), `groupId` (необязательно).
- Группы и обучающиеся — по возрастанию названия/ФИО; без группы — «Без группы» (видна только администратору).
- `topErrors` — до 5 формулировок правил простыми словами (как в карте ошибок), по числу попыток с этой ошибкой.

## Охват по роли

teacher — группы из `assigned_groups`; admin — все группы и «Без группы»; student — отказ.
