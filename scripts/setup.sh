#!/usr/bin/env bash
# Первичная установка «всё сразу»: зависимости фронта и бэкенда, база с сидами, модель ИИ и движок llama.cpp.
#   ./scripts/setup.sh              # полная установка (модель ~540 МБ качается один раз, с докачкой)
#   ./scripts/setup.sh --no-model   # без ИИ-модели: генерация карточек останется на статичных шаблонах
# Повторный запуск безопасен: готовое не скачивается и не пересобирается (модель сверяется по sha256).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_MODEL=1
for arg in "$@"; do
  case "$arg" in
    --no-model) WITH_MODEL=0 ;;
    -h|--help) sed -n 2,6p "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "Не найден '$1'. $2" >&2; exit 1; }; }
need node "Установите Node.js 20+ (https://nodejs.org)."
need npm "Идёт вместе с Node.js."
need uv "Установите uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
need python3 "Нужен Python 3.9+ (лаунчер модели использует только стандартную библиотеку)."

cd "$ROOT"
echo "==> [1/4] Фронтенд: npm ci"
npm ci

echo "==> [2/4] Бэкенд: uv sync"
(cd backend && uv sync --group dev)

echo "==> [3/4] База данных и демо-данные"
export JWT_SECRET="${JWT_SECRET:-dev-secret-dev-secret-dev-secret-dev-secret}"
(cd backend && uv run python -m app.seed.load --reset && uv run python scripts/seed_ai_demo_source.py)

if [ "$WITH_MODEL" = 1 ]; then
  echo "==> [4/4] ИИ-модель и llama.cpp (сеть нужна только сейчас)"
  python3 backend/ml/scripts/run_semantic_model.py --download-only
else
  echo "==> [4/4] Пропущено (--no-model)"
fi

echo
echo "Готово. Запуск всего стенда:  ./scripts/ai-up.sh"
