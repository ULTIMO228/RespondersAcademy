"""Генератор размеченной выборки режима B: `backend/data/labeled/attempts/*.json` (T038).

Синтетика из `spec/mocks/scenarios.json` + `cards.json`: для карточек сценариев строится эталонная попытка,
затем намеренно испорченные варианты (опоздание, без комментария, отказ от профильного, неверная служба,
опечатки, пропущенный статус, ловушки с расширенным эталоном). Разметка — `expectedErrors` (типы ошибок
из типологии evaluation.schema.json) и `expertScore` по рубрике из README (независимо от оценщика).

Запуск: `uv run python -m ml.scripts.build_labeled` (детерминирован, seed=112). Повтор перезаписывает файлы.
"""

from __future__ import annotations

import json
import random
import sys
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings

OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "attempts"
MOSCOW = timezone(timedelta(hours=3))
BASE_TIME = datetime(2026, 9, 18, 10, 0, 0, tzinfo=MOSCOW)
SEED = 112
BASE_CARDS_PER_RUN = 14

# Рубрика экспертной оценки (README): штрафы по типам ошибок, итог 0..100.
PENALTY: dict[str, int] = {
    "timeReactionExceeded": 10,
    "timeProcessingExceeded": 10,
    "noPrimaryStatus": 60,
    "wrongDecision": 50,
    "refusedProfile": 50,
    "missingComment": 25,
    "incompleteComment": 15,
    "noProgressStatus": 12,
    "statusMissing": 15,
    "missedRequiredCall": 20,
    "wrongRecipient": 12,
    "transferMissing": 15,
    "requiredFieldMissing": 10,
    "grammarLimitExceeded": 10,
    "addressLookalike": 15,
    "addressTypo": 8,
    "parallelCardIgnored": 10,
    "keyPhraseMissing": 5,
}
GRAMMAR_PENALTY_PER_ERROR = 4

SERVICE_PHRASES = {"101": "расчёт направлен", "102": "наряд полиции направлен", "103": "бригада СМП направлена", "104": "аварийная бригада газовой службы направлена"}
TYPOS = [("принято", "пренято"), ("направлен", "напрален"), ("бригада", "бригадда"), ("сообщение", "сообшение"), ("полиции", "полицыи")]
REFUSAL_FULL = "Не обслуживаем территорию, информация передана в {to}"
REFUSAL_SHORT = "не обслуживаем"
TRAPS = [
    {"trap": "operatorMistake", "to": "Мосводоканал", "note": "ошибка оператора 112: по фабуле прорыв трубы, тип «запах газа»"},
    {"trap": "foreignTerritory", "to": "ОДС-3", "note": "территория другой службы"},
    {"trap": "duplicate", "to": "КП-36814850", "note": "дубль карточки, реагирование по КП"},
]


def iso(moment: datetime) -> str:
    return moment.replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def card_segment(actions: list[str], card_id: str) -> list[str]:
    marker = f"openCard:{card_id}"
    if marker not in actions:
        return []
    rest = actions[actions.index(marker) + 1 :]
    segment = []
    for action in rest:
        if action.startswith("openCard:"):
            break
        segment.append(action)
    return segment


def perfect_attempt(index: int, card: dict[str, Any], scenario: dict[str, Any], rng: random.Random, start: datetime) -> dict[str, Any]:
    segment = card_segment(scenario["etalon"]["expectedActions"], card["id"])
    calls = [a.split(":")[1] for a in segment if a.startswith("call:")]
    statuses = [a.split(":")[1] for a in segment if a.startswith("status:")]
    transfer = any(a == "transfer:region" for a in segment)
    opened = start + timedelta(seconds=rng.randint(5, 20))
    cursor = opened + timedelta(seconds=rng.randint(6, 15))
    # Шаги укладываются в норматив 180 с при любом числе звонков/статусов.
    steps = max(1, len(calls) * 2 + len(statuses))
    step_max = max(8, min(35, 150 // steps))
    marks: list[dict[str, Any]] = []
    call_docs: list[dict[str, Any]] = []
    for status in statuses:
        if status == "accepted":
            marks.append({"ddsStatus": "accepted", "at": iso(cursor), "dutyNumber": str(rng.randint(3, 25))})
            for number in calls:
                cursor += timedelta(seconds=rng.randint(5, step_max))
                call_docs.append({"toNumber": number, "startedAt": iso(cursor), "endedAt": iso(cursor + timedelta(seconds=min(40, step_max))), "transcript": [{"speaker": "ai", "text": "Служба, слушаю", "at": iso(cursor + timedelta(seconds=1))}, {"speaker": "dispatcher", "text": f"Диспетчер ДДС, карточка {card['ticketNo']}: {card['summary']}. Адрес: {card['address']}. Прошу направить наряд.", "at": iso(cursor + timedelta(seconds=3))}, {"speaker": "ai", "text": "Принято, направляем", "at": iso(cursor + timedelta(seconds=6))}]})
                cursor += timedelta(seconds=min(40, step_max))
        else:
            cursor += timedelta(seconds=rng.randint(8, step_max))
            comment = {"responseStarted": "Бригада выехала", "arrived": "Бригада на месте", "workInProgress": "Работы ведутся", "workDone": "Работы завершены, опасности нет"}.get(status)
            mark = {"ddsStatus": status, "at": iso(cursor)}
            if comment:
                mark["comment"] = comment
            marks.append(mark)
    phrases = ["Сообщение принято"]
    phrases.extend(SERVICE_PHRASES[n] for n in calls if n in SERVICE_PHRASES)
    if transfer:
        phrases.append("вызов переведён в ЦУС другого региона")
    entered = {"dispatcherAction": ", ".join(phrases), "outfitNumber": str(rng.randint(3, 25))}
    completed = marks[-1]["at"] if marks else iso(cursor)
    completed_dt = datetime.fromisoformat(completed)
    return {
        "id": f"lab-{index:03d}",
        "cardId": card["id"],
        "studentId": "u-005",
        "openedAt": iso(opened),
        "primaryReactionMs": int((opened - start).total_seconds() * 1000),
        "statuses": marks,
        "servicesCalled": list(calls),
        "completedAt": completed,
        "fullProcessingMs": int((completed_dt - opened).total_seconds() * 1000),
        "enteredText": entered,
        "calls": call_docs,
    }


def shift_reaction(attempt: dict[str, Any], seconds: int) -> None:
    attempt["primaryReactionMs"] = seconds * 1000


def shift_processing(attempt: dict[str, Any], seconds: int) -> None:
    opened = datetime.fromisoformat(attempt["openedAt"])
    completed = opened + timedelta(seconds=seconds)
    attempt["completedAt"] = iso(completed)
    attempt["fullProcessingMs"] = seconds * 1000
    if attempt["statuses"]:
        attempt["statuses"][-1]["at"] = iso(completed)


def add_typos(attempt: dict[str, Any], count: int) -> int:
    text = attempt["enteredText"]["dispatcherAction"]
    applied = 0
    for right, wrong in TYPOS:
        if applied >= count:
            break
        if right in text.lower():
            index = text.lower().index(right)
            original = text[index : index + len(right)]
            replacement = wrong.capitalize() if original[:1].isupper() else wrong
            text = text[:index] + replacement + text[index + len(right) :]
            applied += 1
    attempt["enteredText"]["dispatcherAction"] = text
    return applied


def make_refusal(attempt: dict[str, Any], comment: str | None) -> None:
    first = attempt["statuses"][0]
    attempt["statuses"] = [{"ddsStatus": "notAccepted", "at": first["at"], **({"comment": comment} if comment else {})}]
    attempt["calls"] = []
    attempt["servicesCalled"] = []
    attempt["completedAt"] = first["at"]
    attempt["fullProcessingMs"] = max(1000, int((datetime.fromisoformat(first["at"]) - datetime.fromisoformat(attempt["openedAt"])).total_seconds() * 1000))
    attempt["enteredText"] = {"dispatcherAction": comment or "", "outfitNumber": ""}


def expert_score(expected_errors: list[str], grammar_count: int) -> int:
    score = 100 - sum(PENALTY.get(e, 5) for e in expected_errors) - GRAMMAR_PENALTY_PER_ERROR * grammar_count
    return max(0, min(100, score))


def sample(index: int, name: str, attempt: dict[str, Any], scenario: dict[str, Any], card: dict[str, Any], expected: list[str], grammar: int = 0, note: str = "", session: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": f"lab-{index:03d}",
        "name": name,
        "note": note,
        "attempt": {**attempt, "id": f"lab-{index:03d}"},
        "scenario": scenario,
        "card": card,
        "session": session,
        "expectedErrors": sorted(set(expected)),
        "expectedGrammarErrors": grammar,
        "expertScore": expert_score(expected, grammar),
    }


def trap_scenario(scenario: dict[str, Any], card_id: str, trap: dict[str, str]) -> dict[str, Any]:
    doc = deepcopy(scenario)
    doc["etalon"]["cards"] = {card_id: {"expectedDecision": "notAccepted", "expectedTransferTo": trap["to"], "trap": trap["trap"], "expectedCommentPhrases": [f"передано в {trap['to']}"]}}
    doc["id"] = f"{scenario['id']}-trap"
    return doc


def build() -> list[dict[str, Any]]:
    root = get_settings().seed_dir / "spec" / "mocks"
    scenarios = read_json(root / "scenarios.json")["scenarios"]
    cards = {c["id"]: c for c in read_json(root / "cards.json")["cards"]}
    rng = random.Random(SEED)
    pool = [(s, cards[cid]) for s in scenarios for cid in s["cardIds"] if cid in cards and card_segment(s["etalon"]["expectedActions"], cid)]
    rng.shuffle(pool)
    chosen = pool[:BASE_CARDS_PER_RUN]
    samples: list[dict[str, Any]] = []
    index = 1
    start = BASE_TIME

    def next_start() -> datetime:
        nonlocal start
        start += timedelta(minutes=7)
        return start

    for variant_set, (scenario, card) in enumerate(chosen):
        segment = card_segment(scenario["etalon"]["expectedActions"], card["id"])
        calls = [a.split(":")[1] for a in segment if a.startswith("call:")]
        expects_progress = any(a.startswith("status:") and a.split(":")[1] in ("responseStarted", "arrived", "workInProgress") for a in segment)
        # 1. Эталонная попытка.
        base = perfect_attempt(index, card, scenario, rng, next_start())
        samples.append(sample(index, "etalon", base, scenario, card, [], note="эталонная отработка"))
        index += 1
        # 2. Опоздание по реакции (> 30 с) и по отработке (> 180 с).
        late = deepcopy(base)
        shift_reaction(late, rng.randint(40, 75))
        expected = ["timeReactionExceeded"]
        if variant_set % 2 == 0:
            shift_processing(late, rng.randint(200, 320))
            expected.append("timeProcessingExceeded")
        samples.append(sample(index, "late", late, scenario, card, expected, note="опоздание"))
        index += 1
        # 3. Отказ от профильного происшествия (эталон ждёт «Принята») без комментария.
        refused = deepcopy(base)
        make_refusal(refused, None)
        expected = ["refusedProfile", "missingComment", "requiredFieldMissing"] + (["missedRequiredCall"] if calls else []) + (["statusMissing"] if segment and any(a == "status:workDone" for a in segment) else [])
        samples.append(sample(index, "refusedProfile-noComment", refused, scenario, card, expected, note="«Не принята» по профильному без комментария"))
        index += 1
        # 4. Пропущенный звонок / неверная служба.
        if calls:
            wrong = deepcopy(base)
            dropped = calls[0]
            wrong["calls"] = [c for c in wrong["calls"] if c["toNumber"] != dropped]
            wrong["servicesCalled"] = [n for n in wrong["servicesCalled"] if n != dropped]
            expected = ["missedRequiredCall"]
            if variant_set % 3 == 0:
                other = next(n for n in ("101", "102", "103", "104") if n not in calls)
                wrong["calls"].append({"toNumber": other, "startedAt": wrong["statuses"][0]["at"], "endedAt": wrong["statuses"][0]["at"], "transcript": []})
                wrong["servicesCalled"].append(other)
                expected.append("wrongRecipient")
            samples.append(sample(index, "missedCall", wrong, scenario, card, expected, note=f"пропущен звонок {dropped}"))
            index += 1
        # 5. Опечатки сверх лимита.
        typos = deepcopy(base)
        count = add_typos(typos, 2 + (variant_set % 2))
        limit = int(scenario["successCriteria"].get("maxGrammarErrors", 0))
        expected = ["grammarLimitExceeded"] if count > limit else []
        samples.append(sample(index, "typos", typos, scenario, card, expected, grammar=count, note=f"{count} опечатки"))
        index += 1
        # 6. Пропущен статус хода работ / закрытие.
        if len(base["statuses"]) >= 2:
            missing = deepcopy(base)
            if expects_progress:
                missing["statuses"] = [m for m in missing["statuses"] if m["ddsStatus"] not in ("responseStarted", "arrived", "workInProgress")]
                expected = ["noProgressStatus"]
            else:
                missing["statuses"] = missing["statuses"][:-1]
                expected = ["statusMissing"]
            samples.append(sample(index, "missingStatus", missing, scenario, card, expected, note="пропущен статус"))
            index += 1
        # 7. Ловушка с расширенным эталоном: правильный отказ (полный / неполный комментарий) и нераспознанная ловушка.
        if variant_set % 2 == 1:
            trap = TRAPS[variant_set % len(TRAPS)]
            trapped_scenario = trap_scenario(scenario, card["id"], trap)
            good = deepcopy(base)
            make_refusal(good, REFUSAL_FULL.format(to=trap["to"]))
            good["enteredText"] = {"dispatcherAction": REFUSAL_FULL.format(to=trap["to"]), "outfitNumber": "—"}
            samples.append(sample(index, "trap-correct", good, trapped_scenario, card, [], note=f"ловушка распознана: {trap['note']}"))
            index += 1
            short = deepcopy(good)
            make_refusal(short, REFUSAL_SHORT)
            short["enteredText"] = {"dispatcherAction": REFUSAL_SHORT, "outfitNumber": "—"}
            samples.append(sample(index, "trap-incompleteComment", short, trapped_scenario, card, ["incompleteComment"], note="«не обслуживаем» без «кому передано»"))
            index += 1
            missed = deepcopy(base)
            samples.append(sample(index, "trap-missed", missed, trapped_scenario, card, ["wrongDecision"], note=f"ловушка не распознана: {trap['note']}"))
            index += 1
    # 8. Адрес ручного ввода против билета по справочнику улиц (Q&A «Дубнинская / Дубининская»).
    for scenario, card in chosen[:3]:
        address_card = {**deepcopy(card), "address": "Москва, ул. Дубининская, д. 12, кв. 5"}
        base = perfect_attempt(index, address_card, scenario, rng, next_start())
        lookalike = deepcopy(base)
        lookalike["enteredText"]["address"] = "ул. Дубнинская, д. 12"
        samples.append(sample(index, "address-lookalike", lookalike, scenario, address_card, ["addressLookalike"], note="похожая улица"))
        index += 1
        typo = deepcopy(base)
        typo["enteredText"]["address"] = "ул. Дубиниская, д. 12"
        samples.append(sample(index, "address-typo", typo, scenario, address_card, ["addressTypo"], note="опечатка в улице"))
        index += 1
        exact = deepcopy(base)
        exact["enteredText"]["address"] = "Дубининская улица, 12"
        samples.append(sample(index, "address-exact", exact, scenario, address_card, [], note="адрес верный"))
        index += 1
    return samples


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("lab-*.json"):
        old.unlink()
    samples = build()
    for doc in samples:
        (OUT_DIR / f"{doc['id']}-{doc['name']}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT_DIR}: {len(samples)} попыток")
    return 0


if __name__ == "__main__":
    sys.exit(main())
