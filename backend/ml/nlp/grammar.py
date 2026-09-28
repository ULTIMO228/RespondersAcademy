"""Грамматика ручного ввода (R2): symspellpy + частотный ru-словарь + доменный словарь, синтаксические правила.

Выход — `GrammarError { field, fragment, wrong, expected, type: spelling | syntax }` (контракт фронта).
Детерминировано, без сети; словари грузятся лениво один раз (< 5 мс/строка после загрузки).
Синтаксические правила повторяют мок фронта (`shared/lib/grammar-check`): строчная буква в начале,
двойные пробелы, пробел перед знаком препинания.

Осторожность (US3, FR-008): замечание — только при надёжном основании. Не исправляются аббревиатуры
(ДДС, ЕДДС, ЦУКС, МосгорБТИ), иная словоформа известной основы («запахе», «уведомлена»), неизвестное имя
собственное внутри фразы без доменной замены (фамилии заявителей). Адресные поля (`check_field`) сверяются
со справочником улиц (R3), а не с частотным словарём. Исходный текст не меняется: `wrong`/`fragment` — его срезы.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FREQUENCY_DICT = DATA_DIR / "dict" / "ru_frequency.txt"
DOMAIN_WORDS = DATA_DIR / "domain_words.txt"

MAX_EDIT_DISTANCE = 2
PREFIX_LENGTH = 7
MIN_WORD_LENGTH = 4  # короткие слова (предлоги, аббревиатуры) не исправляем
DOMAIN_WORD_FREQUENCY = 10_000_000  # доменные слова весомее любого частотного
# Порог частоты замены: редкие словоформы не должны «исправлять» корректные слова.
MIN_SUGGESTION_FREQUENCY = 50
# «Слабо известное» слово (в корпусе субтитров есть опечатки вроде «адресс»): считается ошибкой, если
# на расстоянии 1 есть доменное слово или слово во много раз частотнее.
WEAK_KNOWN_FREQUENCY = 200
WEAK_KNOWN_RATIO = 50

# Окончания русских словоформ: замена, меняющая только окончание при общей основе, — другая форма, не опечатка.
INFLECTION_ENDINGS = frozenset(
    """
    а я о е ё ы и у ю ь й ом ем ём ой ей ою ею ам ям ах ях ами ями ов ев ёв ий ый ая яя ое ее ые ие ого его ому ему
    ым им ых их ую юю ть ти л ла ло ли ет ёт ит ут ют ат ят ешь ишь ете ите
    """.split()
) | {""}
MIN_STEM_LENGTH = 4
ABBREVIATION_MAX_LENGTH = 6
REFLEXIVE_SUFFIXES = ("ся", "сь")  # «проводилась» ↔ «проводились»: возвратная частица поверх окончания
SENTENCE_END = frozenset(".!?")

WORD_PATTERN = re.compile(r"[А-Яа-яЁё]+")
DOUBLE_SPACE_PATTERN = re.compile(r" {2,}")
SPACE_BEFORE_PUNCTUATION_PATTERN = re.compile(r"\s+([,.;:!?])")
LOWERCASE_START_PATTERN = re.compile(r"^[а-яё]")
DEFAULT_FIELD = "text"
ADDRESS_FIELD_PATTERN = re.compile(r"address|addr|street|адрес|улиц", re.IGNORECASE)


@dataclass(frozen=True)
class GrammarError:
    field: str
    fragment: str
    wrong: str
    expected: str
    type: str  # spelling | syntax

    def to_contract(self) -> dict[str, str]:
        return asdict(self)


def _normalize(word: str) -> str:
    return word.lower().replace("ё", "е")


@lru_cache(maxsize=1)
def _domain_words() -> frozenset[str]:
    if not DOMAIN_WORDS.exists():
        return frozenset()
    return frozenset(_normalize(w.strip()) for w in DOMAIN_WORDS.read_text(encoding="utf-8").splitlines() if w.strip())


def _cache_path() -> Path:
    from app.config import get_settings

    return get_settings().var_dir / "symspell_ru.pkl"


def _cache_fresh(cache: Path) -> bool:
    if not cache.exists():
        return False
    sources = [FREQUENCY_DICT, DOMAIN_WORDS] if DOMAIN_WORDS.exists() else [FREQUENCY_DICT]
    return all(cache.stat().st_mtime >= src.stat().st_mtime for src in sources)


@lru_cache(maxsize=1)
def _symspell():
    """SymSpell с частотным словарём и доменными словами; None — словаря нет (фолбэк: только синтаксис).

    Первая сборка (~160 тыс. слов) занимает секунды, поэтому индекс кэшируется в var/symspell_ru.pkl.
    """
    if not FREQUENCY_DICT.exists():
        return None
    from symspellpy import SymSpell

    sym = SymSpell(max_dictionary_edit_distance=MAX_EDIT_DISTANCE, prefix_length=PREFIX_LENGTH)
    cache = _cache_path()
    if _cache_fresh(cache):
        try:
            if sym.load_pickle(str(cache)):
                return sym
        except Exception:  # noqa: BLE001 — битый кэш пересобираем
            pass
    for line in FREQUENCY_DICT.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) != 2 or not parts[1].isdigit():
            continue
        word = _normalize(parts[0])
        if WORD_PATTERN.fullmatch(parts[0]) is None:
            continue
        sym.create_dictionary_entry(word, int(parts[1]))
    for word in _domain_words():
        sym.create_dictionary_entry(word, DOMAIN_WORD_FREQUENCY)
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        sym.save_pickle(str(cache))
    except OSError:
        pass
    return sym


def available() -> bool:
    return _symspell() is not None


def _restore_case(source: str, suggestion: str) -> str:
    if source.isupper():
        return suggestion.upper()
    if source[:1].isupper():
        return suggestion[:1].upper() + suggestion[1:]
    return suggestion


def _is_abbreviation(word: str) -> bool:
    """ДДС, ЕДДС, ЦУКС, МосгорБТИ: заглавные внутри слова — сокращение, основания для замены нет."""
    if word.isupper():
        return len(word) <= ABBREVIATION_MAX_LENGTH
    return any(char.isupper() for char in word[1:])


def _is_ending(tail: str) -> bool:
    if tail.endswith(REFLEXIVE_SUFFIXES):
        tail = tail[:-2]
    return tail in INFLECTION_ENDINGS


def _is_inflection(source: str, candidate: str) -> bool:
    """«запахе» ↔ «запах», «уведомлена» ↔ «уведомлен»: общая основа, различаются только окончания."""
    stem = 0
    for left, right in zip(source, candidate, strict=False):
        if left != right:
            break
        stem += 1
    if stem < MIN_STEM_LENGTH:
        return False
    return _is_ending(source[stem:]) and _is_ending(candidate[stem:])


def suggest(word: str, *, proper_name: bool = False) -> str | None:
    """Исправление слова или None, если слово известно / слишком короткое / уверенной замены нет.

    `proper_name` — слово с заглавной внутри фразы: заменяется только на доменное слово (иначе фамилия
    заявителя «Карпин» стала бы «Картин»).
    """
    from symspellpy import Verbosity

    sym = _symspell()
    if sym is None or len(word) < MIN_WORD_LENGTH or _is_abbreviation(word):
        return None
    norm = _normalize(word)
    if norm in _domain_words():
        return None
    known = sym.words.get(norm)
    if known is not None and known >= WEAK_KNOWN_FREQUENCY:
        return None
    verbosity = Verbosity.ALL if known is not None else Verbosity.CLOSEST
    suggestions = sym.lookup(norm, verbosity, max_edit_distance=MAX_EDIT_DISTANCE, include_unknown=False)
    suggestions = sorted((s for s in suggestions if s.term != norm), key=lambda s: (s.distance, -s.count))
    if not suggestions:
        return None
    best = suggestions[0]
    if best.count < MIN_SUGGESTION_FREQUENCY or _is_inflection(norm, best.term):
        return None
    if proper_name and best.term not in _domain_words():
        return None
    if known is not None:
        strong = best.distance == 1 and (best.term in _domain_words() or best.count >= known * WEAK_KNOWN_RATIO)
        if not strong:
            return None
    # Замена на слово другой длины при дистанции 2 у коротких слов слишком рискованна — пропускаем.
    if best.distance == MAX_EDIT_DISTANCE and len(norm) < MIN_WORD_LENGTH + 2:
        return None
    return _restore_case(word, best.term)


def _sentence_start(text: str, position: int) -> bool:
    before = text[:position].rstrip()
    return not before or before[-1] in SENTENCE_END


def check_spelling(text: str, field: str = DEFAULT_FIELD, *, skip: tuple[tuple[int, int], ...] = ()) -> list[GrammarError]:
    """Орфография; `fragment` — точный срез исходного текста от предыдущего слова, `skip` — диапазоны без проверки."""
    errors: list[GrammarError] = []
    previous_start: int | None = None
    for match in WORD_PATTERN.finditer(text):
        word = match.group(0)
        if any(start <= match.start() < end for start, end in skip):
            previous_start = match.start()
            continue
        proper_name = word[:1].isupper() and not _sentence_start(text, match.start())
        expected = suggest(word, proper_name=proper_name)
        if expected is not None:
            fragment = text[previous_start if previous_start is not None else match.start() : match.end()]
            errors.append(GrammarError(field=field, fragment=fragment, wrong=word, expected=expected, type="spelling"))
        previous_start = match.start()
    return errors


def check_syntax(text: str, field: str = DEFAULT_FIELD) -> list[GrammarError]:
    errors: list[GrammarError] = []
    trimmed = text.strip()
    first = WORD_PATTERN.search(trimmed)
    first_word = first.group(0) if first else ""
    if first_word and trimmed.startswith(first_word) and LOWERCASE_START_PATTERN.match(first_word):
        expected = first_word[0].upper() + first_word[1:]
        errors.append(GrammarError(field=field, fragment=first_word, wrong=first_word, expected=expected, type="syntax"))
    for match in DOUBLE_SPACE_PATTERN.finditer(trimmed):
        errors.append(GrammarError(field=field, fragment=match.group(0), wrong=match.group(0), expected=" ", type="syntax"))
    for match in SPACE_BEFORE_PUNCTUATION_PATTERN.finditer(trimmed):
        errors.append(GrammarError(field=field, fragment=match.group(0), wrong=match.group(0), expected=match.group(1), type="syntax"))
    return errors


def check(text: str, field: str = DEFAULT_FIELD) -> list[GrammarError]:
    """Проверка одного поля: орфография (symspell) + синтаксис. Пустой текст — без ошибок."""
    if not text or not text.strip():
        return []
    return [*check_spelling(text, field), *check_syntax(text, field)]


def is_address_field(field: str) -> bool:
    return ADDRESS_FIELD_PATTERN.search(field) is not None


def _locate(text: str, query: str) -> tuple[int, int] | None:
    """Диапазон улицы в исходном тексте: запрос справочника собран из слов без точек («ул Зверенецкая»)."""
    tokens = query.split()
    if not tokens:
        return None
    start = text.find(tokens[0])
    if start < 0:
        return None
    end = start + len(tokens[0])
    for token in tokens[1:]:
        position = text.find(token, end)
        if position < 0:
            return None
        end = position + len(token)
    return start, end


def check_address(text: str, field: str) -> list[GrammarError]:
    """Адресное поле: улица — по справочнику R3 (похожая → замечание, неизвестная → без замечания),
    остальные слова — орфография; синтаксические правила текста к адресу («ул. …») не применяются."""
    if not text or not text.strip():
        return []
    from ml.nlp import address as address_nlp

    if not address_nlp.load_streets():
        return check_spelling(text, field)
    match = address_nlp.match(text)
    span = _locate(text, match.query)
    if span is None:
        return check_spelling(text, field)
    errors = check_spelling(text, field, skip=(span,))
    if match.lookalike and match.street is not None:
        street = text[span[0] : span[1]]
        errors.insert(0, GrammarError(field=field, fragment=street, wrong=street, expected=match.street.name, type="spelling"))
    return errors


def check_field(text: str, field: str = DEFAULT_FIELD) -> list[GrammarError]:
    """Проверка одного поля с учётом его вида: адресное — по справочнику улиц, иначе — `check`."""
    return check_address(text, field) if is_address_field(field) else check(text, field)


def check_fields(fields: dict[str, str], *, skip: tuple[str, ...] = ("outfitNumber",)) -> list[GrammarError]:
    """Все поля ручного ввода (CardEvent.enteredText) в порядке ключей; числовые поля не проверяются."""
    errors: list[GrammarError] = []
    for field, text in fields.items():
        if field in skip or not isinstance(text, str):
            continue
        errors.extend(check(text, field))
    return errors
