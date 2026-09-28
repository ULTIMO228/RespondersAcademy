# Канонические контракты новых ресурсов `ai-workflow/1`

| Сущность конституции | Полная схема | Совместимость |
|---|---|---|
| Сценарий и эталон | [scenario.schema.json](scenario.schema.json) | Старый `Scenario` в `/api/mock/*` не меняется. |
| Событие обучающегося | [event.schema.json](event.schema.json) | Старый `CardEvent` не меняется. |
| Состояние оценки | [evaluation-state.schema.json](evaluation-state.schema.json) | Готовый старый `Evaluation` продолжает проверяться [`specs/002-two-mode-simulator/contracts/evaluation.schema.json`](../../../specs/002-two-mode-simulator/contracts/evaluation.schema.json); `pending` и `review_required` доступны только через новый ресурс. |
| Отчёт занятия | [report.schema.json](report.schema.json) | Старый `/api/mock/reports` не меняется. |

[ai-extension.schema.json](ai-extension.schema.json) содержит общие определения; каждая полная схема включает нужные определения локально и проверяется самостоятельно. Схемы описывают **новые** ресурсы фичи 001; тесты совместимости должны проверить обе формы на реальных ответах API. Изменение схемы требует версии, контрактного теста и уведомления команды до изменения ответов сервера. Если вводится несовместимое поле/enum, нужен `ai-workflow/2` и адаптер старого клиента.

Для `sourceKind=student_card` сценарий обязан содержать `sourceAttemptId`, `sourceCardId` и `sourceCardVersion`; его `cardSnapshot` строится из сохранённой обучающимся карточки, а не из черновика преподавателя. Утверждение сценария требует `validation=passed` и автора.
