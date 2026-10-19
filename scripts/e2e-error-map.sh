#!/usr/bin/env bash
# Сквозной HTTP-прогон «Карты ошибок» (спека 003, T068) против фронта с реальным бэкенда: карта группы, разбор этапа,
# журнал, PDF, вердикт, «Над чем поработать» у обучающегося, отказы по правам. Нужен бэкенд с демо-набором
# (`cd backend && uv run python scripts/seed_error_map_demo.py` после `app.seed.load`); запуск целиком —
# `backend/scripts/run_frontend_e2e.sh --only error-map` (чистая var/e2e.db, свежие серверы).
# Вердикт пишется в базу, поэтому перед повторным прогоном нужна чистая база.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASE_URL="${BASE_URL:-http://127.0.0.1:3130}"
API="$BASE_URL/api/v1"
TEACHER_LOGIN="${E2E_TEACHER_LOGIN:-morozova}"
TEACHER_PASSWORD="${E2E_TEACHER_PASSWORD:-teacher112}"
STUDENT_LOGIN="${E2E_STUDENT_LOGIN:-demo-dds-2-05}"
STUDENT_PASSWORD="${E2E_STUDENT_PASSWORD:-student112}"
GROUP="${E2E_GROUP:-ДДС-Демо-2}"
FOREIGN_GROUP="${E2E_FOREIGN_GROUP:-112-Демо-1}"
STAGE="${E2E_STAGE:-decision}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
PASSED=0; FAILED=0; STEP=0

pass() { PASSED=$((PASSED + 1)); STEP=$((STEP + 1)); printf 'PASS  %02d  %s\n' "$STEP" "$1"; }
fail() {
  FAILED=$((FAILED + 1)); STEP=$((STEP + 1)); printf 'FAIL  %02d  %s\n' "$STEP" "$1"
  [ -n "${2:-}" ] && printf '          %s\n' "$2"
  return 0
}
# check <описание> <ожидаемый код> [<подстрока в теле>]
check() {
  local title="$1" expected="$2" needle="${3:-}"
  if [ "$HTTP_CODE" != "$expected" ]; then fail "$title" "ожидался HTTP $expected, получен $HTTP_CODE: $(head -c 300 "$WORK_DIR/body")"; return 1; fi
  if [ -n "$needle" ] && ! grep -qF -- "$needle" "$WORK_DIR/body"; then fail "$title" "в ответе нет «$needle»: $(head -c 300 "$WORK_DIR/body")"; return 1; fi
  pass "$title"
}
req() { # <METHOD> <путь от /api/v1> [<тело JSON>]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK_DIR/body" -D "$WORK_DIR/headers" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "${SESSION_COOKIE:-}" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  HTTP_CODE="$(curl "${args[@]}" 2>"$WORK_DIR/curl-err")" || HTTP_CODE="000"
  return 0
}
enc() { python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1]))' "$1"; }
jget() { python3 -c '
import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d = (d[int(k)] if isinstance(d,list) and k.isdigit() and int(k)<len(d) else None) if isinstance(d,list) else (d.get(k) if isinstance(d,dict) else None)
    if d is None: break
print("" if d is None else d if isinstance(d,str) else json.dumps(d,ensure_ascii=False))' "$1" <"$WORK_DIR/body"; }
login() { # <логин> <пароль>
  SESSION_COOKIE=""
  req POST /auth/login "{\"login\":\"$1\",\"password\":\"$2\"}"
  SESSION_COOKIE="$(grep -i '^set-cookie: arm112_session=' "$WORK_DIR/headers" | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r')"
  [ "$HTTP_CODE" = "200" ] && [ -n "$SESSION_COOKIE" ]
}

G="$(enc "$GROUP")"; F="$(enc "$FOREIGN_GROUP")"

echo "== Преподаватель"
login "$TEACHER_LOGIN" "$TEACHER_PASSWORD" && pass "вход преподавателем" || fail "вход преподавателем" "HTTP $HTTP_CODE"

req GET /error-map/groups; check "список групп" 200 "$GROUP"
req GET "/error-map/groups/$G?mode=dds&period=1m"; check "карта группы" 200 '"levels"'
[ "$(jget headline.kind)" = "problems" ] && pass "вывод: есть проблемные этапы" || fail "вывод: есть проблемные этапы" "kind=$(jget headline.kind)"
req GET "/error-map/groups/$G/stages/$STAGE?mode=dds&period=1m"; check "разбор этапа" 200 '"typicalErrors"'
[ "$(jget explanation.source)" = "template" ] && pass "пояснение: справочный шаблон (ИИ-модели нет)" || fail "пояснение: справочный шаблон" "source=$(jget explanation.source)"
HASH="$(jget explanation.textHash)"
req GET "/error-map/groups/$G/journal?mode=dds&period=1m"; check "журнал группы" 200 '"rows"'

# PDF: тело должно начинаться с %PDF
curl -sS -o "$WORK_DIR/map.pdf" -D "$WORK_DIR/headers" -w '%{http_code}' -H "Cookie: arm112_session=$SESSION_COOKIE" \
  "$API/error-map/export.pdf?scope=group&groupId=$G&mode=dds&period=1m" >"$WORK_DIR/code"
if [ "$(cat "$WORK_DIR/code")" = "200" ] && head -c 4 "$WORK_DIR/map.pdf" | grep -q '%PDF'; then pass "PDF карты группы"; else fail "PDF карты группы" "код $(cat "$WORK_DIR/code")"; fi

BODY="{\"groupId\":\"$GROUP\",\"mode\":\"dds\",\"period\":\"1m\",\"stageId\":\"$STAGE\",\"textHash\":\"$HASH\",\"source\":\"template\",\"verdict\":\"agree\"}"
req PUT /error-map/verdicts "$BODY"; check "вердикт «Согласен» сохранён" 200
req GET "/error-map/groups/$G/stages/$STAGE?mode=dds&period=1m"; check "вердикт виден при следующем разборе" 200 '"verdict":"agree"'
req GET "/error-map/groups/$F?mode=112&period=1m"; [ "$HTTP_CODE" = "400" ] && pass "неверный режим — 400" || fail "неверный режим — 400" "HTTP $HTTP_CODE"
req GET "/error-map/groups/$F?mode=operator112&period=1m"; check "чужая группа — 403" 403
req PUT /error-map/verdicts "${BODY/\"$GROUP\"/\"$FOREIGN_GROUP\"}"; check "вердикт по чужой группе — 403" 403

echo "== Обучающийся"
login "$STUDENT_LOGIN" "$STUDENT_PASSWORD" && pass "вход обучающимся" || fail "вход обучающимся" "HTTP $HTTP_CODE"
req GET /me/focus; check "«Над чем поработать»" 200 '"items"'
if grep -qE '"(students|comparison|affectedStudents|share)"' "$WORK_DIR/body"; then fail "в ответе нет групповых полей" "$(head -c 300 "$WORK_DIR/body")"; else pass "в ответе нет групповых полей"; fi
req GET "/error-map/groups/$G?mode=dds&period=1m"; check "карта под обучающимся — 403" 403
req PUT /error-map/verdicts "$BODY"; check "вердикт под обучающимся — 403" 403

echo "== Без сессии"
SESSION_COOKIE=""
req GET /me/focus; check "без сессии /me/focus — 401" 401
req GET "/error-map/groups/$G?mode=dds&period=1m"; check "без сессии карта — 401" 401

echo
echo "Итог: пройдено $PASSED, не пройдено $FAILED"
[ "$FAILED" -eq 0 ]
