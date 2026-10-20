# Контракт 006 — `/api/v1/…`

| Метод и путь | Роли | Назначение | Коды |
|---|---|---|---|
| `GET /admin/ai/settings` | admin | Текущая настройка | 200, 401, 403 |
| `PUT /admin/ai/settings` | admin | Сохранить источник/ключ | 200, 400, 401, 403 |
| `POST /admin/ai/settings/test` | admin | Пробный запрос, ничего не сохраняет | 200, 400, 401, 403 |
| `GET /admin/ai/provider` | admin | Существующий статус (фича 004), сохраняется | 200, 401, 403 |
| `GET /ai/health` | admin, teacher | Состояние для баннера (teacher — без деталей) | 200, 401, 403 (student) |

**GET/PUT settings — ответ**: `{source:"local"|"cloud", cloud:{model:"qwen/qwen3.8-27b", route:"cerebras/fp16", keyConfigured:boolean, keyLast4:string|null}, fromEnv:boolean, cloudFunctions:string[], updatedAt, updatedBy}`. Ключ в ответах отсутствует всегда.
**PUT тело**: `{source, apiKey?:string, clearKey?:boolean}`; `apiKey` обрезается; `source=cloud` без сохранённого/присланного ключа → 400 `validationFailed`; `clearKey` при `cloud` → переключение на `local` (в ответе `source:"local"`).
**POST test тело**: `{source, apiKey?}` (без `apiKey` — проверка сохранённого ключа). Ответ: `{ok, latencyMs, route:"cerebras/fp16"|null, reason?:<enum ai_health.last_error_reason>}`; ключ в ответ не попадает; квота пробы — 1 запрос. Настройки проба не меняет. Исход пробы **сохранённого** ключа при выбранном облаке пишется в `ai_health` (успех → `state=ok`, `servedBy=cloud`, `lastOkAt`; сбой → `reason`, `errorsToday+1`) и в аудит `ai.external_call` («проверка подключения»); проба введённым (несохранённым) ключом и проба при выбранном локальном источнике состояние не меняют. При сбое состояние ставится `down` без проверки локальной модели (SC-008).
**GET /ai/health — ответ**: `{state:"ok"|"degraded"|"down", activeSource, servedBy, lastOkAt, lastErrorAt}`; для admin дополнительно `{reason, errorsToday, callsToday, dailyLimit}`.
Все ответы — `Cache-Control: no-store`. Неверное значение полей — 400. Student на любой `/admin/ai/*` и `/ai/health` — 403, без сессии — 401.
Совместимость: `GET /admin/ai/provider` не меняется; в типы фронта добавляются только необязательные поля `source` (см. data-model).
