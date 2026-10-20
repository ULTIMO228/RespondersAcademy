# Data Model: чат разбора попытки

Хранилища и миграций нет. Сущности — контрактные и клиентские.

## ChatMessage (клиент, `sessionStorage`)
| Поле | Тип | Правило |
|---|---|---|
| id | string | уникален в чате |
| role | `user` \| `assistant` | |
| content | string | пользователь ≤ 1000 зн.; ассистент ≤ 600 |
| source | `cloud`\|`local`\|`template` | только у assistant, из ответа сервера |
| modelName | string? | в подсказку бейджа |
| status | `sent`\|`failed` | `failed` — кнопка «Повторить» |

Ключ хранения: `arm112_chat_attempt_{attemptId}`; хранится массив (до 50 реплик, старые отбрасываются). Приветствие строится на клиенте и не хранится.

## ChatRequest / ChatResponse (API, camelCase)
См. [contracts/api.md](contracts/api.md). Валидация: `message` trim 1–1000; `history` ≤ 6 реплик, роли только `user`/`assistant`, `content` ≤ 1000; `mode` ∈ `operator112|dds`.

## AttemptChatFacts (сервер, не сохраняется)
`{ mode, totalScore, components[], exceededNorms{reaction,processing}, norms{...}, violations[{title,severity}], etalon[] }` — только числа и формулировки правил; без идентификаторов и введённого текста.

## Состояния шторки
`closed → open(idle) → open(waiting) → open(idle|error)`; `waiting` блокирует повторную отправку; смена попытки/закрытие отменяет запрос.
