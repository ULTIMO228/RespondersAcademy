#!/usr/bin/env bash
# Сквозной прогон АРМ администратора по HTTP (замена Playwright — браузерных зависимостей в проекте нет).
# Работает против ТОЛЬКО ЧТО запущенного сервера: `npx next start -p 3130`, затем `scripts/e2e-admin.sh`.
# Мок-стор живёт в памяти процесса и накапливает состояние, поэтому перед повторным прогоном сервер перезапускать.
# Печатает PASS/FAIL по шагам; код возврата 0 — все шаги прошли.
#
# Покрытие (гейты T4.1 и T4.2):
#   вход admin / АРМ 24 → пользователи (список, фильтры, создание, смена роли, блокировка и отказ входа,
#   разблокировка, сброс пароля, вход под новой учёткой) → журнал аудита (сид mocks/admin/audit-log.json
#   + рантайм-события: вход, действия над пользователями, правка оценки преподавателем, настройки, бэкап;
#   фильтры по типу/оператору/карточке/периоду, пагинация) → сервисы (список, запуск/остановка/перезапуск,
#   запрет остановки критичного сервиса во время активного занятия) → настройки (нормативы ТЗ: бэкап
#   не реже 1 раза в сутки, журналы ≥ 6 мес, лимит сессий ≥ 20, отклик ≤ 2 с; локальная политика входа,
#   read-only БД, «Выполнить сейчас») → мониторинг и статистика использования → системные журналы →
#   пакетное обновление (клиентская заглушка без сетевой отправки) → изоляция ролей (403 по матрице).
set -uo pipefail

# Скрипт читает mocks/*.json — работаем от корня репозитория независимо от места запуска.
cd "$(dirname "$0")/.." || exit 1

BASE_URL="${BASE_URL:-http://127.0.0.1:3130}"
API="$BASE_URL/api/mock"

ADMIN_LOGIN="${E2E_ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin112}"
ADMIN_ARM="${E2E_ADMIN_ARM:-24}"
ADMIN_ID="${E2E_ADMIN_ID:-u-001}"

TEACHER_LOGIN="${E2E_TEACHER_LOGIN:-morozova}"
TEACHER_PASSWORD="${E2E_TEACHER_PASSWORD:-teacher112}"
TEACHER_ARM="${E2E_TEACHER_ARM:-21}"
TEACHER_ID="${E2E_TEACHER_ID:-u-002}"

STUDENT_LOGIN="${E2E_STUDENT_LOGIN:-ivanov}"
STUDENT_PASSWORD="${E2E_STUDENT_PASSWORD:-student112}"
STUDENT_ARM="${E2E_STUDENT_ARM:-1}"

TWO_FACTOR="${E2E_2FA:-123456}"

# Заблокированная учётка из моков (T4.1: отказ входа заблокированному).
BLOCKED_LOGIN="${E2E_BLOCKED_LOGIN:-egorov}"
BLOCKED_PASSWORD="${E2E_BLOCKED_PASSWORD:-student112}"
BLOCKED_ARM="${E2E_BLOCKED_ARM:-6}"

# Новая учётка прогона (создаётся в сторе, сид users.json не меняется).
NEW_LOGIN="${E2E_NEW_LOGIN:-e2eadmin}"
NEW_PASSWORD="${E2E_NEW_PASSWORD:-e2eadmin112}"
NEW_ARM="${E2E_NEW_ARM:-77}"
NEW_FULL_NAME="${E2E_NEW_FULL_NAME:-Тестовый Тест Тестович}"
NEW_GROUP="${E2E_NEW_GROUP:-ДДС-01}"

# Идущее занятие мока: блокирует остановку критичного сервиса (T4.2-24).
RUNNING_SESSION="${E2E_RUNNING_SESSION:-ses-2026-09-17-demo}"
# Завершённое занятие и попытка: правка оценки преподавателем → событие аудита evaluation.override.
REPORTED_ATTEMPT="${E2E_REPORTED_ATTEMPT:-att-01}"
OVERRIDE_SCORE="${E2E_OVERRIDE_SCORE:-55}"
# Карточка с событиями в сиде журнала (фильтр «по карточке»).
AUDIT_CARD="${E2E_AUDIT_CARD:-c-014}"

# Сервисы мока.
SVC_WEB=svc-web
SVC_DB=svc-db
SVC_SIP=svc-sip
SVC_AI=svc-ai

# Нормативы ТЗ, проверяемые эндпоинтами (§7, §9).
NORM_SESSION_LIMIT=20
NORM_RESPONSE_SEC=2
NORM_BACKUP_HOURS=24
NORM_LOG_MONTHS=6

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

PASSED=0
FAILED=0
STEP=0

pass() {
  PASSED=$((PASSED + 1))
  STEP=$((STEP + 1))
  printf 'PASS  %02d  %s\n' "$STEP" "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  STEP=$((STEP + 1))
  printf 'FAIL  %02d  %s\n' "$STEP" "$1"
  [ -n "${2:-}" ] && printf '          %s\n' "$2"
  return 0
}

# check <описание> <ожидаемый код> [<подстрока, обязанная быть в теле>]
# Тело последнего запроса — $WORK_DIR/body, код — $HTTP_CODE.
check() {
  local title="$1" expected="$2" needle="${3:-}"
  if [ "$HTTP_CODE" != "$expected" ]; then
    fail "$title" "ожидался HTTP $expected, получен $HTTP_CODE: $(head -c 300 "$WORK_DIR/body")"
    return 1
  fi
  # -F: подстрока сравнивается буквально (в JSON встречаются скобки и кавычки).
  if [ -n "$needle" ] && ! grep -qF -- "$needle" "$WORK_DIR/body"; then
    fail "$title" "в ответе нет «$needle»: $(head -c 300 "$WORK_DIR/body")"
    return 1
  fi
  pass "$title"
  return 0
}

# expect <описание> <фактическое> <ожидаемое>
expect() {
  if [ "$2" = "$3" ]; then
    pass "$1"
  else
    fail "$1" "получено «$2», ожидалось «$3»"
  fi
}

# req <METHOD> <путь от /api/mock> [<тело JSON>] — с текущей cookie сессии ($SESSION_COOKIE).
req() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK_DIR/body" -D "$WORK_DIR/headers" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "${SESSION_COOKIE:-}" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  HTTP_CODE="$(curl "${args[@]}" 2>"$WORK_DIR/curl-err")" || HTTP_CODE="000"
  [ "$HTTP_CODE" = "000" ] && cp "$WORK_DIR/curl-err" "$WORK_DIR/body"
  return 0
}

# anon_req <METHOD> <путь> [<тело>] — без cookie (эндпоинты мок-слоя, вход).
anon_req() {
  local saved="${SESSION_COOKIE:-}"
  SESSION_COOKIE=""
  req "$@"
  SESSION_COOKIE="$saved"
  return 0
}

# page <путь страницы> — HTTP-код страницы Next с текущей cookie (гварды proxy.ts).
page() {
  local args=(-sS -o /dev/null -w '%{http_code}' "$BASE_URL$1")
  [ -n "${SESSION_COOKIE:-}" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  curl "${args[@]}" 2>/dev/null || echo 000
}

# urlenc <строка> — percent-encoding значения query (кириллица в пути Next не принимается).
urlenc() { python3 -c "
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=''))" "$1"; }

# jq-заменитель: python3 уже нужен проекту (npm run mocks:validate).
jget() { python3 "$WORK_DIR/jget.py" "$@" <"$WORK_DIR/body"; }

# session_cookie_from_headers — значение arm112_session из Set-Cookie последнего ответа: cookie ставит сервер (HttpOnly).
session_cookie_from_headers() {
  grep -i '^set-cookie: arm112_session=' "$WORK_DIR/headers" | head -1 | sed -E 's/^[^=]*=([^;]*).*/\1/' | tr -d '\r'
}

cat >"$WORK_DIR/jget.py" <<'PY'
import json
import sys

# jget <выражение> — точечный путь по JSON из stdin: a.b.0.c; пусто, если пути нет.
data = json.load(sys.stdin)
for key in sys.argv[1].split("."):
    if isinstance(data, list):
        data = data[int(key)] if key.lstrip("-").isdigit() and -len(data) <= int(key) < len(data) else None
    elif isinstance(data, dict):
        data = data.get(key)
    else:
        data = None
    if data is None:
        break
print("" if data is None else data if isinstance(data, str) else json.dumps(data, ensure_ascii=False))
PY

cat >"$WORK_DIR/tools.py" <<'PY'
import json
import sys


def _in() -> object:
    return json.load(sys.stdin)


def _items(payload: object) -> list:
    """Список: {items,…} (единый формат списков проекта) либо голый массив."""
    return payload["items"] if isinstance(payload, dict) else payload


def users_count() -> None:
    print(len(_items(_in())))


def users_field_all() -> None:
    """ok, если у всех пользователей поле sys.argv[2] равно sys.argv[3]."""
    field, value = sys.argv[2], sys.argv[3]
    users = _items(_in())
    if not users:
        print("список пуст")
        return
    bad = [user["login"] for user in users if str(user.get(field)) != value]
    print("ok" if not bad else f"не совпали: {', '.join(bad)}")


def users_have_login() -> None:
    print("ok" if any(user["login"] == sys.argv[2] for user in _items(_in())) else "нет учётки")


def audit_has() -> None:
    """ok, если в журнале есть все перечисленные коды действий."""
    actions = {entry.get("action") for entry in _items(_in())}
    missing = [action for action in sys.argv[2:] if action not in actions]
    print("ok" if not missing else "нет записей: " + ", ".join(missing))


def audit_seed_and_runtime() -> None:
    """ok, если на странице есть и сидовые записи (id ≤ порога), и рантайм-события (id > порога)."""
    limit = int(sys.argv[2])
    numbers = [int(entry["id"].split("-")[1]) for entry in _items(_in())]
    seeded = [number for number in numbers if number <= limit]
    runtime = [number for number in numbers if number > limit]
    if seeded and runtime:
        print("ok")
        return
    print(f"сид: {len(seeded)}, рантайм: {len(runtime)}")


def audit_field_all() -> None:
    """ok, если у всех записей поле sys.argv[2] равно sys.argv[3] (фильтры «оператор»/«карточка»)."""
    field, value = sys.argv[2], sys.argv[3]
    entries = _items(_in())
    if not entries:
        print("журнал пуст")
        return
    bad = [entry["id"] for entry in entries if str(entry.get(field)) != value]
    print("ok" if not bad else f"не совпали: {', '.join(bad)}")


def audit_prefix_all() -> None:
    entries = _items(_in())
    if not entries:
        print("журнал пуст")
        return
    bad = [entry["id"] for entry in entries if not str(entry.get("action")).startswith(sys.argv[2])]
    print("ok" if not bad else f"не совпали: {', '.join(bad)}")


def audit_ids() -> None:
    print(" ".join(entry["id"] for entry in _items(_in())))


def audit_details() -> None:
    """Описание первой записи с кодом действия sys.argv[2]."""
    for entry in _items(_in()):
        if entry.get("action") == sys.argv[2]:
            print(entry.get("details", ""))
            return
    print("")


def service_state() -> None:
    """«состояние аптайм» сервиса sys.argv[2]."""
    for service in _in()["services"]:
        if service["id"] == sys.argv[2]:
            print(f"{service['state']} {service['uptimeSec']}")
            return
    print("")


def services_summary() -> None:
    payload = _in()
    services = payload["services"]
    print(f"{len(services)} {str(payload['integrity']['ok']).lower()}")


def logs_levels() -> None:
    print(",".join(sorted({entry["level"] for entry in _in()})))


def logs_have_source() -> None:
    print("ok" if any(entry["source"] == sys.argv[2] for entry in _in()) else "нет записи сервиса")


def monitoring_summary() -> None:
    """«часы шаг точки лимитСессий нормОтклика превышениеСессий превышениеОтклика»."""
    data = _in()
    series = data["series"]
    points = {len(values) for values in series.values()} | {len(data["labels"])}
    print(
        " ".join(
            str(value)
            for value in (
                data["windowHours"],
                data["stepMinutes"],
                points.pop() if len(points) == 1 else "разная-длина",
                data["norms"]["sessionLimit"],
                data["norms"]["responseSec"],
                max(series["activeSessions"]),
                max(series["responseSec"]),
            )
        )
    )


def usage_periods() -> None:
    print(",".join(period["id"] for period in _in()["periods"]))


def usage_charts_ok() -> None:
    """ok, если у всех диаграмм периода подписи и значения одной длины (props чартов)."""
    for period in _in()["periods"]:
        pairs = (
            (period["loginsByRole"]["labels"], period["loginsByRole"]["values"]),
            (period["activityByTime"]["labels"], period["activityByTime"]["values"]),
            (period["cards"]["labels"], period["cards"]["created"]),
            (period["cards"]["labels"], period["cards"]["worked"]),
        )
        for labels, values in pairs:
            if len(labels) != len(values):
                print(f"период {period['id']}: {len(labels)} подписей на {len(values)} значений")
                return
    print("ok")


globals()[sys.argv[1].replace("-", "_")]()
PY

# login <логин> <пароль> <АРМ> <роль> — кладёт cookie в $SESSION_COOKIE, id — в $LOGGED_USER_ID.
login() {
  anon_req POST /auth/login \
    "{\"login\":\"$1\",\"password\":\"$2\",\"armNumber\":$3}"
  check "вход $1 / АРМ $3" 200 "\"role\":\"$4\"" || return 1
  LOGGED_USER_ID="$(jget userId)"
  SESSION_COOKIE="$(session_cookie_from_headers)"
  [ -n "$SESSION_COOKIE" ] || {
    fail "cookie сессии arm112_session ($1)" "пустая сессия"
    return 1
  }
  return 0
}

# try_login <логин> <пароль> <АРМ> — только HTTP-код в $HTTP_CODE (сессия не меняется).
try_login() {
  anon_req POST /auth/login \
    "{\"login\":\"$1\",\"password\":\"$2\",\"armNumber\":$3}"
}

now_iso() {
  python3 -c "
import datetime
print(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds'))"
}

# ─── 1. Вход администратора и матрица доступа (T4.1-11) ───────────────────────────────────────────

step_login_admin() {
  login "$ADMIN_LOGIN" "$ADMIN_PASSWORD" "$ADMIN_ARM" admin || return 1
  ADMIN_COOKIE="$SESSION_COOKIE"
  expect "администратор системы — $ADMIN_ID" "$LOGGED_USER_ID" "$ADMIN_ID"
  anon_req GET /auth/policy
  check "политика входа: GET /auth/policy (локальная 2FA недоступна)" 200 '"twoFactorRequired":false'
  local code
  for route in /admin/users /admin/system; do
    code="$(page "$route")"
    [ "$code" = "200" ] && pass "администратор открывает $route (200)" ||
      fail "администратор открывает $route" "HTTP $code"
  done
  code="$(page /arm)"
  expect "изоляция: администратор на /arm → 403" "$code" 403
  code="$(page /teacher)"
  expect "изоляция: администратор на /teacher → 403" "$code" 403
  return 0
}

# ─── 2. Пользователи: список, фильтры, CRUD (T4.1-02…T4.1-09) ─────────────────────────────────────

step_users_list() {
  req GET /admin/users
  check "список пользователей: GET /admin/users" 200 '"role"' || return 1
  USERS_TOTAL="$(python3 "$WORK_DIR/tools.py" users-count <"$WORK_DIR/body")"
  [ "$USERS_TOTAL" -ge 20 ] && pass "в реестре $USERS_TOTAL учётных записей" ||
    fail "объём реестра" "получено $USERS_TOTAL"
  if grep -qF '"password"' "$WORK_DIR/body"; then
    fail "пароли не покидают мок-слой" "в ответе есть поле password"
  else
    pass "пароли не покидают мок-слой (PublicUser)"
  fi
  req GET "/admin/users?role=student"
  check "фильтр по роли: ?role=student" 200 || return 0
  expect "все записи фильтра — курсанты" \
    "$(python3 "$WORK_DIR/tools.py" users-field-all role student <"$WORK_DIR/body")" ok
  req GET "/admin/users?state=blocked"
  check "фильтр по состоянию: ?state=blocked" 200
  expect "в выдаче только заблокированные" \
    "$(python3 "$WORK_DIR/tools.py" users-field-all isActive False <"$WORK_DIR/body")" ok
  expect "заблокированная учётка $BLOCKED_LOGIN в выдаче" \
    "$(python3 "$WORK_DIR/tools.py" users-have-login "$BLOCKED_LOGIN" <"$WORK_DIR/body")" ok
  req GET "/admin/users?group=$(urlenc "$NEW_GROUP")"
  check "фильтр по группе: ?group=$NEW_GROUP" 200
  expect "в выдаче только группа $NEW_GROUP" \
    "$(python3 "$WORK_DIR/tools.py" users-field-all group "$NEW_GROUP" <"$WORK_DIR/body")" ok
  req GET "/admin/users?q=$TEACHER_LOGIN"
  check "поиск по ФИО/логину: ?q=$TEACHER_LOGIN" 200
  expect "поиск нашёл $TEACHER_LOGIN" \
    "$(python3 "$WORK_DIR/tools.py" users-have-login "$TEACHER_LOGIN" <"$WORK_DIR/body")" ok
  req GET "/admin/users?role=architect"
  check "мусор в фильтре роли → 400" 400 '"validationFailed"'
  return 0
}

step_user_create() {
  local body
  body="{\"adminId\":\"$ADMIN_ID\",\"fullName\":\"$NEW_FULL_NAME\",\"login\":\"$NEW_LOGIN\""
  body="$body,\"password\":\"$NEW_PASSWORD\",\"role\":\"student\",\"armNumber\":$NEW_ARM"
  body="$body,\"group\":\"$NEW_GROUP\"}"
  req POST /admin/users "$body"
  check "создание учётной записи: POST /admin/users" 201 "\"login\":\"$NEW_LOGIN\"" || return 1
  NEW_USER_ID="$(jget id)"
  pass "новая учётка получила id $NEW_USER_ID"
  req POST /admin/users "$body"
  check "повторный логин занят → 409 conflict" 409 '"conflict"'
  req POST /admin/users \
    "{\"adminId\":\"$ADMIN_ID\",\"fullName\":\"Кириллов К. К.\",\"login\":\"кириллица\",\"password\":\"12345678\",\"role\":\"student\",\"armNumber\":78}"
  check "логин кириллицей → 400 validationFailed" 400 '"validationFailed"'
  req POST /admin/users \
    "{\"adminId\":\"$ADMIN_ID\",\"fullName\":\"Нулевой Н. Н.\",\"login\":\"armzero\",\"password\":\"12345678\",\"role\":\"student\",\"armNumber\":0}"
  check "номер АРМ 0 → 400 validationFailed" 400 '"validationFailed"'
  try_login "$NEW_LOGIN" "$NEW_PASSWORD" "$NEW_ARM"
  check "созданный пользователь входит в систему" 200 '"role":"student"'
  return 0
}

step_user_role_and_block() {
  [ -n "${NEW_USER_ID:-}" ] || return 1
  req PATCH "/admin/users/$NEW_USER_ID" "{\"adminId\":\"$ADMIN_ID\",\"role\":\"teacher\"}"
  check "смена роли: PATCH /admin/users/$NEW_USER_ID → teacher" 200 '"role":"teacher"'
  req PATCH "/admin/users/$NEW_USER_ID" "{\"adminId\":\"$ADMIN_ID\",\"fullName\":\"Тестовый Тест Петрович\"}"
  check "редактирование ФИО: PATCH /admin/users/$NEW_USER_ID" 200 'Петрович'
  req POST "/admin/users/$NEW_USER_ID/block" "{\"adminId\":\"$ADMIN_ID\"}"
  check "блокировка: POST /admin/users/$NEW_USER_ID/block" 200 '"isActive":false'
  try_login "$NEW_LOGIN" "$NEW_PASSWORD" "$NEW_ARM"
  check "заблокированный не входит → 403 accountBlocked" 403 '"accountBlocked"'
  try_login "$BLOCKED_LOGIN" "$BLOCKED_PASSWORD" "$BLOCKED_ARM"
  check "заблокированный в сиде ($BLOCKED_LOGIN) не входит → 403" 403 '"accountBlocked"'
  req POST "/admin/users/$NEW_USER_ID/unblock" "{\"adminId\":\"$ADMIN_ID\"}"
  check "разблокировка: POST /admin/users/$NEW_USER_ID/unblock" 200 '"isActive":true'
  try_login "$NEW_LOGIN" "$NEW_PASSWORD" "$NEW_ARM"
  check "после разблокировки вход снова возможен" 200 '"role":"teacher"'
  req POST "/admin/users/$ADMIN_ID/block" "{\"adminId\":\"$ADMIN_ID\"}"
  check "администратор не блокирует сам себя → 409" 409 '"conflict"'
  return 0
}

step_user_reset_password() {
  [ -n "${NEW_USER_ID:-}" ] || return 1
  req POST "/admin/users/$NEW_USER_ID/reset-password" "{\"adminId\":\"$ADMIN_ID\"}"
  check "сброс пароля: POST /admin/users/$NEW_USER_ID/reset-password" 200 '"temporaryPassword"' || return 1
  TEMP_PASSWORD="$(jget temporaryPassword)"
  pass "выдан временный пароль ($TEMP_PASSWORD)"
  try_login "$NEW_LOGIN" "$NEW_PASSWORD" "$NEW_ARM"
  check "старый пароль после сброса не работает → 401" 401 '"unauthorized"'
  try_login "$NEW_LOGIN" "$TEMP_PASSWORD" "$NEW_ARM"
  check "вход по временному паролю" 200 '"role":"teacher"'
  return 0
}

# ─── 3. Журнал аудита: сид + рантайм-события (T4.1-01, T4.2-05, T4.2-22) ──────────────────────────

step_teacher_override() {
  # Правка оценки преподавателем — рантайм-событие чужой роли в журнале администратора.
  local admin_cookie="$SESSION_COOKIE"
  login "$TEACHER_LOGIN" "$TEACHER_PASSWORD" "$TEACHER_ARM" teacher || return 1
  req POST "/attempts/$REPORTED_ATTEMPT/evaluation" \
    "{\"teacherId\":\"$TEACHER_ID\",\"score\":$OVERRIDE_SCORE,\"comment\":\"Проверка журнала аудита\"}"
  check "преподаватель правит оценку: POST /attempts/$REPORTED_ATTEMPT/evaluation" 200 '"teacherOverride"'
  local code
  code="$(page /admin/users)"
  expect "изоляция: преподаватель на /admin/users → 403" "$code" 403
  code="$(page /admin/system)"
  expect "изоляция: преподаватель на /admin/system → 403" "$code" 403
  SESSION_COOKIE="$admin_cookie"
  return 0
}

step_audit() {
  req GET "/admin/audit?perPage=100"
  check "журнал аудита: GET /admin/audit" 200 '"items"' || return 1
  expect "формат ответа — единый со списками проекта" \
    "$(jget page)$(jget perPage)" "1100"
  expect "в журнале и сид mocks/admin/audit-log.json, и рантайм-события" \
    "$(python3 "$WORK_DIR/tools.py" audit-seed-and-runtime 22 <"$WORK_DIR/body")" ok
  expect "рантайм-события администратора и преподавателя записаны" \
    "$(python3 "$WORK_DIR/tools.py" audit-has auth.login user.create user.update user.roleChange \
      user.block user.unblock user.passwordReset evaluation.override <"$WORK_DIR/body")" ok
  local details
  req GET "/admin/audit?type=login&operator=$ADMIN_ID&perPage=100"
  check "фильтр «Вход в систему» по администратору" 200 '"auth.login"'
  details="$(python3 "$WORK_DIR/tools.py" audit-details auth.login <"$WORK_DIR/body")"
  case "$details" in
    *"АРМ $ADMIN_ARM"*) pass "запись входа администратора: $details" ;;
    *) fail "запись входа администратора" "описание: ${details:-нет}" ;;
  esac
  req GET "/admin/audit?type=users&perPage=100"
  check "фильтр «Тип события» = Управление пользователями" 200
  expect "в выдаче только события пользователей" \
    "$(python3 "$WORK_DIR/tools.py" audit-prefix-all user. <"$WORK_DIR/body")" ok
  req GET "/admin/audit?type=login&perPage=100"
  check "фильтр «Тип события» = Вход в систему" 200 '"auth.login"'
  req GET "/admin/audit?type=grades&perPage=100"
  check "фильтр «Тип события» = Оценки (правка преподавателя)" 200 '"evaluation.override"'
  req GET "/admin/audit?operator=$ADMIN_ID&perPage=100"
  check "фильтр «по оператору»: ?operator=$ADMIN_ID" 200
  expect "в выдаче только события администратора" \
    "$(python3 "$WORK_DIR/tools.py" audit-field-all userId "$ADMIN_ID" <"$WORK_DIR/body")" ok
  req GET "/admin/audit?card=$AUDIT_CARD&perPage=100"
  check "фильтр «по карточке»: ?card=$AUDIT_CARD" 200
  expect "в выдаче только записи карточки $AUDIT_CARD" \
    "$(python3 "$WORK_DIR/tools.py" audit-field-all cardId "$AUDIT_CARD" <"$WORK_DIR/body")" ok
  req GET "/admin/audit?type=card&q=$(urlenc нарушения)&perPage=100"
  check "событие «Нарушения исправлены» (ПОВ-112 v2.1) ищется по журналу" 200 '"card.violationsFixed"'
  req GET "/admin/audit?from=2026-09-19T00:00:00%2B03:00&to=2026-09-19T23:59:59%2B03:00&perPage=100"
  check "фильтр периода: 19.09.2026" 200 '"2026-09-19'
  local first second
  req GET "/admin/audit?perPage=5&page=1"
  check "пагинация: страница 1 по 5 записей" 200
  first="$(python3 "$WORK_DIR/tools.py" audit-ids <"$WORK_DIR/body")"
  req GET "/admin/audit?perPage=5&page=2"
  check "пагинация: страница 2" 200 '"page":2'
  second="$(python3 "$WORK_DIR/tools.py" audit-ids <"$WORK_DIR/body")"
  if [ -n "$first" ] && [ -n "$second" ] && [ "$first" != "$second" ]; then
    pass "страницы журнала не пересекаются"
  else
    fail "страницы журнала не пересекаются" "стр.1: $first / стр.2: $second"
  fi
  req GET "/admin/audit?type=nope"
  check "мусор в фильтре типа → 400" 400 '"validationFailed"'
  req GET "/admin/audit?from=not-a-date"
  check "мусор в фильтре периода → 400" 400 '"validationFailed"'
  return 0
}

# ─── 4. Сервисы: состояние и мок-действия (T4.2-03, T4.2-08…T4.2-10, T4.2-24) ─────────────────────

step_services() {
  req GET /admin/system/services
  check "состояние сервисов: GET /admin/system/services" 200 '"integrity"' || return 1
  expect "4 сервиса и сводка самопроверки «OK»" \
    "$(python3 "$WORK_DIR/tools.py" services-summary <"$WORK_DIR/body")" "4 true"
  expect "мок-SIP деградирован (жёлтая плитка)" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_SIP" <"$WORK_DIR/body")" "degraded 7320"
  req POST "/admin/system/services/$SVC_SIP/action" "{\"action\":\"restart\",\"adminId\":\"$ADMIN_ID\"}"
  check "перезапуск: POST /admin/system/services/$SVC_SIP/action (restart)" 200
  expect "degraded → restart → running, аптайм сброшен" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_SIP" <"$WORK_DIR/body")" "running 0"
  req POST "/admin/system/services/$SVC_AI/action" "{\"action\":\"start\",\"adminId\":\"$ADMIN_ID\"}"
  check "запуск ИИ-модуля: start" 200
  expect "stopped → start → running" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_AI" <"$WORK_DIR/body")" "running 0"
  req POST "/admin/system/services/$SVC_AI/action" "{\"action\":\"stop\",\"adminId\":\"$ADMIN_ID\"}"
  check "остановка ИИ-модуля: stop" 200
  expect "running → stop → stopped" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_AI" <"$WORK_DIR/body")" "stopped 0"
  req POST "/admin/system/services/$SVC_AI/action" "{\"action\":\"reboot\",\"adminId\":\"$ADMIN_ID\"}"
  check "неизвестное действие → 400 validationFailed" 400 '"validationFailed"'
  req POST "/admin/system/services/svc-none/action" "{\"action\":\"start\",\"adminId\":\"$ADMIN_ID\"}"
  check "неизвестный сервис → 404" 404
  req GET "/admin/audit?type=settings&perPage=100"
  check "действия над сервисами попали в аудит" 200 '"service.action"'
  req GET /admin/system/logs
  check "действия над сервисами попали в системные журналы" 200 || return 0
  expect "в ленте журналов есть запись ИИ-модуля" \
    "$(python3 "$WORK_DIR/tools.py" logs-have-source "$SVC_AI" <"$WORK_DIR/body")" ok
  return 0
}

step_session_lock() {
  req GET "/sessions?state=running"
  check "идущее занятие: GET /sessions?state=running" 200 "\"$RUNNING_SESSION\"" || return 1
  req POST "/admin/system/services/$SVC_DB/action" "{\"action\":\"stop\",\"adminId\":\"$ADMIN_ID\"}"
  check "остановка БД во время занятия → 409 conflict" 409 'активного занятия'
  req GET /admin/system/services
  expect "состояние БД не изменилось" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_DB" <"$WORK_DIR/body" | cut -d' ' -f1)" running
  req POST "/admin/system/services/$SVC_WEB/action" "{\"action\":\"stop\",\"adminId\":\"$ADMIN_ID\"}"
  check "остановка веб-сервера (критичный) во время занятия → 409" 409 'активного занятия'
  req POST "/admin/system/services/$SVC_SIP/action" "{\"action\":\"stop\",\"adminId\":\"$ADMIN_ID\"}"
  check "некритичный мок-SIP останавливается и во время занятия" 200
  # Занятие завершает преподаватель — администратор в учебный процесс не вмешивается (ТЗ §8).
  login "$TEACHER_LOGIN" "$TEACHER_PASSWORD" "$TEACHER_ARM" teacher || return 1
  req POST "/sessions/$RUNNING_SESSION/stop"
  check "преподаватель завершает занятие: POST /sessions/$RUNNING_SESSION/stop" 200
  # После студенческого/преподавательского E2E могут остаться другие занятия этого преподавателя.
  req GET "/sessions?state=running&teacherId=$TEACHER_ID"
  local session_id
  for session_id in $(python3 -c 'import json,sys; print(" ".join(row["id"] for row in json.load(sys.stdin)))' <"$WORK_DIR/body"); do
    req POST "/sessions/$session_id/stop"
    check "преподаватель завершает оставшееся занятие: $session_id" 200
  done
  SESSION_COOKIE="$ADMIN_COOKIE"
  req POST "/admin/system/services/$SVC_DB/action" "{\"action\":\"stop\",\"adminId\":\"$ADMIN_ID\"}"
  check "после завершения занятия остановка БД разрешена" 200
  expect "БД остановлена" \
    "$(python3 "$WORK_DIR/tools.py" service-state "$SVC_DB" <"$WORK_DIR/body" | cut -d' ' -f1)" stopped
  req POST "/admin/system/services/$SVC_DB/action" "{\"action\":\"start\",\"adminId\":\"$ADMIN_ID\"}"
  check "БД возвращена в работу: start" 200
  return 0
}

# ─── 5. Настройки: нормативы ТЗ (T4.2-04, T4.2-15…T4.2-20) ────────────────────────────────────────

step_settings() {
  req GET /admin/system/settings
  check "настройки системы: GET /admin/system/settings" 200 '"telephony"' || return 1
  expect "дефолт бэкапа проходит норматив (≤ $NORM_BACKUP_HOURS ч)" \
    "$([ "$(jget backup.periodHours)" -le "$NORM_BACKUP_HOURS" ] && echo ok)" ok
  expect "дефолт журналов проходит норматив (≥ $NORM_LOG_MONTHS мес)" \
    "$([ "$(jget logging.retentionMonths)" -ge "$NORM_LOG_MONTHS" ] && echo ok)" ok
  expect "дефолт лимита сессий проходит норматив (≥ $NORM_SESSION_LIMIT)" \
    "$([ "$(jget performance.sessionLimit)" -ge "$NORM_SESSION_LIMIT" ] && echo ok)" ok

  req PATCH /admin/system/settings "{\"backup\":{\"periodHours\":48},\"adminId\":\"$ADMIN_ID\"}"
  check "бэкап реже 1 раза в сутки (48 ч) → 422 с текстом норматива" 422 '1 раза в сутки'
  req PATCH /admin/system/settings "{\"backup\":{\"periodHours\":12},\"adminId\":\"$ADMIN_ID\"}"
  check "бэкап 12 ч → 200" 200
  req GET /admin/system/settings
  expect "период бэкапа прочитан обратно" "$(jget backup.periodHours)" 12

  req PATCH /admin/system/settings "{\"logging\":{\"retentionMonths\":3},\"adminId\":\"$ADMIN_ID\"}"
  check "журналы 3 мес → 422 (норматив ≥ $NORM_LOG_MONTHS мес)" 422 'не менее 6 месяцев'
  req PATCH /admin/system/settings "{\"logging\":{\"retentionMonths\":6},\"adminId\":\"$ADMIN_ID\"}"
  check "журналы 6 мес → 200" 200
  req GET /admin/system/settings
  expect "срок хранения журналов прочитан обратно" "$(jget logging.retentionMonths)" 6

  req PATCH /admin/system/settings "{\"performance\":{\"sessionLimit\":10},\"adminId\":\"$ADMIN_ID\"}"
  check "лимит сессий 10 → 422 (норматив ≥ $NORM_SESSION_LIMIT)" 422 'Не менее 20 одновременных сессий'
  req PATCH /admin/system/settings "{\"performance\":{\"sessionLimit\":20},\"adminId\":\"$ADMIN_ID\"}"
  check "лимит сессий 20 → 200" 200
  req GET /admin/system/settings
  expect "лимит сессий прочитан обратно" "$(jget performance.sessionLimit)" 20

  req PATCH /admin/system/settings "{\"telephony\":{\"realm\":\"e2e.arm112.local\"},\"adminId\":\"$ADMIN_ID\"}"
  check "телефония: realm сохраняется" 200
  req GET /admin/system/settings
  expect "realm прочитан обратно" "$(jget telephony.realm)" e2e.arm112.local
  req PATCH /admin/system/settings "{\"telephony\":{\"realm\":\"bad realm!\"},\"adminId\":\"$ADMIN_ID\"}"
  check "недопустимый realm → 422" 422 'Realm'

  local db_host
  req GET /admin/system/settings
  db_host="$(jget database.host)"
  req PATCH /admin/system/settings \
    "{\"database\":{\"host\":\"hacked.local\",\"name\":\"hacked\"},\"adminId\":\"$ADMIN_ID\"}"
  req GET /admin/system/settings
  expect "база данных read-only: PATCH не меняет хост" "$(jget database.host)" "$db_host"
  return 0
}

step_settings_security_and_backup() {
  req PATCH /admin/system/settings "{\"security\":{\"require2fa\":false},\"adminId\":\"$ADMIN_ID\"}"
  check "безопасность: локальная 2FA не настраивается" 422 '2FA не поддерживается'
  anon_req GET /auth/policy
  check "политика входа остаётся без 2FA" 200 '"twoFactorRequired":false'
  anon_req POST /auth/login \
    "{\"login\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASSWORD\",\"armNumber\":$ADMIN_ARM}"
  check "вход без кода из сообщения" 200 '"twoFactorUsed":false'
  req PATCH /admin/system/settings "{\"security\":{\"require2fa\":true},\"adminId\":\"$ADMIN_ID\"}"
  check "безопасность: включение 2FA отклонено" 422 '2FA не поддерживается'
  req PATCH /admin/system/settings "{\"security\":{\"minPasswordLength\":3},\"adminId\":\"$ADMIN_ID\"}"
  check "длина пароля 3 → 422" 422 'длина пароля'
  req PATCH /admin/system/settings "{\"security\":{\"lockAfterAttempts\":0},\"adminId\":\"$ADMIN_ID\"}"
  check "блокировка после 0 попыток → 422" 422 'Блокировка после'

  local backup_at
  backup_at="$(now_iso)"
  req PATCH /admin/system/settings "{\"backup\":{\"lastAt\":\"$backup_at\"},\"adminId\":\"$ADMIN_ID\"}"
  check "«Выполнить сейчас»: время последнего бэкапа обновлено" 200
  req GET /admin/system/settings
  expect "время бэкапа прочитано обратно" "$(jget backup.lastAt)" "$backup_at"
  req GET "/admin/audit?type=backup&perPage=100"
  check "событие «Резервное копирование» в аудите" 200 '"backup.run"'
  req GET "/admin/audit?type=settings&perPage=100"
  check "событие «Смена настроек» в аудите" 200 '"settings.update"'
  return 0
}

# ─── 6. Мониторинг и статистика использования (T4.2-12, T4.2-14) ──────────────────────────────────

step_monitoring() {
  req GET /admin/system/monitoring
  check "мониторинг нагрузки: GET /admin/system/monitoring" 200 '"norms"' || return 1
  local summary hours step points limit response max_sessions max_response
  summary="$(python3 "$WORK_DIR/tools.py" monitoring-summary <"$WORK_DIR/body")"
  read -r hours step points limit response max_sessions max_response <<<"$summary"
  expect "ряды покрывают 24 ч" "$hours" 24
  [ "$points" = "$((hours * 60 / step + 1))" ] && pass "подписи и ряды одной длины ($points точек)" ||
    fail "подписи и ряды одной длины" "$summary"
  expect "норматив одновременных сессий на графике" "$limit" "$NORM_SESSION_LIMIT"
  expect "норматив отклика интерфейса на графике" "$response" "$NORM_RESPONSE_SEC"
  awk "BEGIN{exit !($max_sessions > $limit)}" &&
    pass "есть участок превышения норматива сессий ($max_sessions > $limit)" ||
    fail "участок превышения норматива сессий" "максимум $max_sessions"
  awk "BEGIN{exit !($max_response > $response)}" &&
    pass "есть участок превышения отклика ($max_response с > $response с)" ||
    fail "участок превышения отклика" "максимум $max_response"

  req GET /admin/system/usage-stats
  check "статистика использования: GET /admin/system/usage-stats" 200 || return 0
  expect "периоды «неделя» и «месяц»" \
    "$(python3 "$WORK_DIR/tools.py" usage-periods <"$WORK_DIR/body")" "week,month"
  expect "диаграммы совместимы с props чартов" \
    "$(python3 "$WORK_DIR/tools.py" usage-charts-ok <"$WORK_DIR/body")" ok
  req GET "/admin/system/usage-stats?period=month"
  check "выбор периода «месяц» перестраивает данные" 200 'Месяц'
  req GET "/admin/system/usage-stats?period=year"
  check "мусор в периоде → 400" 400 '"validationFailed"'
  return 0
}

# ─── 7. Системные журналы и пакетное обновление (T4.2-21, T4.2-23) ────────────────────────────────

step_logs_and_update() {
  req GET /admin/system/logs
  check "системные журналы: GET /admin/system/logs" 200 || return 1
  expect "в ленте все три уровня" \
    "$(python3 "$WORK_DIR/tools.py" logs-levels <"$WORK_DIR/body")" "ERROR,INFO,WARN"
  req GET "/admin/system/logs?level=ERROR"
  check "фильтр уровня: ?level=ERROR" 200
  expect "в выдаче только ошибки" \
    "$(python3 "$WORK_DIR/tools.py" logs-levels <"$WORK_DIR/body")" ERROR
  req GET "/admin/system/logs?level=INFO"
  check "фильтр уровня: ?level=INFO" 200
  expect "в выдаче только INFO" \
    "$(python3 "$WORK_DIR/tools.py" logs-levels <"$WORK_DIR/body")" INFO
  req GET "/admin/system/logs?level=TRACE"
  check "мусор в уровне → 400" 400 '"validationFailed"'
  # Пакетное обновление — клиентская заглушка (ручной режим, ТЗ §6): серверного приёмника файла нет.
  req POST /admin/system/update '{"file":"update.tar.gz"}'
  expect "пакет обновления никуда не отправляется (эндпоинта загрузки нет)" "$HTTP_CODE" 404
  return 0
}

# ─── 8. Изоляция ролей на админских разделах (T4.1-11) ────────────────────────────────────────────

step_isolation() {
  local code
  login "$STUDENT_LOGIN" "$STUDENT_PASSWORD" "$STUDENT_ARM" student || return 1
  code="$(page /admin/users)"
  expect "изоляция: курсант на /admin/users → 403" "$code" 403
  code="$(page /admin/system)"
  expect "изоляция: курсант на /admin/system → 403" "$code" 403
  req POST /admin/users \
    "{\"adminId\":\"$LOGGED_USER_ID\",\"fullName\":\"Самозванец С. С.\",\"login\":\"intruder\",\"password\":\"12345678\",\"role\":\"admin\",\"armNumber\":99}"
  check "курсант не создаёт учётку (минимальные привилегии) → 403" 403 '"forbidden"'
  SESSION_COOKIE=""
  code="$(page /admin/system)"
  expect "аноним на /admin/system → 307 на /login" "$code" 307
  SESSION_COOKIE="$ADMIN_COOKIE"
  code="$(page /admin/system)"
  expect "администратор возвращается на /admin/system (200)" "$code" 200
  return 0
}

printf 'Сквозной прогон администратора: %s\n\n' "$BASE_URL"

step_login_admin || {
  printf '\nПрогон прерван: вход администратором не выполнен (сервер поднят? порт 3130?).\n'
  exit 1
}
step_users_list
step_user_create || printf '  (учётка не создана — часть проверок пропущена)\n'
step_user_role_and_block
step_user_reset_password
step_teacher_override
step_audit
step_services
step_session_lock
step_settings
step_settings_security_and_backup
step_monitoring
step_logs_and_update
step_isolation

printf '\nИтог: PASS %d, FAIL %d (шагов %d)\n' "$PASSED" "$FAILED" "$STEP"
[ "$FAILED" -eq 0 ] || exit 1
