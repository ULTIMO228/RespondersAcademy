# Размеченная выборка оценщика (режим B — диспетчер ДДС)

`attempts/*.json` — синтетические попытки с разметкой; генерируются детерминированно
(`uv run python -m ml.scripts.build_labeled`, seed 112) из билетов и эталонов `spec/mocks/`.
Метрики: `uv run python -m ml.scripts.eval_assessor` → `backend/var/metrics.json`;
калибровка весов: `uv run python -m ml.scripts.calibrate`.

## Формат файла

| Поле | Значение |
|---|---|
| `id`, `name`, `note` | идентификатор, вид варианта, пояснение |
| `attempt` | `CardEvent` контракта (статусы, звонки с расшифровкой, `enteredText`, тайминги) |
| `scenario` | `Scenario` с эталоном; для ловушек — расширение `etalon.cards[cardId]` (`expectedDecision`, `expectedTransferTo`, `trap`, `expectedCommentPhrases`) |
| `card` | `IncidentCard` попытки (для адресных вариантов адрес заменён на улицу из справочника) |
| `session` | `Session` (cardFlow, cardEvents) — только когда проверяется многозадачность, иначе `null` |
| `expectedErrors` | ожидаемые типы ошибок (типология `contracts/evaluation.schema.json`); проверяется наличие/отсутствие каждого типа |
| `expectedGrammarErrors` | число внесённых опечаток |
| `expertScore` | экспертный балл 0–100 по рубрике ниже (независимо от оценщика) |

## Варианты

| `name` | Что испорчено | Ожидаемые типы |
|---|---|---|
| `etalon` | ничего — эталонная отработка в нормативах | — |
| `late` | реакция 40–75 с (и отработка 200–320 с в чётных наборах) | `timeReactionExceeded` (+ `timeProcessingExceeded`) |
| `refusedProfile-noComment` | «Не принята» без комментария по профильному происшествию | `refusedProfile`, `missingComment`, `requiredFieldMissing`, `missedRequiredCall`*, `statusMissing`* |
| `missedCall` | пропущен первый ожидаемый звонок точке C (в каждом третьем наборе — звонок не той службе) | `missedRequiredCall` (+ `wrongRecipient`) |
| `typos` | 2–3 опечатки из типовых («пренято», «напрален», …) | `grammarLimitExceeded` при превышении `maxGrammarErrors` |
| `missingStatus` | пропущен статус хода работ либо закрывающий статус | `noProgressStatus` / `statusMissing` |
| `trap-correct` | ловушка (ошибка 112 / чужая территория / дубль): «Не принята» с полным комментарием | — |
| `trap-incompleteComment` | ловушка: комментарий «не обслуживаем» без «кому передано» | `incompleteComment` |
| `trap-missed` | ловушка не распознана: «Принята» и звонки службам | `wrongDecision` |
| `address-lookalike` | адресное поле с похожей улицей («Дубнинская» vs «Дубининская») | `addressLookalike` |
| `address-typo` | опечатка в названии улицы, которой нет в справочнике | `addressTypo` |

\* — если эталон карточки ожидал звонки / статус «Работы завершены».

## Рубрика экспертного балла

`expertScore = clamp(100 − Σ штраф(тип) − 4 × опечатки, 0, 100)`. Штрафы: `noPrimaryStatus` 60,
`wrongDecision` 50, `refusedProfile` 50, `missingComment` 25, `missedRequiredCall` 20, `incompleteComment` 15,
`statusMissing` 15, `transferMissing` 15, `addressLookalike` 15, `noProgressStatus` 12, `wrongRecipient` 12,
`timeReactionExceeded` 10, `timeProcessingExceeded` 10, `requiredFieldMissing` 10, `grammarLimitExceeded` 10,
`parallelCardIgnored` 10, `addressTypo` 8, `keyPhraseMissing` 5, прочие 5. Неверное первичное решение —
«не сдал» (≤ 50) и в рубрике, и в оценщике (потолок `DECISION_CAPS`).

## Критерии приёмки (tasks.md T036/T049)

Согласие по типам ошибок ≥ 0,85 (accuracy «есть/нет» по словарю типов) и корреляция Пирсона ≥ 0,8
между `totalScore` и `expertScore`; результат воспроизводим при повторном прогоне.

## `tickets/` — приёмка валидатора билетов (T056/T060, SC-005)

40 файлов `tk-NNN-<kind>.json`, генерируются детерминированно `uv run python -m ml.scripts.build_labeled_tickets`
из карточек `spec/mocks/cards.json`: 20 корректных (`tk-001…020-correct`) и 20 дефектных
(`tk-021…040-<defect>`), по одному внесённому дефекту на файл.

| Поле | Значение |
|---|---|
| `id`, `kind` | идентификатор; `correct` / `defective` |
| `defect` | вид дефекта (`null` для корректных) |
| `expectedFailed` | критерии валидатора, которые должны быть не пройдены (`[]` для корректных) |
| `sourceCardId` | исходная карточка банка |
| `note` | что именно изменено |
| `ticket` | `IncidentCard` контракта, подаваемый в `ml.generate.validator.validate` |

| `defect` | Что испорчено | Ожидаемый критерий |
|---|---|---|
| `wrongCategory` | группа заменена на неподходящую («Радиация», «пожар в метро», …) | `category` |
| `unknownStreet` | адрес заменён на улицу вне справочника | `address` |
| `missingField` | пустой телефон заявителя либо пустой список ожидаемых служб | `requiredFields` |
| `duplicate` | фабула и адрес скопированы с другой карточки без `duplicateOf` | `duplicate` |
| `typo` | опечатка в фабуле из типового списка («женшина», «чиловек») | `grammar` |
| `inconsistent` | факты фабулы противоречат признакам: снят `victims` при пострадавших, снят `crossRegion` при другой области, «03 не требуется» без `noAmbulance` | `consistency` |

Проверка: `uv run pytest tests/unit/test_validator.py` — корректные проходят все критерии, дефектные
не проходят ожидаемый; текущий результат 20/20 и 20/20.

## `synthetic_groups.json` — обучающая выборка классификатора групп ЕКП (T059)

Собирается `uv run python -m ml.scripts.build_synthetic_groups` из строк `spec/mocks/classifier.json` (v046.24):
для каждой строки — текст «тип: подтип, признаки» и фраза «Сообщение заявителя: {итог}. Признаки: {признаки}»
(поле `templates`); 2671 образец `{ text, group }`, `group` — группа из `reference.incidentGroups`.
Используется `ml.scripts.train_classifier` вместе с 96 карточками (вес карточек 5); метрики —
`ml.scripts.eval_classifier` → `var/metrics.json` (`classifier.accuracy`, `classifier.cvAccuracy`).
