#!/usr/bin/env bash
# T074 — гейт волны A: бэкенд с чистым сидом + собранный фронт (rewrite /api/mock → BACKEND_URL) + три сквозных
# скрипта фронта (scripts/e2e-student.sh, e2e-teacher.sh, e2e-admin.sh). Запуск из корня репозитория или из backend/:
#   backend/scripts/run_frontend_e2e.sh [--skip-build] [--only student|teacher|admin]
# Переменные: BACKEND_PORT (8130), FRONT_PORT (3130), E2E_DB (backend/var/e2e.db).
# Linux/macOS/WSL/Git Bash. В Git Bash (MSYS) mingw-curl портит кириллицу в argv, поэтому в PATH подставляется
# системный C:\Windows\System32\curl.exe (он передаёт UTF-8 корректно); сами скрипты фронта не меняются.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8130}"
FRONT_PORT="${FRONT_PORT:-3130}"
E2E_DB="${E2E_DB:-$BACKEND_DIR/var/e2e.db}"
SKIP_BUILD=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --only) shift; ONLY="${1:-}" ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -o 2>/dev/null)" = "Msys" ] && [ -x /c/Windows/System32/curl.exe ]; then
  export PATH="/c/Windows/System32:$PATH"
fi
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8  # python3-помощники скриптов читают JSON с кириллицей из stdin

LOG_DIR="$BACKEND_DIR/var/e2e-logs"
mkdir -p "$LOG_DIR"
BACKEND_PID=""
FRONT_PID=""
kill_port() { # освободить порт: `uv run`/`npx` — обёртки, kill по PID не достаёт до uvicorn/next
  local port="$1"
  if [ "$(uname -o 2>/dev/null)" = "Msys" ]; then
    netstat -ano 2>/dev/null | tr -d '\r' | awk -v p=":$port" '$2 ~ p"$" && $4 == "LISTENING" && !seen[$5]++ { print $5 }' | while read -r pid; do  # без sort: в PATH впереди System32, а sort.exe Windows добавляет CR
      [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1 </dev/null
    done
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$port" | xargs -r kill 2>/dev/null
  fi
}
ENV_LOCAL="$ROOT/.env.local"
ENV_LOCAL_BAK=""
cleanup() {
  [ -n "$ENV_LOCAL_BAK" ] && mv -f "$ENV_LOCAL_BAK" "$ENV_LOCAL"
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  kill_port "$FRONT_PORT"
  kill_port "$BACKEND_PORT"
  wait 2>/dev/null
}
trap cleanup EXIT
kill_port "$BACKEND_PORT"
kill_port "$FRONT_PORT"

wait_for() { # url, тайм-аут (с)
  local url="$1" limit="${2:-60}" i=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -ge "$limit" ] && { echo "не дождались $url" >&2; return 1; }
    sleep 1
  done
}

DB_PATH="$E2E_DB"
command -v cygpath >/dev/null 2>&1 && DB_PATH="$(cygpath -m "$E2E_DB")"  # Git Bash: C:/… вместо /c/…
export DATABASE_URL="sqlite+aiosqlite:///$DB_PATH"

start_backend() { # чистый сид + свежий процесс: каждый e2e-скрипт идёт от исходного состояния, как мок-стор при перезапуске
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  kill_port "$BACKEND_PORT"
  echo "▸ бэкенд: чистый сид → $E2E_DB"
  rm -f "$E2E_DB"
  (cd "$BACKEND_DIR" && uv run python -m app.seed.load --reset >"$LOG_DIR/seed.log" 2>&1) || { cat "$LOG_DIR/seed.log"; exit 1; }
  (cd "$BACKEND_DIR" && uv run uvicorn app.main:app --port "$BACKEND_PORT" >>"$LOG_DIR/backend.log" 2>&1) &
  BACKEND_PID=$!
  wait_for "http://127.0.0.1:$BACKEND_PORT/api/mock/auth/policy" 60 || { tail -50 "$LOG_DIR/backend.log"; exit 1; }
}
: >"$LOG_DIR/backend.log"
start_backend

# `rewrites()` из next.config.ts вычисляются при сборке: адрес бэкенда запекается в .next/routes-manifest.json,
# а `.env.local` фронта (BACKEND_URL dev-сервера) перекрывает переменную окружения. Поэтому файл откладывается
# до сборки (восстанавливается в cleanup), а сборка идёт с BACKEND_URL e2e-бэкенда.
export BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
if [ -f "$ENV_LOCAL" ] && grep -q "^BACKEND_URL=" "$ENV_LOCAL"; then
  ENV_LOCAL_BAK="$ENV_LOCAL.e2e-bak"
  mv -f "$ENV_LOCAL" "$ENV_LOCAL_BAK"
fi
MANIFEST="$ROOT/.next/routes-manifest.json"
if [ "$SKIP_BUILD" -eq 1 ] && [ -f "$MANIFEST" ] && ! grep -q "$BACKEND_URL/api/mock" "$MANIFEST"; then
  echo "▸ --skip-build: сборка в .next собрана с другим BACKEND_URL — пересобираем"
  SKIP_BUILD=0
fi
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "▸ фронт: сборка с BACKEND_URL=$BACKEND_URL (эквивалент npm run build: mocks:sync, mocks:validate, next build)"
  # Не через `npm run build`: его строка `NEXT_TELEMETRY_DISABLED=1 next build` — bash-синтаксис, под cmd на Windows не работает.
  (cd "$ROOT" && npm run mocks:sync && npm run mocks:validate && NEXT_TELEMETRY_DISABLED=1 npx next build) >"$LOG_DIR/build.log" 2>&1 || { tail -50 "$LOG_DIR/build.log"; exit 1; }
fi
echo "▸ фронт: next start -p $FRONT_PORT, BACKEND_URL=$BACKEND_URL"
(cd "$ROOT" && NEXT_TELEMETRY_DISABLED=1 npx next start -p "$FRONT_PORT" >"$LOG_DIR/front.log" 2>&1) &
FRONT_PID=$!
wait_for "http://127.0.0.1:$FRONT_PORT/api/mock/auth/policy" 90 || { tail -50 "$LOG_DIR/front.log"; exit 1; }

STATUS=0
for name in student teacher admin; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue
  [ "$name" != "student" ] && start_backend
  echo "▸ scripts/e2e-$name.sh"
  if (cd "$ROOT" && BASE_URL="http://127.0.0.1:$FRONT_PORT" bash "scripts/e2e-$name.sh" 2>&1 | tee "$LOG_DIR/e2e-$name.log" | tail -25); then
    echo "  PASS e2e-$name"
  else
    echo "  FAIL e2e-$name (полный вывод: $LOG_DIR/e2e-$name.log)"
    STATUS=1
  fi
done
exit "$STATUS"
