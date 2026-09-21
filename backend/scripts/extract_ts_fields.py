"""T073: обязательные поля TS-типов фронта → `tests/contract/expected_fields.json`.

Разбирает `export interface X [extends Y] { … }` и `export type X = { … }` в `src/shared/api/types/*.ts`
(без компилятора TypeScript — достаточно регулярных выражений и подсчёта скобок): поле обязательно, если оно
объявлено без `?`. Наследование (`extends`) раскрывается. Запуск: `uv run python scripts/extract_ts_fields.py`
(из `backend/`); тест `tests/contract/test_response_shapes.py` сверяет ответы GET-эндпоинтов с этим файлом.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
TYPES_DIR = BACKEND_DIR.parent / "src" / "shared" / "api" / "types"
OUTPUT = BACKEND_DIR / "tests" / "contract" / "expected_fields.json"

DECLARATION = re.compile(r"export\s+(?:interface\s+(?P<iname>\w+)(?:<[^>]*>)?(?:\s+extends\s+(?P<extends>[\w<>,\s]+?))?\s*\{|type\s+(?P<tname>\w+)(?:<[^>]*>)?\s*=\s*\{)")
FIELD = re.compile(r"^\s*(?:readonly\s+)?(?P<name>\w+)(?P<optional>\?)?\s*:")


def strip_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", source)


def body_after(source: str, start: int) -> str:
    """Тело `{ … }` от позиции открывающей скобки (включительно) с учётом вложенности."""
    depth = 0
    for index in range(start, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    raise ValueError("незакрытая скобка")


def top_level_fields(body: str) -> tuple[list[str], list[str]]:
    """Поля первого уровня: вложенные объектные типы и generics не раскрываются."""
    required: list[str] = []
    optional: list[str] = []
    depth = 0
    for raw_line in body.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if depth == 0:
            match = FIELD.match(line)
            if match:
                (optional if match.group("optional") else required).append(match.group("name"))
        depth += line.count("{") + line.count("(") + line.count("<") - line.count("}") - line.count(")") - line.count(">")
        depth = max(depth, 0)
    return required, optional


def parse_file(path: Path) -> dict[str, dict[str, Any]]:
    source = strip_comments(path.read_text(encoding="utf-8"))
    result: dict[str, dict[str, Any]] = {}
    for match in DECLARATION.finditer(source):
        name = match.group("iname") or match.group("tname")
        body = body_after(source, match.end() - 1)
        required, optional = top_level_fields(body)
        parents = [p.strip().split("<", 1)[0] for p in (match.group("extends") or "").split(",") if p.strip()]
        result[name] = {"file": path.name, "required": required, "optional": optional, "extends": parents}
    return result


def resolve_extends(types: dict[str, dict[str, Any]]) -> None:
    def merged(name: str, seen: frozenset[str]) -> tuple[list[str], list[str]]:
        entry = types[name]
        required, optional = list(entry["required"]), list(entry["optional"])
        for parent in entry["extends"]:
            if parent in types and parent not in seen:
                parent_required, parent_optional = merged(parent, seen | {name})
                required = [*parent_required, *(f for f in required if f not in parent_required)]
                optional = [*parent_optional, *(f for f in optional if f not in parent_optional)]
        return required, optional

    for name in list(types):
        types[name]["required"], types[name]["optional"] = merged(name, frozenset())


def extract(types_dir: Path = TYPES_DIR) -> dict[str, dict[str, Any]]:
    types: dict[str, dict[str, Any]] = {}
    for path in sorted(types_dir.glob("*.ts")):
        types.update(parse_file(path))
    # Аналог `Omit<User, "password">` — единственный служебный alias, который нужен сверке ответов.
    if "User" in types and "PublicUser" not in types:
        user = types["User"]
        types["PublicUser"] = {"file": user["file"], "required": [f for f in user["required"] if f != "password"], "optional": [f for f in user["optional"] if f != "password"], "extends": []}
    resolve_extends(types)
    return dict(sorted(types.items()))


def main(argv: list[str] | None = None) -> int:
    output = Path(argv[0]) if argv else OUTPUT
    types = extract()
    output.write_text(json.dumps({"source": TYPES_DIR.relative_to(BACKEND_DIR.parent).as_posix(), "types": types}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(types)} типов → {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
