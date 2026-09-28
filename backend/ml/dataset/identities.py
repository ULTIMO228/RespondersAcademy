"""Синтетические личности и подмена персональных полей в фабулах билетов.

Билеты уже обезличены заказчиком (Q&A в10), но фабулы содержат ФИО, даты рождения и госномера. Для датасета все
такие поля детерминированно заменяются сгенерированными: один и тот же `card_id` всегда даёт одну и ту же замену.
Пул допустимых значений (`allowed_*`) используется валидатором: всё, что похоже на ПДн и не из пула/фабулы, — брак.
"""

from __future__ import annotations

import hashlib
import random
import re
from dataclasses import dataclass

# Пары (мужская, женская форма). Подобраны нейтрально, без громких фамилий.
SURNAMES: list[tuple[str, str]] = [
    ("Абрамов", "Абрамова"), ("Аксенов", "Аксенова"), ("Артемьев", "Артемьева"), ("Барышев", "Барышева"),
    ("Белкин", "Белкина"), ("Березин", "Березина"), ("Блинов", "Блинова"), ("Богданов", "Богданова"),
    ("Бородин", "Бородина"), ("Буров", "Бурова"), ("Быков", "Быкова"), ("Васильчиков", "Васильчикова"),
    ("Веселов", "Веселова"), ("Виноградов", "Виноградова"), ("Власов", "Власова"), ("Гаврилов", "Гаврилова"),
    ("Голубев", "Голубева"), ("Горелов", "Горелова"), ("Григорьев", "Григорьева"), ("Гусев", "Гусева"),
    ("Данилов", "Данилова"), ("Денисов", "Денисова"), ("Дроздов", "Дроздова"), ("Елисеев", "Елисеева"),
    ("Ершов", "Ершова"), ("Жуков", "Жукова"), ("Зайцев", "Зайцева"), ("Захаров", "Захарова"),
    ("Исаков", "Исакова"), ("Карпов", "Карпова"), ("Кириллов", "Кириллова"), ("Климов", "Климова"),
    ("Колесников", "Колесникова"), ("Комаров", "Комарова"), ("Кондратьев", "Кондратьева"), ("Лаптев", "Лаптева"),
    ("Логинов", "Логинова"), ("Мартынов", "Мартынова"), ("Медведев", "Медведева"), ("Михеев", "Михеева"),
    ("Никитин", "Никитина"), ("Носков", "Носкова"), ("Орлов", "Орлова"), ("Пахомов", "Пахомова"),
    ("Родионов", "Родионова"), ("Рябов", "Рябова"), ("Савельев", "Савельева"), ("Тарасов", "Тарасова"),
    ("Уваров", "Уварова"), ("Фомин", "Фомина"), ("Хохлов", "Хохлова"), ("Шаров", "Шарова"),
]
MALE_NAMES = [
    "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим", "Валерий", "Василий", "Виктор",
    "Владимир", "Геннадий", "Георгий", "Денис", "Дмитрий", "Евгений", "Игорь", "Константин", "Леонид", "Максим",
    "Михаил", "Николай", "Олег", "Павел", "Роман", "Сергей", "Станислав", "Тимофей", "Юрий", "Ярослав",
]
FEMALE_NAMES = [
    "Александра", "Алёна", "Анастасия", "Анна", "Валентина", "Вера", "Виктория", "Галина", "Дарья", "Евгения",
    "Екатерина", "Елена", "Инна", "Ирина", "Камилла", "Кира", "Лариса", "Людмила", "Марина", "Мария",
    "Надежда", "Наталья", "Нина", "Ольга", "Полина", "Светлана", "Софья", "Татьяна", "Юлия", "Яна",
]
# Имена отцов → отчества (мужское, женское).
PATRONYMICS: list[tuple[str, str]] = [
    ("Александрович", "Александровна"), ("Алексеевич", "Алексеевна"), ("Андреевич", "Андреевна"),
    ("Борисович", "Борисовна"), ("Васильевич", "Васильевна"), ("Викторович", "Викторовна"),
    ("Владимирович", "Владимировна"), ("Геннадьевич", "Геннадьевна"), ("Григорьевич", "Григорьевна"),
    ("Денисович", "Денисовна"), ("Дмитриевич", "Дмитриевна"), ("Евгеньевич", "Евгеньевна"),
    ("Игоревич", "Игоревна"), ("Иванович", "Ивановна"), ("Константинович", "Константиновна"),
    ("Леонидович", "Леонидовна"), ("Михайлович", "Михайловна"), ("Николаевич", "Николаевна"),
    ("Олегович", "Олеговна"), ("Павлович", "Павловна"), ("Романович", "Романовна"),
    ("Сергеевич", "Сергеевна"), ("Станиславович", "Станиславовна"), ("Юрьевич", "Юрьевна"),
]
PLATE_LETTERS = "АВЕКМНОРСТУХ"
PLATE_REGIONS = ["77", "99", "177", "197", "199", "777", "50", "150"]

FEMALE_PATRONYMIC = re.compile(r"(?:овна|евна|ична|ьевна|инична)$")
# Фамилия Имя Отчество (отчество якорит распознавание, чтобы не цеплять «Бульвар Маршала Рокоссовского» и т.п.).
FULL_NAME = re.compile(
    r"(?P<sur>[А-ЯЁ][а-яё]+)\s+(?P<name>[А-ЯЁ][а-яё]+)\s+(?P<pat>[А-ЯЁ][а-яё]+(?:ович|евич|ьич|мич|овна|евна|ьевна|ична|инична))"
)
# Двусловные имена без отчества, найденные ручным просмотром 96 карточек: card_id → (шаблон, пол).
# Третий элемент — ключ генерации: карточка-дубль (c-047 = c-003) получает то же имя, что и оригинал.
SHORT_NAMES: dict[str, tuple[str, str, str]] = {
    "c-003": ("Смирнов Илья", "m", "c-003"),
    "c-047": ("Смирнов Илья", "m", "c-003"),
    "c-065": ("Соловьёв Максим", "m", "c-065"),
    "c-069": ("Степанов Гриша", "m", "c-069"),
}
DOB_LABELED = re.compile(r"д/р\s+\d{2}\.\d{2}\.(?P<year>\d{4})")
DOB_SUFFIX = re.compile(r"\d{2}\.\d{2}\.(?P<year>\d{4})\s*г\.р\.")
PLATE = re.compile(r"[А-Яа-я]\s?\d{3}\s?[А-Яа-я]{2}\s?\d{2,3}")

PHONE_ALLOWED = re.compile(r"\+7 \(900\) 000-\d{2}-\d{2}")


def _rng(*parts: object) -> random.Random:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


@dataclass(frozen=True)
class Person:
    surname: str
    name: str
    patronymic: str
    female: bool

    @property
    def full(self) -> str:
        return f"{self.surname} {self.name} {self.patronymic}"

    @property
    def short(self) -> str:
        return f"{self.surname} {self.name}"


def make_person(seed: str, *, female: bool | None = None) -> Person:
    rng = _rng("person", seed)
    is_female = rng.random() < 0.5 if female is None else female
    pair = rng.choice(SURNAMES)
    pat = rng.choice(PATRONYMICS)
    return Person(
        surname=pair[1] if is_female else pair[0],
        name=rng.choice(FEMALE_NAMES if is_female else MALE_NAMES),
        patronymic=pat[1] if is_female else pat[0],
        female=is_female,
    )


def make_dob(seed: str, year: str) -> str:
    """День и месяц генерируются, год сохраняется: возраст пациента в фабуле не должен меняться."""
    rng = _rng("dob", seed)
    return f"{rng.randint(1, 28):02d}.{rng.randint(1, 12):02d}.{year}"


def make_plate(seed: str) -> str:
    rng = _rng("plate", seed)
    letters = [rng.choice(PLATE_LETTERS) for _ in range(3)]
    return f"{letters[0]}{rng.randint(100, 999)}{letters[1]}{letters[2]} {rng.choice(PLATE_REGIONS)}"


def make_phone(seed: str) -> str:
    rng = _rng("phone", seed)
    return f"+7 (900) 000-{rng.randint(0, 99):02d}-{rng.randint(0, 99):02d}"


def scrub_text(text: str, card_id: str) -> str:
    """Заменяет ФИО, даты рождения и госномера сгенерированными; результат детерминирован по `card_id`."""
    counter = 0

    def person_repl(match: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        female = bool(FEMALE_PATRONYMIC.search(match.group("pat")))
        return make_person(f"{card_id}:{counter}", female=female).full

    result = FULL_NAME.sub(person_repl, text)
    if card_id in SHORT_NAMES:
        pattern, gender, key = SHORT_NAMES[card_id]
        result = result.replace(pattern, make_person(f"{key}:short", female=gender == "f").short)
    result = DOB_LABELED.sub(lambda m: f"д/р {make_dob(card_id, m.group('year'))}", result)
    result = DOB_SUFFIX.sub(lambda m: f"{make_dob(card_id, m.group('year'))} г.р.", result)
    result = PLATE.sub(lambda _m: make_plate(card_id), result)
    return result


def strip_generated_persons(text: str) -> str:
    """Убирает из текста ФИО, целиком собранные из пула (фамилия+имя+отчество); остаток — кандидаты в ПДн."""
    surnames = {form for pair in SURNAMES for form in pair}
    names = set(MALE_NAMES) | set(FEMALE_NAMES)
    patronymics = {form for pair in PATRONYMICS for form in pair}

    def repl(match: re.Match[str]) -> str:
        ok = match.group("sur") in surnames and match.group("name") in names and match.group("pat") in patronymics
        return "" if ok else match.group(0)

    result = FULL_NAME.sub(repl, text)

    tokens = result.split()
    kept: list[str] = []
    i = 0
    while i < len(tokens):
        first = tokens[i].strip(",.;:")
        second = tokens[i + 1].strip(",.;:") if i + 1 < len(tokens) else ""
        if first in surnames and second in names:
            i += 2
            continue
        kept.append(tokens[i])
        i += 1
    return " ".join(kept)


def allowed_person_strings() -> set[str]:
    """Все допустимые ФИО-формы пула — для валидатора (любое ФИО вне пула и вне фабулы — брак)."""
    forms: set[str] = set()
    for male, female in SURNAMES:
        forms.update({male, female})
    return forms | set(MALE_NAMES) | set(FEMALE_NAMES)
