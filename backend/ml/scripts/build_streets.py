"""Сборка справочника улиц Москвы `backend/data/streets/moscow_streets.json` из OSM-выгрузки (R3).

Выгрузка делается на машине с интернетом (Overpass API), в репозитории лежит готовый JSON.
Запуск: `uv run python -m ml.scripts.build_streets --fetch` (скачать и собрать)
        `uv run python -m ml.scripts.build_streets --from-tsv path/to/osm_streets.tsv` (только собрать).

Формат записи: { name, norm, type, okrug?, raion? } — `name` как в OSM («Дубнинская улица»),
`norm` — нормализованное имя без типа для fuzzy-поиска («дубнинская»), `type` — тип улицы.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from ml.nlp.address import normalize_street, split_street_type

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MOSCOW_AREA_ID = 3602555133  # relation 2555133 «Москва»
QUERY = f"""[out:csv(name, "addr:district", "addr:suburb"; false; "\\t")][timeout:240];
area({MOSCOW_AREA_ID})->.msk;
way["highway"]["name"](area.msk);
out tags;
"""
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "streets"
OUTPUT = DATA_DIR / "moscow_streets.json"
# Служебные названия, которые OSM хранит как name у highway, но улицами они не являются.
SKIP_PATTERN = re.compile(r"^(МКАД|ТТК|А-\d|М-\d|Р-\d|\d+-й км|.*\bдублёр\b.*|.*\bразворот\b.*|.*\bсъезд\b.*)$", re.IGNORECASE)


def fetch_tsv() -> str:
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    request = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "responders-academy-build-streets/0.1"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read().decode("utf-8")


def build(tsv: str) -> list[dict[str, str]]:
    seen: dict[str, dict[str, str]] = {}
    for line in tsv.splitlines():
        parts = line.split("\t")
        name = parts[0].strip()
        if not name or SKIP_PATTERN.match(name) or not re.search(r"[А-Яа-яЁё]", name):
            continue
        street_type, core = split_street_type(name)
        norm = normalize_street(name)
        if not norm or len(norm) < 3:
            continue
        key = f"{norm}|{street_type}"
        if key in seen:
            continue
        entry: dict[str, str] = {"name": name, "norm": norm, "type": street_type}
        raion = parts[1].strip() if len(parts) > 1 else ""
        suburb = parts[2].strip() if len(parts) > 2 else ""
        if raion:
            entry["raion"] = raion
        elif suburb:
            entry["raion"] = suburb
        _ = core
        seen[key] = entry
    return sorted(seen.values(), key=lambda e: (e["norm"], e["type"]))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Сборка справочника улиц Москвы")
    parser.add_argument("--fetch", action="store_true", help="скачать выгрузку из Overpass API")
    parser.add_argument("--from-tsv", type=Path, default=None, help="готовая TSV-выгрузка (name, addr:district, addr:suburb)")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)
    if args.fetch:
        tsv = fetch_tsv()
    elif args.from_tsv:
        tsv = args.from_tsv.read_text(encoding="utf-8")
    else:
        parser.error("укажите --fetch или --from-tsv")
    streets = build(tsv)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump({"source": "OpenStreetMap (Overpass API), ODbL", "count": len(streets), "streets": streets}, handle, ensure_ascii=False, indent=0)
    print(f"{args.output}: {len(streets)} улиц")
    return 0


if __name__ == "__main__":
    sys.exit(main())
