"""Одна команда для запуска дообученной модели смыслового разбора (Qwen3.5-0.8B, Q4_K_M, адаптер слит).

Что делает:
1. проверяет/скачивает GGUF (Google Drive или своя ссылка), сверяет sha256 с `backend/ml/semantic_model.json`;
2. находит `llama-server` (LLAMA_SERVER, PATH, backend/var/llamacpp) или скачивает официальную сборку llama.cpp;
3. поднимает OpenAI-совместимый сервер на CPU (GPU не нужен) и ждёт готовности.

Только стандартная библиотека Python 3.9+. Сеть нужна лишь при первом запуске для скачивания файлов.

    python backend/ml/scripts/run_semantic_model.py             # скачать при необходимости и запустить сервер
    python backend/ml/scripts/run_semantic_model.py --check      # запустить, прогнать пример, остановить
    python backend/ml/scripts/run_semantic_model.py --url https://…/semantic-review-Q4_K_M.gguf
    python backend/ml/scripts/semantic_review_demo.py            # запрос к уже запущенному серверу
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MANIFEST = REPO / "backend" / "ml" / "semantic_model.json"
MODELS_DIR = REPO / "backend" / "models"
LLAMA_DIR = REPO / "backend" / "var" / "llamacpp"
LLAMA_TAG = "b11258"
ASSETS = {
    ("win32", "amd64"): f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip",
    ("linux", "x86_64"): f"llama-{LLAMA_TAG}-bin-ubuntu-x64.tar.gz",
    ("linux", "aarch64"): f"llama-{LLAMA_TAG}-bin-ubuntu-arm64.tar.gz",
    ("darwin", "arm64"): f"llama-{LLAMA_TAG}-bin-macos-arm64.tar.gz",
    ("darwin", "x86_64"): f"llama-{LLAMA_TAG}-bin-macos-x64.tar.gz",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, target: Path) -> None:
    """Скачивание с докачкой: оборванный `.part` продолжается по Range, а не начинается заново."""
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    resume = tmp.stat().st_size if tmp.exists() else 0
    headers = {"User-Agent": "responders-academy/1.0", **({"Range": f"bytes={resume}-"} if resume else {})}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as resp:
        resumed = resume > 0 and resp.status == 206
        if resume and not resumed:
            resume = 0  # сервер не поддержал Range — качаем с нуля
        total = int(resp.headers.get("Content-Length") or 0) + resume
        done, t0 = resume, time.time()
        if resumed:
            print(f"  докачка с {resume / 1e6:.1f} МБ")
        with tmp.open("ab" if resumed else "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
                done += len(chunk)
                if total:
                    speed = (done - resume) / 1e6 / max(time.time() - t0, 1e-6)
                    print(f"\r  {done / 1e6:7.1f} / {total / 1e6:.1f} МБ ({100 * done // total}%)  {speed:.1f} МБ/с", end="", flush=True)
    print()
    tmp.replace(target)


def ensure_model(manifest: dict, url: str | None) -> Path:
    target = MODELS_DIR / manifest["file"]
    if target.exists() and sha256(target) == manifest["sha256"]:
        print(f"Модель на месте и проверена: {target}")
        return target
    if target.exists():
        print(f"Файл {target.name} повреждён или другой версии (sha256 не совпал), качаю заново.")
        target.unlink()
    drive_id = os.environ.get("SEMANTIC_MODEL_DRIVE_ID") or manifest.get("driveFileId")
    source = url or manifest.get("url") or (f"https://drive.usercontent.google.com/download?id={drive_id}&export=download&confirm=t" if drive_id and not drive_id.startswith("REPLACE") else None)
    if not source:
        sys.exit(f"Модели нет, а источник не задан. Положите {manifest['file']} в {MODELS_DIR} вручную или укажите --url / driveFileId в {MANIFEST.name}.")
    print(f"Скачиваю модель ({manifest['sizeBytes'] / 1e6:.0f} МБ)...")
    try:
        download(source, target)
    except (urllib.error.URLError, OSError) as err:
        sys.exit(f"Не удалось скачать модель: {err}. Скачайте файл вручную и положите в {MODELS_DIR}.")
    if sha256(target) != manifest["sha256"]:
        target.unlink()
        sys.exit("Скачанный файл не прошёл проверку sha256 (возможно, Google Drive вернул страницу с предупреждением). Скачайте вручную по ссылке из браузера.")
    print("Контрольная сумма совпала.")
    return target


def find_server() -> Path | None:
    exe = "llama-server.exe" if sys.platform == "win32" else "llama-server"
    if os.environ.get("LLAMA_SERVER") and Path(os.environ["LLAMA_SERVER"]).exists():
        return Path(os.environ["LLAMA_SERVER"])
    if shutil.which("llama-server"):
        return Path(shutil.which("llama-server"))
    for candidate in LLAMA_DIR.rglob(exe) if LLAMA_DIR.exists() else []:
        return candidate
    return None


def ensure_server() -> Path:
    found = find_server()
    if found:
        return found
    key = (sys.platform if sys.platform != "linux" else "linux", platform.machine().lower())
    asset = ASSETS.get(key)
    if not asset:
        sys.exit(f"Для платформы {key} нет готовой сборки llama.cpp. Установите llama.cpp и задайте переменную LLAMA_SERVER.")
    url = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/{asset}"
    archive = LLAMA_DIR / asset
    print(f"Скачиваю движок llama.cpp {LLAMA_TAG} ({asset})...")
    try:
        download(url, archive)
    except (urllib.error.URLError, OSError) as err:
        sys.exit(f"Не удалось скачать llama.cpp: {err}. Скачайте вручную {url} и распакуйте в {LLAMA_DIR}.")
    if asset.endswith(".zip"):
        zipfile.ZipFile(archive).extractall(LLAMA_DIR)
    else:
        with tarfile.open(archive) as tf:
            tf.extractall(LLAMA_DIR)
    server = find_server()
    if not server:
        sys.exit(f"llama-server не найден после распаковки в {LLAMA_DIR}.")
    if sys.platform != "win32":
        server.chmod(0o755)
    return server


def wait_ready(port: int, proc: subprocess.Popen, timeout: float = 180.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            sys.exit(f"llama-server завершился с кодом {proc.returncode}. Смотрите вывод выше.")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
                if r.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(1)
    proc.terminate()
    sys.exit("Сервер не стал готов за отведённое время.")


def warm_up(port: int, prompt_file: Path) -> None:
    """Сервер сразу обрабатывает системный промпт разбора (KV-кэш префикса): первый настоящий запрос быстрее."""
    body = json.dumps({"messages": [{"role": "system", "content": prompt_file.read_text(encoding="utf-8").strip()}, {"role": "user", "content": "."}], "max_tokens": 1, "cache_prompt": True}).encode()
    request = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=body, headers={"Content-Type": "application/json"})
    started = time.time()
    try:
        urllib.request.urlopen(request, timeout=120).read()
        print(f"Прогрев системного промпта: {time.time() - started:.2f} с")
    except OSError as error:
        print(f"Прогрев пропущен: {error}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8081)
    p.add_argument("--threads", type=int, default=max((os.cpu_count() or 4) // 2, 2))
    p.add_argument("--url", default=None, help="Прямая ссылка на GGUF (вместо Google Drive)")
    p.add_argument("--download-only", action="store_true", help="Только скачать и проверить модель и llama.cpp, сервер не запускать")
    p.add_argument("--check", action="store_true", help="Запустить, отправить тестовый запрос и остановить сервер")
    args = p.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    model = ensure_model(manifest, args.url)
    server = ensure_server()
    if args.download_only:
        print(f"Готово: модель {model.name} и {server.name} на месте.")
        return
    cmd = [str(server), "-m", str(model), "--port", str(args.port), "-c", "4096", "--jinja", "--reasoning", "off", "--temp", "0", "-t", str(args.threads), "--cache-reuse", "256"]
    print("Запускаю:", " ".join(cmd))
    proc = subprocess.Popen(cmd)
    try:
        wait_ready(args.port, proc)
        print(f"\nГотово: http://127.0.0.1:{args.port}  (OpenAI-совместимый API, /v1/chat/completions)")
        sys.path.insert(0, str(Path(__file__).parent))
        import semantic_review_demo

        warm_up(args.port, semantic_review_demo.PROMPT)
        if args.check:

            semantic_review_demo.run(f"http://127.0.0.1:{args.port}")
            return
        print("Пример запроса:  python backend/ml/scripts/semantic_review_demo.py\nОстановка: Ctrl+C")
        proc.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if proc.poll() is None:
            proc.terminate()


if __name__ == "__main__":
    main()
