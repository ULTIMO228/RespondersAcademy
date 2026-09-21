FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_SYSTEM_PYTHON=1
RUN pip install --no-cache-dir uv

WORKDIR /app/backend
COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app
COPY backend/ml ./ml
COPY backend/data ./data
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini

RUN uv pip install --system ".[pg]"

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed.load && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
