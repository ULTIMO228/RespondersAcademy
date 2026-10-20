# Data model — фича 006

## ai_settings (одна строка, id=1)
| Поле | Тип | Правило |
|---|---|---|
| id | int PK | всегда 1 |
| source | `local` \| `cloud` | выбранный источник |
| cloud_key_cipher | text, null | Fernet-шифртекст ключа; null — ключа нет |
| cloud_key_last4 | varchar(4), null | для показа «…abcd» |
| updated_by | varchar, FK пользователя | кто сохранил |
| updated_at | timestamptz | |

Инварианты: `source=cloud` допустим только при непустом `cloud_key_cipher`; удаление ключа при `cloud` → атомарное переключение на `local` с предупреждением. Строки нет → действует окружение (FR-016). Модель и маршрут облака в таблице **не хранятся** (константы кода).

## ai_health (одна строка, id=1)
| Поле | Тип | Правило |
|---|---|---|
| active_source | `local`\|`cloud` | на момент последнего вызова |
| served_by_last | `cloud`\|`local`\|`template` | чем фактически ответили |
| last_ok_at / last_error_at | timestamptz, null | |
| last_error_reason | enum, null | `invalid_key`, `insufficient_funds`, `rate_limited`, `daily_limit`, `timeout`, `network`, `wrong_route`, `bad_response`, `local_down` |
| errors_today / calls_today / probe_calls_today / day | int / int / int / date | сброс при смене даты; оба счётчика вызовов входят в один лимит, probe отдельно от обычного расхода |

Состояние для UI: `ok` (served_by_last = active_source), `degraded` (cloud выбран, ответил local), `down` (template).

## Пометка источника текста
Необязательное поле `source: "cloud" | "local" | "template"` (+ `model?: string`) рядом с текстами: `aiCommentSource` у оценки/отчёта попытки (`session.ts:93`, `report.ts:90`), `groupInsightsSource` (`report.ts:169`), `source` у рекомендаций и пояснения карты ошибок (уже есть `ai|template` — расширить), `generation.provider` у сценариев. Старые данные без поля читаются как `template`. Существующее поле `source` пояснения карты ошибок (`ai|template`) мигрирует: значение `ai` читается как `cloud` либо `local` по `model`/провайдеру, новые записи пишутся в новом формате; контракт и `expected_fields.json` обновляются (принцип V).

## Аудит
`ai.settings.change` {from,to,keyChanged:boolean}, `ai.connection_test` {source,ok,reason}, `ai.external_call` {purpose,provider,requestChars,result} — без ключа и текстов.
