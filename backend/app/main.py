"""FastAPI-приложение: совместимый контракт под /api/mock и /api/v1, новые эндпоинты — только /api/v1."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app.api.compat import build_router as build_compat_router
from app.api.errors import install_error_handlers
from app.config import get_settings
from app.db.session import init_db

log = logging.getLogger("uvicorn.error")


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
    install_error_handlers(app)
    compat = build_compat_router()
    for prefix in settings.api_prefixes:
        app.include_router(compat, prefix=prefix)
    try:
        from app.api.v1 import build_router as build_v1_router

        app.include_router(build_v1_router(), prefix="/api/v1")
    except ImportError:
        pass

    @app.get("/api/v1/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "db": "sqlite" if settings.sqlite else "postgresql", "version": app.version}

    return app


app = create_app()
