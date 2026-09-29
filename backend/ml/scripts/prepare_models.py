"""Explicit network entry point for preparing and verifying local ML assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath
from urllib.request import urlopen

from app.config import BACKEND_DIR, get_settings

MODELS = {
    "embedder": {"repo": "cointegrated/rubert-tiny2", "dir": "rubert-tiny2"},
    "dedup": {"repo": "intfloat/multilingual-e5-small", "dir": "multilingual-e5-small"},
    "symspell": {
        "source": BACKEND_DIR / "data/dict/ru_frequency.txt",
        "sha256": "edb789e4092f31b97e7241a519d572b2f4c3df73901bc2111e6b1014b94eb1de",
        "dir": "symspell",
        "file": "ru_frequency.txt",
    },
    "tts": {
        "url": "https://models.silero.ai/models/tts/ru/v4_ru.pt",
        "sha256": "896ab96347d5bd781ab97959d4fd6885620e5aab52405d3445626eb7c1414b00",
        "dir": "silero",
        "file": "v4_ru.pt",
    },
    "stt": {
        "url": "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip",
        "sha256": "961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4",
        "dir": "vosk-model-small-ru-0.22",
    },
}
DEFAULT_MODELS = ("embedder", "dedup", "symspell")
HF_PATTERNS = ("*.json", "*.txt", "*.safetensors", "*.model", "*.bin")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _text_sha256(path: Path) -> str:
    """Use the repository's LF bytes despite Git's Windows CRLF checkout."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _manifest(target: Path, source: str, files: list[Path]) -> None:
    data = {"source": source, "files": {str(path.relative_to(target).as_posix()): sha256(path) for path in files}}
    tmp = target / ".sha256.json.part"
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(target / ".sha256.json")


def verify(name: str, models_dir: Path) -> Path:
    spec = MODELS[name]
    target = models_dir / spec["dir"]
    manifest = target / ".sha256.json"
    if not manifest.is_file():
        raise ValueError(f"{name}: нет {manifest}; запустите подготовку модели")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    files = data.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError(f"{name}: пустой или повреждённый манифест")
    for relative, expected in files.items():
        path = target / relative
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"{name}: контрольная сумма не совпала: {relative}")
    return target


def _download_file(url: str, destination: Path, expected: str) -> None:
    if destination.is_file() and sha256(destination) == expected:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.name + ".part")
    try:
        with urlopen(url, timeout=120) as response, part.open("wb") as output:  # noqa: S310 — адреса фиксированы в MODELS
            shutil.copyfileobj(response, output)
        if sha256(part) != expected:
            raise ValueError(f"Контрольная сумма не совпала: {url}")
        part.replace(destination)
    finally:
        part.unlink(missing_ok=True)


def _prepare_hf(name: str, target: Path) -> None:
    from huggingface_hub import HfApi, snapshot_download

    repo = MODELS[name]["repo"]
    info = HfApi().model_info(repo, files_metadata=True)
    revision = info.sha
    snapshot_download(repo_id=repo, revision=revision, local_dir=str(target), allow_patterns=list(HF_PATTERNS))
    expected = {item.rfilename: item for item in info.siblings}
    files = [p for p in target.rglob("*") if p.is_file() and ".cache" not in p.parts and p.name != ".sha256.json"]
    if not files:
        raise ValueError(f"{name}: не получены файлы модели")
    for path in files:
        relative = path.relative_to(target).as_posix()
        sibling = expected.get(relative)
        if sibling is None:
            raise ValueError(f"{name}: файл отсутствует в реестре: {relative}")
        lfs = sibling.lfs
        if lfs and lfs.get("sha256"):
            valid = sha256(path) == lfs["sha256"]
        elif sibling.blob_id:
            content = path.read_bytes()
            valid = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest() == sibling.blob_id  # noqa: S324 — Git blob ID
        else:
            raise ValueError(f"{name}: нет контрольной суммы: {relative}")
        if not valid:
            raise ValueError(f"{name}: контрольная сумма не совпала: {relative}")
    _manifest(target, f"https://huggingface.co/{repo}/tree/{revision}", files)


def _prepare_stt(target: Path, models_dir: Path) -> None:
    spec = MODELS["stt"]
    archive = models_dir / "_downloads" / "vosk-model-small-ru-0.22.zip"
    _download_file(spec["url"], archive, spec["sha256"])
    files = []
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            parts = PurePosixPath(item.filename).parts
            if not parts or parts[0] != spec["dir"] or "\\" in item.filename or any(part in (".", "..") for part in parts):
                raise ValueError(f"Небезопасный путь в архиве Vosk: {item.filename}")
            if item.is_dir():
                continue
            if len(parts) < 2:
                raise ValueError(f"Небезопасный путь в архиве Vosk: {item.filename}")
            path = target.joinpath(*parts[1:])
            path.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(item) as source, path.open("wb") as output:
                shutil.copyfileobj(source, output)
            files.append(path)
    if not files:
        raise ValueError("Архив Vosk пуст")
    _manifest(target, spec["url"], files)


def download(name: str, models_dir: Path) -> Path:
    spec = MODELS[name]
    target = models_dir / spec["dir"]
    target.mkdir(parents=True, exist_ok=True)
    if "repo" in spec:
        _prepare_hf(name, target)
    elif name == "stt":
        _prepare_stt(target, models_dir)
    elif "source" in spec:
        source = spec["source"]
        if _text_sha256(source) != spec["sha256"]:
            raise ValueError(f"{name}: контрольная сумма исходного словаря не совпала")
        destination = target / spec["file"]
        shutil.copyfile(source, destination)
        _manifest(target, str(source), [destination])
    else:
        destination = target / spec["file"]
        _download_file(spec["url"], destination, spec["sha256"])
        _manifest(target, spec["url"], [destination])
    return verify(name, models_dir)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Подготовка и проверка локальных ML-моделей")
    parser.add_argument("--only", nargs="+", choices=sorted(MODELS))
    parser.add_argument("--tts", action="store_true", help="Скачать Silero TTS")
    parser.add_argument("--stt", action="store_true", help="Скачать Vosk STT")
    parser.add_argument("--llm", action="store_true", help="Загрузить OLLAMA_MODEL через ollama pull")
    parser.add_argument("--verify-only", action="store_true", help="Проверить локальные контрольные суммы без сети")
    args = parser.parse_args(argv)
    names = list(args.only if args.only is not None else DEFAULT_MODELS)
    for flag in ("tts", "stt"):
        if getattr(args, flag) and flag not in names:
            names.append(flag)
    models_dir = get_settings().models_dir
    for name in names:
        path = verify(name, models_dir) if args.verify_only else download(name, models_dir)
        print(f"{name}: {path} (SHA-256 OK)")
    if args.llm:
        model = get_settings().ollama_model
        command = ["ollama", "show" if args.verify_only else "pull", model]
        subprocess.run(command, check=True)  # noqa: S603 — фиксированный CLI, аргументы без shell
        print(f"llm: {model} (Ollama OK)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
