FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_SYSTEM_PYTHON=1
RUN pip install --no-cache-dir uv

WORKDIR /app/backend
COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app
COPY backend/ml ./ml
COPY backend/data ./data

RUN uv pip install --system ".[pg]"

EXPOSE 8000
# Схему создаёт сид (create_all); миграции Alembic — T109.
CMD ["sh", "-c", "python -m app.seed.load && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
