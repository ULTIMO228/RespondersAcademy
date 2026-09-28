"""Адреса ручного ввода: нормализация и поиск по справочнику улиц Москвы (R3, FR-039).

`match(text)` → лучшая улица справочника с `ratio` (rapidfuzz token_set_ratio по нормализованному имени);
`lookalike` — 85 ≤ ratio < 100 («Дубнинская» ↔ «Дубининская», Q&A). Справочник грузится лениво один раз.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "streets"
STREETS_FILE = DATA_DIR / "moscow_streets.json"

LOOKALIKE_MIN_RATIO = 85
EXACT_RATIO = 100

# Типы улиц: полная форма ← сокращения ручного ввода (порядок важен: длинные раньше коротких).
STREET_TYPES: dict[str, tuple[str, ...]] = {
    "улица": ("улица", "ул.", "ул", "у."),
    "переулок": ("переулок", "пер.", "пер", "переул."),
    "проспект": ("проспект", "просп.", "пр-т", "пр-кт", "пр."),
    "проезд": ("проезд", "пр-д", "пр-зд", "проезд."),
    "шоссе": ("шоссе", "ш.", "ш"),
    "бульвар": ("бульвар", "б-р", "бул.", "бульв."),
    "набережная": ("набережная", "наб.", "наб"),
    "площадь": ("площадь", "пл.", "пл"),
    "аллея": ("аллея", "ал."),
    "тупик": ("тупик", "туп."),
    "линия": ("линия",),
    "квартал": ("квартал", "кв-л"),
    "микрорайон": ("микрорайон", "мкр.", "мкр", "мкрн"),
    "просек": ("просек", "просека"),
    "магистраль": ("магистраль",),
    "дорога": ("дорога", "дор."),
    "мост": ("мост",),
    "эстакада": ("эстакада",),
    "тоннель": ("тоннель", "туннель"),
    "спуск": ("спуск",),
    "вал": ("вал",),
    "кольцо": ("кольцо",),
    "въезд": ("въезд",),
}
_ABBR_TO_TYPE = {abbr.rstrip("."): full for full, abbrs in STREET_TYPES.items() for abbr in abbrs}
_NUMBER_WORD = re.compile(r"^\d+(-?(й|я|е|ый|ая|ое|ого|го|ий))?$", re.IGNORECASE)
_WORD = re.compile(r"[а-яёa-z0-9\-]+", re.IGNORECASE)
_HOUSE_MARKERS = ("д.", "дом", "д", "корп.", "корп", "к.", "стр.", "стр", "кв.", "кв", "под.", "подъезд", "эт.", "этаж", "владение", "вл.")


@dataclass(frozen=True)
class Street:
    name: str
    norm: str
    type: str
    raion: str | None = None


@dataclass(frozen=True)
class AddressMatch:
    query: str
    street: Street | None
    ratio: int

    @property
    def exact(self) -> bool:
        return self.street is not None and self.ratio >= EXACT_RATIO

    @property
    def lookalike(self) -> bool:
        return self.street is not None and LOOKALIKE_MIN_RATIO <= self.ratio < EXACT_RATIO

    @property
    def unknown(self) -> bool:
        return self.street is None or self.ratio < LOOKALIKE_MIN_RATIO


def _tokens(text: str) -> list[str]:
    return [t.lower().replace("ё", "е") for t in _WORD.findall(text)]


def split_street_type(name: str) -> tuple[str, str]:
    """«ул. Дубнинская» → ("улица", "дубнинская"); «Дубнинская улица» → то же; без типа → ("", core)."""
    tokens = _tokens(name)
    street_type = ""
    core: list[str] = []
    for token in tokens:
        full = _ABBR_TO_TYPE.get(token.rstrip("."))
        if full and not street_type:
            street_type = full
            continue
        core.append(token)
    return street_type, " ".join(core)


def normalize_street(name: str) -> str:
    """Нормализованное имя улицы без типа, номеров домов и служебных слов, ё→е, нижний регистр."""
    _, core = split_street_type(name)
    words = [w for w in core.split() if w and not _NUMBER_WORD.match(w) or _is_ordinal_part(w)]
    return " ".join(words).strip()


def _is_ordinal_part(word: str) -> bool:
    # «1-я», «3-й» — часть названия («3-я Парковая»), оставляем; голое число дома («12») — убираем.
    return bool(re.match(r"^\d+-?(й|я|е|ый|ая|ое|ий)$", word))


def extract_street_query(text: str) -> str:
    """Из адресной строки берёт часть до номера дома: «Москва, ул. Дубнинская, д. 12, кв. 5» → «ул. Дубнинская»."""
    cleaned = text.replace("г. Москва", " ").replace("Москва", " ")
    parts = [p.strip() for p in re.split(r"[,;]", cleaned) if p.strip()]
    for part in parts:
        tokens = _tokens(part)
        if not tokens:
            continue
        if any(t.rstrip(".") in {m.rstrip(".") for m in _HOUSE_MARKERS} for t in tokens) and not any(_ABBR_TO_TYPE.get(t.rstrip(".")) for t in tokens):
            continue
        if any(_ABBR_TO_TYPE.get(t.rstrip(".")) for t in tokens) or len(tokens) <= 3:
            words = []
            for token in _WORD.findall(part):
                low = token.lower().rstrip(".")
                if low in {m.rstrip(".") for m in _HOUSE_MARKERS} or (low.isdigit() and words):
                    break
                words.append(token)
            candidate = " ".join(words).strip(" ,.")
            if candidate:
                return candidate
    return parts[0] if parts else text.strip()


@lru_cache(maxsize=1)
def load_streets(path: Path = STREETS_FILE) -> tuple[Street, ...]:
    if not path.exists():
        return ()
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    return tuple(Street(name=s["name"], norm=s["norm"], type=s.get("type", ""), raion=s.get("raion")) for s in data.get("streets", []))


@lru_cache(maxsize=1)
def _norm_index() -> dict[str, list[Street]]:
    index: dict[str, list[Street]] = {}
    for street in load_streets():
        index.setdefault(street.norm, []).append(street)
    return index


@lru_cache(maxsize=4096)
def match(text: str, *, limit: int = 3) -> AddressMatch:
    """Лучшее совпадение введённой улицы со справочником; тип улицы уточняет выбор среди одноимённых."""
    query_raw = extract_street_query(text)
    query_type, _ = split_street_type(query_raw)
    query = normalize_street(query_raw)
    if not query:
        return AddressMatch(query=query_raw, street=None, ratio=0)
    index = _norm_index()
    if not index:
        return AddressMatch(query=query_raw, street=None, ratio=0)
    exact = index.get(query)
    if exact:
        street = next((s for s in exact if not query_type or s.type == query_type), exact[0])
        return AddressMatch(query=query_raw, street=street, ratio=EXACT_RATIO)
    candidates = process.extract(query, list(index.keys()), scorer=fuzz.token_set_ratio, limit=limit)
    if not candidates:
        return AddressMatch(query=query_raw, street=None, ratio=0)
    # token_set_ratio даёт 100 при подстроке («парковая» ⊂ «3-я парковая») — уточняем обычным ratio.
    best_norm, best_ratio, _ = max(candidates, key=lambda c: (c[1], fuzz.ratio(query, c[0])))
    if best_norm != query and best_ratio >= EXACT_RATIO:
        best_ratio = max(LOOKALIKE_MIN_RATIO, min(EXACT_RATIO - 1, int(fuzz.ratio(query, best_norm))))
    streets = index[best_norm]
    street = next((s for s in streets if not query_type or s.type == query_type), streets[0])
    return AddressMatch(query=query_raw, street=street, ratio=int(best_ratio))


def suggest(prefix: str, limit: int = 10) -> list[Street]:
    """Подсказки для адресного блока (волна B): по префиксу нормализованного имени, затем fuzzy."""
    query = normalize_street(prefix)
    if len(query) < 3:
        return []
    streets = load_streets()
    starts = [s for s in streets if s.norm.startswith(query)]
    if len(starts) >= limit:
        return starts[:limit]
    rest = [s for s in streets if s not in starts]
    fuzzy = process.extract(query, [s.norm for s in rest], scorer=fuzz.partial_ratio, limit=limit - len(starts))
    picked = {norm for norm, score, _ in fuzzy if score >= LOOKALIKE_MIN_RATIO}
    return [*starts, *[s for s in rest if s.norm in picked]][:limit]


@dataclass(frozen=True)
class AddressCheck:
    """Сравнение введённого адреса с эталонным: kind ∈ exact | lookalike | typo | mismatch | unknown."""

    kind: str
    entered: AddressMatch
    expected: AddressMatch
    ratio: int

    @property
    def ok(self) -> bool:
        return self.kind == "exact"


def compare(entered: str, expected: str) -> AddressCheck:
    """
    exact — та же улица справочника; lookalike — другая существующая улица, похожая на эталон
    (ratio ≥ 85: «Дубнинская» vs «Дубининская»); typo — улицы нет в справочнике, но она похожа на эталон;
    mismatch — другая улица; unknown — не распознано ни то, ни другое.
    """
    entered_match = match(entered)
    expected_match = match(expected)
    entered_norm = normalize_street(extract_street_query(entered))
    expected_norm = normalize_street(extract_street_query(expected))
    ratio = int(fuzz.ratio(entered_norm, expected_norm)) if entered_norm and expected_norm else 0
    if entered_match.exact and expected_match.street and entered_match.street == expected_match.street:
        return AddressCheck("exact", entered_match, expected_match, EXACT_RATIO)
    if entered_norm and entered_norm == expected_norm:
        return AddressCheck("exact", entered_match, expected_match, EXACT_RATIO)
    if ratio >= LOOKALIKE_MIN_RATIO:
        kind = "lookalike" if entered_match.exact else "typo"
        return AddressCheck(kind, entered_match, expected_match, ratio)
    if expected_match.street is None and entered_match.street is None:
        return AddressCheck("unknown", entered_match, expected_match, ratio)
    return AddressCheck("mismatch", entered_match, expected_match, ratio)
