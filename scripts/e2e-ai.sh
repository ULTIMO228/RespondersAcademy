#!/usr/bin/env bash
# Фича 006, T038: HTTP-проверка настроек ИИ, доступа и редактирования ключа.
# Запускать через backend/scripts/run_frontend_e2e.sh --only ai: harness поднимает чистую var/e2e.db
# и свежие backend/frontend процессы. Сценарий использует только локальный источник и фиктивный ключ.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASE_URL="${BASE_URL:-http://127.0.0.1:3130}"
API="$BASE_URL/api/v1"
ADMIN_LOGIN="${E2E_ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin112}"
TEACHER_LOGIN="${E2E_TEACHER_LOGIN:-morozova}"
TEACHER_PASSWORD="${E2E_TEACHER_PASSWORD:-teacher112}"
STUDENT_LOGIN="${E2E_STUDENT_LOGIN:-ivanov}"
STUDENT_PASSWORD="${E2E_STUDENT_PASSWORD:-student112}"
REPORT_ID="${E2E_AI_REPORT_ID:-rep-2026-09-16-01-u-005}"
# Маркер исключительно для проверки редактирования/утечек. Он никогда не выводится.
SENTINEL_KEY="e2e-ai-redaction-only-9876"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
PASSED=0; FAILED=0; STEP=0
SESSION_COOKIE=""

pass() { PASSED=$((PASSED + 1)); STEP=$((STEP + 1)); printf 'PASS  %02d  %s\n' "$STEP" "$1"; }
fail() { FAILED=$((FAILED + 1)); STEP=$((STEP + 1)); printf 'FAIL  %02d  %s\n' "$STEP" "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; return 0; }

req() { # <METHOD> <путь от /api/v1> [<JSON>]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK_DIR/body" -D "$WORK_DIR/headers" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "$SESSION_COOKIE" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  HTTP_CODE="$(curl "${args[@]}" 2>"$WORK_DIR/curl-err")" || HTTP_CODE="000"
  return 0
}

check() { # <описание> <ожидаемый HTTP-код>
  if [ "$HTTP_CODE" = "$2" ]; then pass "$1"; else fail "$1" "HTTP $HTTP_CODE, ожидался $2"; fi
}

login() {
  SESSION_COOKIE=""
  req POST /auth/login "{\"login\":\"$1\",\"password\":\"$2\"}"
  SESSION_COOKIE="$(grep -i '^set-cookie: arm112_session=' "$WORK_DIR/headers" | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r')"
  [ "$HTTP_CODE" = "200" ] && [ -n "$SESSION_COOKIE" ]
}

assert_no_key() { # <описание> <file>
  if grep -aFq -- "$SENTINEL_KEY" "$2"; then fail "$1" "фиктивный ключ найден"; else pass "$1"; fi
}

echo "== Администратор"
if login "$ADMIN_LOGIN" "$ADMIN_PASSWORD"; then pass "вход администратором"; else fail "вход администратором" "HTTP $HTTP_CODE"; exit 1; fi
req GET /admin/ai/settings; check "чтение настроек ИИ" 200
if [ "$HTTP_CODE" = "200" ] && grep -qi '^cache-control:.*no-store' "$WORK_DIR/headers"; then pass "настройки не кэшируются"; else fail "настройки не кэшируются"; fi
assert_no_key "в начальном ответе нет ключа" "$WORK_DIR/body"

req PUT /admin/ai/settings "{\"source\":\"local\",\"apiKey\":\"$SENTINEL_KEY\"}"
check "сохранение локального источника и фиктивного ключа" 200
assert_no_key "ответ сохранения не раскрывает ключ" "$WORK_DIR/body"
if [ "$HTTP_CODE" = "200" ] && grep -q '"keyLast4":"9876"' "$WORK_DIR/body"; then pass "ответ показывает только последние четыре символа"; else fail "ответ показывает только последние четыре символа"; fi

req GET /admin/ai/settings; check "сохранённые настройки доступны повторно" 200
assert_no_key "повторное чтение не раскрывает ключ" "$WORK_DIR/body"
req GET /ai/health; check "состояние доступно администратору" 200
if [ "$HTTP_CODE" = "200" ] && grep -qi '^cache-control:.*no-store' "$WORK_DIR/headers"; then pass "состояние не кэшируется"; else fail "состояние не кэшируется"; fi
assert_no_key "ответ состояния не раскрывает ключ" "$WORK_DIR/body"

PAGE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: arm112_session=$SESSION_COOKIE" "$BASE_URL/account/ai" 2>/dev/null || echo 000)"
if [ "$PAGE_CODE" = "200" ]; then pass "страница /account/ai доступна администратору"; else fail "страница /account/ai доступна администратору" "HTTP $PAGE_CODE"; fi

# Проверяем, что существующая выгрузка не отражает сохранённый секрет. Данные отчёта — только из демо-сида.
for format in pdf xlsx; do
  curl -sS -o "$WORK_DIR/report.$format" -D "$WORK_DIR/export-$format-headers" -w '%{http_code}' \
    -H "Cookie: arm112_session=$SESSION_COOKIE" "$API/reports/$REPORT_ID/export.$format" >"$WORK_DIR/export-$format-code" 2>"$WORK_DIR/export-$format-err" || true
  if [ "$(cat "$WORK_DIR/export-$format-code")" = "200" ]; then
    assert_no_key "ключ отсутствует в выгрузке $format" "$WORK_DIR/report.$format"
  else
    fail "выгрузка $format для redaction check" "HTTP $(cat "$WORK_DIR/export-$format-code")"
  fi
done

echo "== Преподаватель"
if login "$TEACHER_LOGIN" "$TEACHER_PASSWORD"; then pass "вход преподавателем"; else fail "вход преподавателем" "HTTP $HTTP_CODE"; exit 1; fi
req GET /ai/health; check "состояние доступно преподавателю" 200
if [ "$HTTP_CODE" = "200" ] && ! grep -qE '"(reason|errorsToday|callsToday|dailyLimit)"' "$WORK_DIR/body"; then pass "детали состояния скрыты от преподавателя"; else fail "детали состояния скрыты от преподавателя"; fi
req GET /admin/ai/settings; check "настройки закрыты преподавателю" 403
PAGE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: arm112_session=$SESSION_COOKIE" "$BASE_URL/teacher" 2>/dev/null || echo 000)"
if [ "$PAGE_CODE" = "200" ]; then pass "страница преподавателя доступна"; else fail "страница преподавателя доступна" "HTTP $PAGE_CODE"; fi

echo "== Обучающийся и без сессии"
if login "$STUDENT_LOGIN" "$STUDENT_PASSWORD"; then pass "вход обучающимся"; else fail "вход обучающимся" "HTTP $HTTP_CODE"; exit 1; fi
req GET /ai/health; check "состояние закрыто обучающемуся" 403
req GET /admin/ai/settings; check "настройки закрыты обучающемуся" 403
SESSION_COOKIE=""
req GET /ai/health; check "состояние без сессии возвращает 401" 401
req GET /admin/ai/settings; check "настройки без сессии возвращают 401" 401

echo "== Журналы"
BACKEND_LOG="backend/var/e2e-logs/backend.log"
FRONT_LOG="backend/var/e2e-logs/front.log"
for log in "$BACKEND_LOG" "$FRONT_LOG"; do
  if [ -f "$log" ]; then assert_no_key "фиктивный ключ отсутствует в $(basename "$log")" "$log"; fi
done

echo
echo "Итог: пройдено $PASSED, не пройдено $FAILED"
[ "$FAILED" -eq 0 ]
