#!/usr/bin/env bash
# T060 — стенд для демо одной командой (конституция IV: «без ручной подготовки», SC-015).
# Запуск из корня репозитория или из backend/:
#   ./scripts/demo-up.sh [--skip-build] [--backend-port PORT] [--front-port PORT]
# или:
#   backend/scripts/demo_up.sh [--skip-build] [--backend-port PORT] [--front-port PORT]
#
# Делает:
#   1. Проверяет наличие локальных моделей (Silero, Vosk, RuBERT) и сообщает о статусе/фолбэках.
#   2. Создаёт чистую БД (backend/var/demo.db, вне git), загружает сид (app.seed.load --reset).
#   3. Применяет фикстуру цепочки A → B (backend/scripts/seed_chain_demo.py, T031).
#   4. Запускает бэкенд на порту 8130 (или BACKEND_PORT).
#   5. Сохраняет .env.local (если задан) и собирает фронт с BACKEND_URL=http://127.0.0.1:BACKEND_PORT.
#   6. Запускает Next.js фронт на порту 3130 (или FRONT_PORT).
#   7. Дожидается готовности обоих сервисов и выводит сводку со ссылками и демо-учётками.
#   8. Корректно освобождает ресурсы и восстанавливает .env.local по Ctrl+C.
set -uo pipefail

START_TIME=$(date +%s)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8130}"
FRONT_PORT="${FRONT_PORT:-3130}"
DEMO_DB="${DEMO_DB:-$BACKEND_DIR/var/demo.db}"
SKIP_BUILD="${SKIP_BUILD:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --backend-port) shift; BACKEND_PORT="${1:-8130}" ;;
    --front-port) shift; FRONT_PORT="${1:-3130}" ;;
    -h|--help)
      echo "Использование: $0 [--skip-build] [--backend-port PORT] [--front-port PORT]"
      exit 0
      ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -o 2>/dev/null)" = "Msys" ] && [ -x /c/Windows/System32/curl.exe ]; then
  export PATH="/c/Windows/System32:$PATH"
fi
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

LOG_DIR="$BACKEND_DIR/var/demo-logs"
mkdir -p "$LOG_DIR"
mkdir -p "$BACKEND_DIR/var"

BACKEND_PID=""
FRONT_PID=""

kill_port() {
  local port="$1"
  if [ "$(uname -o 2>/dev/null)" = "Msys" ]; then
    netstat -ano 2>/dev/null | tr -d '\r' | awk -v p=":$port" '$2 ~ p"$" && $4 == "LISTENING" && !seen[$5]++ { print $5 }' | while read -r pid; do
      [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1 </dev/null
    done
  elif command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null || true
      for _ in $(seq 1 15); do lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.2; done
      pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
      if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
      fi
      for _ in $(seq 1 25); do lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.2; done
    fi
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" >/dev/null 2>&1 || true
  fi
}

ENV_LOCAL="$ROOT/.env.local"
ENV_LOCAL_BAK=""

cleanup() {
  echo ""
  echo "▸ Остановка демо-стенда и освобождение ресурсов..."
  [ -n "$ENV_LOCAL_BAK" ] && [ -f "$ENV_LOCAL_BAK" ] && mv -f "$ENV_LOCAL_BAK" "$ENV_LOCAL"
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  kill_port "$FRONT_PORT"
  kill_port "$BACKEND_PORT"
  wait 2>/dev/null || true
  echo "▸ Демо-стенд остановлен."
}

trap cleanup INT TERM EXIT

echo "================================================================="
echo "   Responders Academy — Демо-стенд тренажёра АРМ-112 (W4 / T060)"
echo "================================================================="
echo "▸ Освобождение портов: бэкенд $BACKEND_PORT, фронт $FRONT_PORT"
kill_port "$BACKEND_PORT"
kill_port "$FRONT_PORT"

MODELS_DIR="${MODELS_DIR:-$BACKEND_DIR/models}"
echo "▸ Проверка моделей в $MODELS_DIR:"
SILERO_EXISTS=0
VOSK_EXISTS=0
RUBERT_EXISTS=0

if [ -f "$MODELS_DIR/silero/v4_ru.pt" ]; then
  SILERO_EXISTS=1
  echo "  ✅ Silero v4 TTS (синтез речи заявителя): найдена"
else
  echo "  ⚠️ Silero v4 TTS не найдена (режим 112: синтез аудио заявителя в аварийном режиме — показ транскрипта)"
fi

if [ -d "$MODELS_DIR/vosk-model-small-ru-0.22" ] || [ -d "$MODELS_DIR/vosk-small-ru" ] || ls "$MODELS_DIR"/vosk-model-small-ru-* >/dev/null 2>&1; then
  VOSK_EXISTS=1
  echo "  ✅ Vosk small-ru STT (распознавание доклада): найдена"
else
  echo "  ⚠️ Vosk small-ru STT не найдена (доклад в карточке ДДС: аварийный режим «Распознавание речи недоступно»)"
fi

if [ -d "$MODELS_DIR/rubert-tiny2" ]; then
  RUBERT_EXISTS=1
  echo "  ✅ RuBERT-tiny2 (смысловая оценка): найдена"
else
  echo "  ⚠️ RuBERT-tiny2 не найдена (смысловая оценка работает на детерминированных правилах и лексике)"
fi

if [ "$SILERO_EXISTS" -eq 0 ] && [ "$VOSK_EXISTS" -eq 0 ]; then
  echo "  ℹ️ Модели загружаются один раз с сетью: cd backend && uv run python -m ml.scripts.prepare_models --only embedder dedup tts"
fi

wait_for() {
  local url="$1" limit="${2:-60}" i=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$limit" ]; then
      echo "Не дождались ответа от $url" >&2
      return 1
    fi
    sleep 1
  done
}

DB_PATH="$DEMO_DB"
command -v cygpath >/dev/null 2>&1 && DB_PATH="$(cygpath -m "$DEMO_DB")"
export DATABASE_URL="sqlite+aiosqlite:///$DB_PATH"
export JWT_SECRET="${JWT_SECRET:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')}"
export MOCK_SESSION_SECRET="${MOCK_SESSION_SECRET:-$JWT_SECRET}"
export ML_WARMUP="${ML_WARMUP:-0}"

echo "▸ Инициализация БД: $DEMO_DB"
rm -f "$DEMO_DB"
(cd "$BACKEND_DIR" && uv run python -m app.seed.load --reset >"$LOG_DIR/seed.log" 2>&1) || {
  echo "❌ Ошибка сида БД! Лог:" >&2
  cat "$LOG_DIR/seed.log" >&2
  exit 1
}

echo "▸ Загрузка фикстуры сквозной цепочки A → B (T031)..."
(cd "$BACKEND_DIR" && uv run python scripts/seed_chain_demo.py >"$LOG_DIR/chain_seed.log" 2>&1) || {
  echo "❌ Ошибка фикстуры цепочки! Лог:" >&2
  cat "$LOG_DIR/chain_seed.log" >&2
  exit 1
}

echo "▸ Демо-билет для ИИ-генерации карточек (demo-fire-1)..."
(cd "$BACKEND_DIR" && uv run python scripts/seed_ai_demo_source.py >"$LOG_DIR/ai_source_seed.log" 2>&1) || echo "⚠ Не удалось добавить demo-fire-1 (лог: $LOG_DIR/ai_source_seed.log)"
if [ -z "${LLAMA_URL:-}" ] && curl -sf -m 2 "http://127.0.0.1:8081/health" >/dev/null 2>&1; then
  export LLAMA_URL="http://127.0.0.1:8081"   # модель уже поднята (./scripts/ai-up.sh или run_semantic_model.py)
fi
echo "   ИИ-модель: ${LLAMA_URL:-не подключена (генерация карточек — только шаблоны)}"

echo "▸ Запуск бэкенда на http://127.0.0.1:$BACKEND_PORT..."
(cd "$BACKEND_DIR" && uv run uvicorn app.main:app --port "$BACKEND_PORT" >"$LOG_DIR/backend.log" 2>&1) &
BACKEND_PID=$!

wait_for "http://127.0.0.1:$BACKEND_PORT/api/mock/auth/policy" 60 || {
  echo "❌ Бэкенд не ответил на порту $BACKEND_PORT! Последние строки лога:" >&2
  tail -40 "$LOG_DIR/backend.log" >&2
  exit 1
}
echo "  ✅ Бэкенд готов"

export BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
if [ -f "$ENV_LOCAL" ] && grep -qiE "^[[:space:]]*BACKEND_URL=" "$ENV_LOCAL"; then
  ENV_LOCAL_BAK="$ENV_LOCAL.demo-bak"
  mv -f "$ENV_LOCAL" "$ENV_LOCAL_BAK"
fi

MANIFEST="$ROOT/.next/routes-manifest.json"
if [ "$SKIP_BUILD" -eq 1 ] && [ -f "$MANIFEST" ] && ! grep -q "$BACKEND_URL/api/mock" "$MANIFEST"; then
  echo "▸ --skip-build: существующая сборка настроена на другой адрес — пересобираем"
  SKIP_BUILD=0
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "▸ Сборка фронта с BACKEND_URL=$BACKEND_URL..."
  (cd "$ROOT" && npm run mocks:sync && npm run mocks:validate && NEXT_TELEMETRY_DISABLED=1 npx next build) >"$LOG_DIR/build.log" 2>&1 || {
    echo "❌ Ошибка сборки фронта! Последние строки лога:" >&2
    tail -40 "$LOG_DIR/build.log" >&2
    exit 1
  }
  echo "  ✅ Сборка фронта завершена"
fi

echo "▸ Запуск фронтенда на http://127.0.0.1:$FRONT_PORT..."
(cd "$ROOT" && NEXT_TELEMETRY_DISABLED=1 npx next start -p "$FRONT_PORT" >"$LOG_DIR/front.log" 2>&1) &
FRONT_PID=$!

wait_for "http://127.0.0.1:$FRONT_PORT/api/mock/auth/policy" 90 || {
  echo "❌ Фронт не ответил на порту $FRONT_PORT! Последние строки лога:" >&2
  tail -40 "$LOG_DIR/front.log" >&2
  exit 1
}
echo "  ✅ Фронтенд готов"

END_TIME=$(date +%s)
TOTAL_SEC=$((END_TIME - START_TIME))

echo ""
echo "================================================================="
echo "   🎉 ДЕМО-СТЕНД УСПЕШНО ЗАПУЩЕН ЗА $TOTAL_SEC СЕКУНД!"
echo "================================================================="
echo ""
echo "📍 Точки входа:"
echo "   • Веб-интерфейс:       http://localhost:$FRONT_PORT"
echo "   • Бэкенд API:          http://localhost:$BACKEND_PORT"
echo "   • Документация OpenAPI: http://localhost:$BACKEND_PORT/api/docs"
echo ""
echo "👤 Тестовые учётные записи:"
echo "   • Обучающийся:  логин: ivanov    пароль: student112  (АРМ 1)"
echo "   • Преподаватель: логин: morozova  пароль: teacher112  (АРМ 21)"
echo "   • Администратор: логин: admin     пароль: admin112    (АРМ 24)"
echo ""
echo "🔗 Демонстрационный сценарий (цепочка A → B):"
echo "   1. Войти курсантом ivanov → «Задания» → выбрать «Цепочка 112 → ДДС (демо)»."
echo "   2. Отработать звонок 112, заполнить карту, передать."
echo "   3. Войти преподавателем morozova → подтвердить карточку в сценариях."
echo "   4. Вернуться курсантом ivanov → нажать «Начать этап ДДС» → отработать карточку."
echo ""
echo "📝 Логи доступны в: $LOG_DIR"
echo "🛑 Для завершения работы нажмите Ctrl+C"
echo "================================================================="
echo ""

# Ожидание сигнала завершения
while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "⚠️ Бэкенд неожиданно завершился!"
    tail -30 "$LOG_DIR/backend.log"
    break
  fi
  if ! kill -0 "$FRONT_PID" 2>/dev/null; then
    echo "⚠️ Фронтенд неожиданно завершился!"
    tail -30 "$LOG_DIR/front.log"
    break
  fi
  sleep 2
done
