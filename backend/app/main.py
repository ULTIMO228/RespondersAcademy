"""FastAPI-приложение: совместимый контракт под /api/mock и /api/v1, новые эндпоинты — только /api/v1."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from app.api.compat import build_router as build_compat_router
from app.api.errors import install_error_handlers
from app.config import get_settings
from app.db.session import init_db

log = logging.getLogger("uvicorn.error")


def model_status(models_dir: Path) -> dict[str, dict[str, bool]]:
    """Report local artifacts and in-process caches without loading large models."""
    from app.config import BACKEND_DIR

    checks = {
        "embedder": (models_dir / "rubert-tiny2/config.json", "ml.nlp.embedder", "_model"),
        "dedup": (models_dir / "multilingual-e5-small/config.json", "ml.nlp.dedup", "_e5_model"),
        "symspell": (BACKEND_DIR / "data/dict/ru_frequency.txt", "ml.nlp.grammar", "_symspell"),
        "tts": (models_dir / "silero/v4_ru.pt", "ml.speech.tts", "_model"),
        "stt": (models_dir / "vosk-model-small-ru-0.22/am", "ml.speech.stt", "_model"),
    }
    result = {}
    for name, (path, module_name, attribute) in checks.items():
        module = sys.modules.get(module_name)
        cached = getattr(module, attribute, None) if module else None
        loaded = bool(cached.cache_info().currsize) if hasattr(cached, "cache_info") else cached is not None
        result[name] = {"installed": path.exists(), "loaded": loaded}
    return result


def warmup_ml() -> None:
    """Прогрев ML-компонент в фоне: первая оценка попытки на холодном процессе (эмбеддер, индекс symspell,
    классификатор) иначе занимает десятки секунд и упирается в тайм-аут прокси фронта (FR: оценка ≤ 5 с)."""
    started = time.perf_counter()
    from ml.classify import ekp_group_classifier as classifier
    from ml.nlp import embedder, grammar

    parts = {"embedder": embedder.available(), "spellcheck": grammar.available(), "classifier": classifier.mode()}
    log.info("ML warmup за %.1f с: %s", time.perf_counter() - started, parts)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.sqlite:
        await init_db()
    if settings.ml_warmup:
        asyncio.get_running_loop().run_in_executor(None, warmup_ml)  # не блокирует старт — запросы принимаются сразу
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Responders Academy backend", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    install_error_handlers(app)
    compat = build_compat_router()
    for prefix in settings.api_prefixes:
        app.include_router(compat, prefix=prefix)
    from app.api.v1 import build_router as build_v1_router

    app.include_router(build_v1_router(), prefix="/api/v1")

    @app.get("/api/v1/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "db": "sqlite" if settings.sqlite else "postgresql", "version": app.version, "models": model_status(settings.models_dir)}

    @app.get("/api/v1/metrics/ml")
    async def ml_metrics() -> dict[str, Any]:
        path = settings.var_dir / "metrics.json"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="ML metrics not generated")
        return json.loads(path.read_text(encoding="utf-8"))

    return app


app = create_app()
