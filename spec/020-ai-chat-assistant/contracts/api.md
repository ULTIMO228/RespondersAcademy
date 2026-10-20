# Контракт: POST /api/v1/ai/chat

Роль: `student`, только собственная попытка. Cookie `arm112_session`.

## Запрос
```json
{ "attemptId": "…", "mode": "operator112", "message": "Почему снижен балл за время?", "history": [{"role":"user","content":"…"},{"role":"assistant","content":"…"}] }
```
## Ответ 200
```json
{ "reply": "…", "source": "cloud|local|template", "provider": "polza:qwen/qwen3.8-27b|…|null", "modelName": "…|null" }
```
## Ошибки
| Код | Когда |
|---|---|
| 400/422 | пустое/слишком длинное сообщение, неверная роль в history, неизвестный mode |
| 401 | нет сессии |
| 403 | чужая попытка или роль не `student` |
| 404 | попытки нет / нет оценки |
| 429 | превышен лимит запросов на пользователя |

Парные 200: своя попытка с тем же телом. `source` всегда равен `LlmOutcome.source` (шаблон — `provider: null`). Автономный режим фронта (`app/api/v1/ai/chat/route.ts`) возвращает тот же контракт с `source: "template"`. После добавления TS-типа — `cd backend && uv run python scripts/extract_ts_fields.py`.
