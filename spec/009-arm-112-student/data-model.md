# Data Model: АРМ специалиста-112 один в один (009)

Все изменения **аддитивные**: новые поля необязательные, старые попытки и снимки карточек читаются без миграции данных (FR-033). Формы 1:1 между `src/shared/api/types/operator112.ts` и `backend/app/schemas/v1/operator112.py` (camelCase); после правки TS-типов — `uv run python scripts/extract_ts_fields.py`.

## CardDraft (существует, расширяется)

| Поле | Тип | Новое | Правило |
|---|---|---|---|
| `applicant` | `{name, status}` | — | как сейчас |
| `phones` | `{aon, provided, onSite}` | — | `aon` из попытки, только чтение |
| `channel` | `"call" \| "sms"` | ✅ | из билета; в UI — «канал связи» |
| `address` | `CardDraftAddress` | расширен | см. ниже |
| `what` | `CardDraftWhat` | — | = первая вкладка `incidents[0]`; читает оценщик |
| `incidents` | `CardDraftWhat[]` | ✅ | вкладки «Происшествие …» по порядку; ≥ 1 при сохранении, кроме «нет контакта» / «срыв звонка» |
| `description` | `string` | — | ≤ 1999 символов (счётчик «0 / 1999») |
| `emergency` | `{chs, chp}` | — | как сейчас |
| `notificationList` | `CardDraftNotification[]` | — | объединение служб всех вкладок; `addedBy: auto` нельзя удалить |
| `links` | `{cardId: string, primary: boolean}[]` | ✅ | итог привязки; ровно одна `primary`, если массив не пуст |
| `outcome` | `"filled" \| "noContact" \| "dropped"` | ✅ | «нет контакта» / «срыв звонка» сохраняют пустую карточку с типом (FR-017 007) |

### CardDraftAddress (расширение)

Существующие поля: `formal, street, house, okrug, raion, descriptive, source`.
Новые (все `string`, необязательные): `country` (по умолчанию «Россия»), `subject` («Москва»), `locality` («Москва»), `object`, `korpus`, `building` (Стр/соор), `flat` (Квартира/офис), `entrance`, `floor`, `code`; `lat`, `lon` (`number`, из окна карты).

Правила:
- `subject == "Москва"` → округ/район/улица из справочника (`source: directory`), иначе ручной ввод (`source: manual`).
- Сохранение допускается, если заполнено хотя бы одно из: `street`, `object`, `descriptive`, или есть `lat/lon`.
- «очистить адрес» обнуляет все поля, кроме `country/subject/locality`, которые возвращаются к значениям по умолчанию.

## OperatorEventType (существует, расширяется)

Сейчас: `fieldChanged | signSelected | serviceAdded | replay | hintShown`.
Новые: `typeAdded` `{finalType, classifierCode}`, `typeRemoved` `{index}`, `serviceRemoved` `{serviceId}` (только ручные), `linkAdded` `{cardId}`, `linkRemoved` `{cardId}`, `linkPrimary` `{cardId}`, `callHidden` (окно вызова закрыто «×»; только фиксация, в оценку не входит — research R5).

## Билет (карточка-эталон в `spec/000-фронт/mocks/cards.json`, расширение)

| Поле | Тип | Правило |
|---|---|---|
| `channel` | `"call" \| "sms"` | по умолчанию `call` |
| `smsText` | `string` | обязателен при `channel = sms` |
| `repeatOf` | `string \| null` | id карточки фона журнала, к которой должна быть привязана новая; валидатор проверяет, что карточка существует |
| `lockedBy` | `{operator: number, name: string, arm: number}` | только у фоновых карточек журнала (окно блокировки) |

Валидатор `validate_mocks.py` дополняется этими проверками; затем `npm run mocks:sync && npm run mocks:validate`, бэкенд — `app.seed.load --reset` (с разрешения владельца).

## Journal112Row (новое, ответ журнала)

`{ cardId, number, createdAt, operator, arm, whatHappened, injured, status, address, description, linked: boolean, chs: boolean, checked: boolean, isOwn: boolean, lockedBy?: {...}, queued?: boolean }`. Колонки — FR-006. `queued` — строка ещё не принятого вызова попытки.

## ProblemReport (новое, таблица `problem_reports`, миграция `0007`)

| Поле | Тип | Правило |
|---|---|---|
| `id` | `pr-NNNN` | префикс в `app/db/ids.py` |
| `studentId` | FK users | автор, только роль student |
| `attemptId` | string, nullable | попытка 112, если отправлено из карточки |
| `incidentNumber` | int, nullable | «Происшествие» в окне |
| `text` | string 1…2000 | обязателен |
| `attachmentPath` | string, nullable | png/jpeg ≤ 2 МБ в `backend/var/uploads/problem-reports/` |
| `createdAt` | ISO | время сервера |
| `readAt` | ISO, nullable | преподаватель открыл |

Видимость: преподаватель видит отчёты учеников только своих групп (то же правило, что рейтинг 006). Аудит: `problem_report.created`.

## Состояния экрана 112 (клиент, `pages/operator112`)

```text
loading → journal ─(вызов поступил)→ journal+incoming ─Принять→ card ─сохранить+подтвердить→ result
                     │                    └─×→ journal (queued) ─клик по строке→ journal+incoming
                     └─создать новую карточку→ practiceCard ─закрыть→ journal
card ─связи→ links ─вернуться в карточку→ card
card ─список SMS→ smsHistory ─вернуться в карточку→ card
любой вид + reminderDue → окно напоминания поверх (вид не размонтируется)
```

## Таймер карточки

`elapsed = now − answeredAt` (стоп на `completedAt`); формат `ММ:СС` + «минут секунд»; `elapsed ≥ 60 с` → красный фон (`CARD_TIMER_RED_SEC`, research R7).
