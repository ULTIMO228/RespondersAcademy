#!/usr/bin/env bash
# Запуск стенда для проверки в браузере: ИИ-модель (llama.cpp :8081) + бэкенд (:8000) + фронт (:3000).
#   ./scripts/ai-up.sh            # поднять всё в фоне (start по умолчанию)
#   ./scripts/ai-up.sh status     # что запущено
#   ./scripts/ai-up.sh stop       # остановить всё
#   ./scripts/ai-up.sh --no-model # без ИИ-модели (режим «Только ИИ» ответит отказом, шаблоны работают)
# Логи: backend/var/logs/, pid-файлы: backend/var/run/.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/backend/var/logs"; RUN="$ROOT/backend/var/run"
MODEL_PORT="${MODEL_PORT:-8081}"; BACKEND_PORT="${BACKEND_PORT:-8000}"; FRONT_PORT="${FRONT_PORT:-3000}"
mkdir -p "$LOGS" "$RUN"

CMD="start"; WITH_MODEL=1
for arg in "$@"; do
  case "$arg" in
    start|stop|status) CMD="$arg" ;;
    --no-model) WITH_MODEL=0 ;;
    -h|--help) sed -n 2,8p "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

alive() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }
up() { curl -sf -m 2 "$1" -o /dev/null; }
wait_for() { # name url seconds
  for _ in $(seq 1 "$3"); do up "$2" && { echo "   $1 готов"; return 0; }; sleep 1; done
  echo "   $1 не поднялся за $3 с — смотрите $LOGS/$1.log" >&2; return 1
}
stop_one() {
  alive "$1" || return 0
  local pid; pid="$(cat "$RUN/$1.pid")"
  pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; rm -f "$RUN/$1.pid"; echo "   $1 остановлен"
}

case "$CMD" in
  stop)
    stop_one front; stop_one backend; stop_one model
    # запущенное вручную или потомки: добиваем всё, что слушает наши порты
    for port in "$FRONT_PORT" "$BACKEND_PORT" "$MODEL_PORT"; do
      pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)"
      [ -n "$pids" ] && { kill $pids 2>/dev/null; echo "   порт $port освобождён"; }
    done
    exit 0 ;;
  status)
    for pair in "model:http://127.0.0.1:$MODEL_PORT/health" "backend:http://127.0.0.1:$BACKEND_PORT/api/docs" "front:http://127.0.0.1:$FRONT_PORT/login"; do
      name="${pair%%:*}"; url="${pair#*:}"
      up "$url" && echo "$name: работает ($url)" || echo "$name: не отвечает"
    done
    exit 0 ;;
esac

export JWT_SECRET="${JWT_SECRET:-dev-secret-dev-secret-dev-secret-dev-secret}"
cd "$ROOT"

if [ "$WITH_MODEL" = 1 ]; then
  echo "==> ИИ-модель (llama.cpp, порт $MODEL_PORT)"
  if up "http://127.0.0.1:$MODEL_PORT/health"; then echo "   уже работает"; else
    nohup python3 backend/ml/scripts/run_semantic_model.py --port "$MODEL_PORT" > "$LOGS/model.log" 2>&1 &
    echo $! > "$RUN/model.pid"
    wait_for model "http://127.0.0.1:$MODEL_PORT/health" 300 || exit 1
  fi
  export LLAMA_URL="http://127.0.0.1:$MODEL_PORT"
else
  unset LLAMA_URL
fi

echo "==> Бэкенд (порт $BACKEND_PORT)"
if up "http://127.0.0.1:$BACKEND_PORT/api/docs"; then echo "   уже работает (перезапустите: ./scripts/ai-up.sh stop)"; else
  (cd backend && { [ -f var/dev.db ] || { uv run python -m app.seed.load --reset && uv run python scripts/seed_ai_demo_source.py; } >> "$LOGS/backend.log" 2>&1; }
   nohup uv run uvicorn app.main:app --port "$BACKEND_PORT" >> "$LOGS/backend.log" 2>&1 & echo $! > "$RUN/backend.pid")
  wait_for backend "http://127.0.0.1:$BACKEND_PORT/api/docs" 60 || exit 1
fi

echo "==> Фронтенд (порт $FRONT_PORT, BACKEND_URL=http://localhost:$BACKEND_PORT)"
if up "http://127.0.0.1:$FRONT_PORT/login"; then echo "   уже работает (если он без бэкенда — ./scripts/ai-up.sh stop и запуск заново)"; else
  BACKEND_URL="http://localhost:$BACKEND_PORT" nohup npm run dev -- -p "$FRONT_PORT" > "$LOGS/front.log" 2>&1 &
  echo $! > "$RUN/front.pid"
  wait_for front "http://127.0.0.1:$FRONT_PORT/login" 90 || exit 1
fi

cat <<TXT

Стенд поднят:  http://localhost:$FRONT_PORT/login
  преподаватель: morozova / teacher112   (обучающийся: ivanov / student112, админ: admin / admin112)
  ИИ-генерация:  /teacher/scenarios/s-010 → билет demo-fire-1, категория «пожар в жилом доме»,
                 «Генерация»: «Статичный шаблон» или «Только ИИ» — под кнопкой время и провайдер.
  Остановка:     ./scripts/ai-up.sh stop
TXT
