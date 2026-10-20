# Data Model: Рейтинг обучающихся (006)

Новых таблиц нет. Все сущности вычисляются из `attempts`, `evaluations`, `teacher_overrides`, `assignment_attempts`, `student_ratings`, `users`.

## StudentRatingRow (строка таблицы)

| Поле | Тип | Источник |
|---|---|---|
| `studentId`, `fullName`, `groupId` | string | `users` |
| `attempts` | int | число завершённых попыток за период/режим |
| `averageScore` | number \| null | среднее итоговых баллов (с правкой преподавателя), 1 знак |
| `ratingOperator112`, `ratingDds` | number | `rating_service.ratings` (за всё время), округление до целого |
| `averageReactionMs`, `averageProcessingMs` | int \| null | средние по попыткам |
| `withinNormsShare` | number \| null | доля попыток с реакцией ≤ 30 000 и отработкой ≤ 180 000 мс, 0…1 |
| `enoughData` | boolean | `attempts ≥ 3` |

`null` — нет попыток.

## StudentRatingResponse

```
{ groups: { groupId, studentCount }[]; groupId: string | null; period: "2w"|"1m"|"all";
  mode: "operator112"|"dds"|"all"; norms: { reactionMs: 30000, processingMs: 180000 };
  minAttempts: 3; rows: StudentRatingRow[] }
```

## StudentStats (профиль)

```
{ studentId, fullName, groupId, period, mode, norms,
  summary: { attempts, averageScore, averageReactionMs, averageProcessingMs, withinNormsShare },
  byMode: { operator112: Summary, dds: Summary },
  dynamics: { at, attemptId, mode, score, reactionMs, processingMs }[]   // по возрастанию времени
  attempts: { attemptId, at, mode, format, title, score, reactionMs, processingMs, passed }[]  // по убыванию }
```

## Правила
- Период: `2w` = 14 дней, `1m` = 30 дней, `all` — как в карте ошибок (`error_map_service.period_cutoff`).
- Место (клиент): по выбранному столбцу, только `enoughData`; равные значения — одно место, следующее с пропуском; вторичный порядок — ФИО.
