#!/usr/bin/env bash
# Сквозной прогон АРМ преподавателя по HTTP (замена Playwright — браузерных зависимостей в проекте нет).
# Работает против ТОЛЬКО ЧТО запущенного сервера: `npx next start -p 3130`, затем `scripts/e2e-teacher.sh`.
# Мок-стор живёт в памяти процесса и накапливает состояние, поэтому перед повторным прогоном сервер перезапускать.
# Печатает PASS/FAIL по шагам; код возврата 0 — все шаги прошли.
#
# Покрытие (гейты T3.1/T3.2/T3.3/T3.4):
#   вход преподавателем → сценарий А ТЗ §10 (генерация ИИ → правка → коррекция → частичное и полное
#   утверждение, материалы, профильные категории, грамматика, аудит) → мастер занятия (POST /sessions
#   с планом + start) → лента выдачи → действия курсанта (attempt → статусы → завершение) видны
#   преподавателю в ленте и на мониторе → пауза/возобновление/внеочередная выдача → «Завершить занятие»
#   → report (finished → reported) → журнал отчётов, отчёт занятия, правка оценки с аудитом «было → стало»,
#   обратная связь курсанту и её видимость в /reports студента → ограничения доступа (чужое занятие,
#   чужой курсант, студент на /teacher → 403).
set -uo pipefail

# Скрипт читает mocks/*.json — работаем от корня репозитория независимо от места запуска.
cd "$(dirname "$0")/.." || exit 1

BASE_URL="${BASE_URL:-http://127.0.0.1:3130}"
API="$BASE_URL/api/mock"

TEACHER_LOGIN="${E2E_TEACHER_LOGIN:-morozova}"
TEACHER_PASSWORD="${E2E_TEACHER_PASSWORD:-teacher112}"
TEACHER_ARM="${E2E_TEACHER_ARM:-21}"
TEACHER_ID="${E2E_TEACHER_ID:-u-002}"

STUDENT_LOGIN="${E2E_STUDENT_LOGIN:-ivanov}"
STUDENT_PASSWORD="${E2E_STUDENT_PASSWORD:-student112}"
STUDENT_ARM="${E2E_STUDENT_ARM:-1}"
STUDENT_ID="${E2E_STUDENT_ID:-u-005}"

TWO_FACTOR="${E2E_2FA:-123456}"

# Категория событий занятия: группа ЕКП из профиля курсанта ДДС-01 (иначе профильный фильтр
# (T3.1-09) отбросит все карточки и расписание выдачи будет пустым).
CATEGORY="${E2E_CATEGORY:-пожар в жилом доме}"

# Отчётное занятие из моков (завершено 16.09): журнал, отчёт, правка оценки, обратная связь.
REPORTED_SESSION="${E2E_REPORTED_SESSION:-ses-2026-09-16-01}"
REPORTED_REPORT="${E2E_REPORTED_REPORT:-rep-2026-09-16-01-u-005}"
REPORTED_ATTEMPT="${E2E_REPORTED_ATTEMPT:-att-01}"
OVERRIDE_SCORE="${E2E_OVERRIDE_SCORE:-55}"
# Норматив формирования отчёта, сек (ТЗ §7).
REPORT_BUILD_LIMIT="${E2E_REPORT_BUILD_LIMIT:-30}"

OTHER_TEACHER_ID="${E2E_OTHER_TEACHER_ID:-u-003}"
OTHER_TEACHER_LOGIN="${E2E_OTHER_TEACHER_LOGIN:-kovalev}"
OTHER_TEACHER_ARM="${E2E_OTHER_TEACHER_ARM:-22}"
# Курсант другой группы (ДДС-02) — в занятие преподавателя не входит.
OTHER_STUDENT_ID="${E2E_OTHER_STUDENT_ID:-u-015}"
OTHER_SCENARIO="${E2E_OTHER_SCENARIO:-s-002}"

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

# page <путь страницы> — HTTP-код страницы Next с текущей cookie (гварды proxy.ts).
page() {
  local args=(-sS -o /dev/null -w '%{http_code}' "$BASE_URL$1")
  [ -n "${SESSION_COOKIE:-}" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  curl "${args[@]}" 2>/dev/null || echo 000
}

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


def feed_issued() -> None:
    """cardId и issuedAt первой выданной карточки курсанта из ленты занятия."""
    feed = json.load(sys.stdin)
    for event in feed.get("events", []):
        if event.get("kind") == "cardIssued" and event.get("studentId") == sys.argv[2]:
            print(f"{event['cardId']} {event['at']}")
            return
    print("")


def feed_kinds() -> None:
    """Через пробел: сколько событий каждого вида в ленте (в порядке аргументов)."""
    feed = json.load(sys.stdin)
    kinds = [event.get("kind") for event in feed.get("events", [])]
    print(" ".join(str(kinds.count(kind)) for kind in sys.argv[2:]))


def report_score() -> None:
    """Балл отчёта курсанта sys.argv[2] (живой пересчёт, T3.4-09)."""
    payload = json.load(sys.stdin)
    for report in payload.get("reports", []):
        if report["student"]["studentId"] == sys.argv[2]:
            print(report["score"])
            return
    print("")


def report_feedback() -> None:
    """Текст обратной связи преподавателя в отчёте курсанта sys.argv[2]; пусто — её нет."""
    payload = json.load(sys.stdin)
    for report in payload.get("reports", []):
        if report["student"]["studentId"] == sys.argv[2]:
            print((report.get("teacherFeedback") or {}).get("text", ""))
            return
    print("")


def group_report_is_null() -> None:
    print("ok" if json.load(sys.stdin).get("groupReport") is None else "bad")


def journal_build_sec() -> None:
    """buildSec строки журнала по занятию sys.argv[2] («сформирован за N сек», ТЗ §7)."""
    payload = json.load(sys.stdin)
    for row in payload.get("rows", []):
        if row.get("sessionId") == sys.argv[2]:
            print("" if row.get("buildSec") is None else row["buildSec"])
            return
    print("")


def journal_has_session() -> None:
    rows = json.load(sys.stdin).get("rows", [])
    print("ok" if any(row.get("sessionId") == sys.argv[2] for row in rows) else "bad")


def _audit_entries(payload):
    """Журнал аудита: {items,…} (волна 4) либо голый список (волна 3)."""
    return payload["items"] if isinstance(payload, dict) else payload


def audit_override() -> None:
    """Запись аудита evaluation.override по попытке sys.argv[2] — «было X → стало Y»."""
    for entry in _audit_entries(json.load(sys.stdin)):
        if entry.get("action") == "evaluation.override" and sys.argv[2] in entry.get("details", ""):
            print(entry["details"])
            return
    print("")


def audit_actions() -> None:
    """ok, если в журнале аудита есть все перечисленные действия."""
    actions = {entry.get("action") for entry in _audit_entries(json.load(sys.stdin))}
    missing = [action for action in sys.argv[2:] if action not in actions]
    print("ok" if not missing else "нет записей: " + ", ".join(missing))


def flow_count() -> None:
    """Сколько карточек в расписании выдачи занятия для курсанта sys.argv[2]."""
    session = json.load(sys.stdin)
    print(sum(1 for item in session.get("cardFlow", []) if item.get("studentId") == sys.argv[2]))


globals()[sys.argv[1].replace("-", "_")]()
PY

# login <логин> <пароль> <АРМ> <роль> — кладёт cookie в $SESSION_COOKIE, id — в $LOGGED_USER_ID.
login() {
  req POST /auth/login "{\"login\":\"$1\",\"password\":\"$2\",\"armNumber\":$3}"
  check "вход $1 / АРМ $3 / 2FA" 200 "\"role\":\"$4\"" || return 1
  LOGGED_USER_ID="$(jget userId)"
  SESSION_COOKIE="$(session_cookie_from_headers)"
  [ -n "$SESSION_COOKIE" ] || {
    fail "cookie сессии arm112_session ($1)" "пустая сессия"
    return 1
  }
  return 0
}

now_iso() {
  python3 -c "
import datetime
print(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds'))"
}

# ─── 1. Вход преподавателя и матрица доступа ──────────────────────────────────────────────────────

step_login_teacher() {
  login "$TEACHER_LOGIN" "$TEACHER_PASSWORD" "$TEACHER_ARM" teacher || return 1
  TEACHER_COOKIE="$SESSION_COOKIE"
  expect "преподаватель занятия — $TEACHER_ID" "$LOGGED_USER_ID" "$TEACHER_ID"
  local code
  for route in /teacher /teacher/session /teacher/scenarios /teacher/reports; do
    code="$(page "$route")"
    [ "$code" = "200" ] && pass "преподаватель открывает $route (200)" ||
      fail "преподаватель открывает $route" "HTTP $code"
  done
  code="$(page /arm)"
  expect "преподаватель на /arm → 403" "$code" 403
  code="$(page /admin/users)"
  expect "преподаватель на /admin/users → 403" "$code" 403
  req GET "/users?role=student"
  check "справочник курсантов: GET /users?role=student" 200 '"role":"student"'
}

# ─── 2. Сценарий А ТЗ §10: конструктор сценариев (T3.1) ───────────────────────────────────────────

step_generate() {
  req POST /scenarios/generate "{\"category\":\"$CATEGORY\",\"requestedBy\":\"$TEACHER_ID\"}"
  check "генерация ИИ: POST /scenarios/generate («$CATEGORY»)" 201 '"source":"generated"' || return 1
  SCENARIO_ID="$(jget 0.id)"
  SCENARIO_TWIN="$(jget 1.id)"
  local status cards
  status="$(jget 0.validation.status)"
  cards="$(jget 0.cardIds)"
  expect "сгенерированный сценарий $SCENARIO_ID ждёт проверки (pending)" "$status" pending
  [ "$cards" != "[]" ] && pass "очередь карточек вариации заполнена: $cards" ||
    fail "очередь карточек вариации" "cardIds пуст — профильный фильтр отбросит выдачу"
}

step_edit_scenario() {
  req PATCH "/scenarios/$SCENARIO_ID" \
    "{\"difficulty\":2,\"timeNorms\":{\"primaryReactionSec\":30,\"fullProcessingSec\":180},\"updatedBy\":\"$TEACHER_ID\"}"
  check "редактирование сценария: PATCH /scenarios/$SCENARIO_ID (сложность 2)" 200 '"difficulty":2' || return 1
  expect "уровень пересчитан по сложности" "$(jget level)" beginner
  req POST /grammar-check '{"text":"выехал наряд","field":"dispatcherAction"}'
  check "проверка грамматики (ИИ): POST /grammar-check" 200 '"origin":"ai"'
}

step_correction() {
  req POST "/scenarios/$SCENARIO_ID/validate" \
    "{\"action\":\"reject\",\"reviewedBy\":\"$TEACHER_ID\",\"comment\":\"Коррекция: уточнить эталонные действия\"}"
  check "коррекция: отклонение с комментарием" 200 '"status":"rejected"' || return 1
  expect "комментарий коррекции сохранён" "$(jget validation.comment)" "Коррекция: уточнить эталонные действия"
  req POST /sessions \
    "{\"teacherId\":\"$TEACHER_ID\",\"studentIds\":[\"$STUDENT_ID\"],\"scenarioIds\":[\"$SCENARIO_ID\"],\"mode\":\"practice\",\"cardSource\":\"generated\"}"
  check "неутверждённый сценарий нельзя назначить в занятие → 400" 400 'не утверждён'
}

step_approve() {
  req POST "/scenarios/$SCENARIO_ID/validate" "{\"action\":\"submit\",\"reviewedBy\":\"$TEACHER_ID\"}"
  check "сценарий возвращён на проверку (pending)" 200 '"status":"pending"' || return 1
  req POST "/scenarios/$SCENARIO_ID/validate" \
    "{\"action\":\"approvePartial\",\"reviewedBy\":\"$TEACHER_ID\",\"fields\":[\"etalon.expectedActions\",\"successCriteria\"]}"
  check "частичное утверждение: выбранные поля эталона" 200 '"approvedFields"' || return 1
  expect "частичное утверждение сохранило выбор полей" \
    "$(jget validation.approvedFields)" '["etalon.expectedActions", "successCriteria"]'
  req POST "/scenarios/$SCENARIO_ID/validate" "{\"action\":\"submit\",\"reviewedBy\":\"$TEACHER_ID\"}"
  check "сценарий снова на проверке перед полным утверждением" 200 '"status":"pending"' || return 1
  req POST "/scenarios/$SCENARIO_ID/validate" \
    "{\"action\":\"approve\",\"reviewedBy\":\"$TEACHER_ID\",\"comment\":\"Эталон проверен целиком\"}"
  check "полное утверждение сценария $SCENARIO_ID" 200 '"status":"approved"'
  req POST "/scenarios/$SCENARIO_ID/validate" "{\"action\":\"approve\",\"reviewedBy\":\"$TEACHER_ID\"}"
  check "повторное утверждение вне графа → 409 invalidTransition" 409 '"invalidTransition"'
  req GET "/scenarios?validationStatus=approved"
  check "утверждённый сценарий виден мастеру занятия" 200 "\"$SCENARIO_ID\""
}

step_materials_and_profiles() {
  req POST /materials "{\"name\":\"Методика занятия.docx\",\"sizeBytes\":24576,\"uploadedBy\":\"$TEACHER_ID\"}"
  check "материалы: POST /materials (DOCX-заглушка)" 201 '"format":"DOCX"'
  req POST /materials "{\"name\":\"Схема.exe\",\"uploadedBy\":\"$TEACHER_ID\"}"
  check "неподдерживаемый формат материала → 400" 400 '"validationFailed"'
  req GET /profile-mapping
  check "профильные категории: GET /profile-mapping" 200 '"incidentGroups"' || return 1
  local row_id
  row_id="$(jget 0.id)"
  req PUT /profile-mapping \
    "{\"rows\":[{\"id\":\"$row_id\",\"incidentGroups\":[\"$CATEGORY\",\"Человек в опасности\"]}],\"savedBy\":\"$TEACHER_ID\"}"
  check "привязка профиля «$row_id» сохранена" 200 "$CATEGORY"
}

step_scenario_audit() {
  # Волна 4 перевела /admin/audit на единый формат списков {items,total,page,perPage}, perPage по
  # умолчанию 10 — за решениями конструктора берём страницу целиком.
  req GET "/admin/audit?type=content&perPage=100"
  check "журнал аудита доступен: GET /admin/audit" 200 '"action"' || return 1
  local verdict
  verdict="$(python3 "$WORK_DIR/tools.py" audit-actions scenario.generate scenario.update scenario.reject \
    scenario.approvePartial scenario.approve material.upload profileMapping.save <"$WORK_DIR/body")"
  expect "решения конструктора записаны в аудит" "$verdict" ok
}

# ─── 3. Мастер занятия (T3.2) ─────────────────────────────────────────────────────────────────────

step_wizard() {
  local plan
  plan="{\"categories\":[\"$CATEGORY\"],\"issueOrder\":\"manual\",\"hints\":false,\"timeNorms\":{\"primaryReactionSec\":30,\"fullProcessingSec\":180},\"maxGrammarErrors\":2,\"paceSec\":60,\"conveyor\":false}"
  req POST /sessions \
    "{\"teacherId\":\"$TEACHER_ID\",\"studentIds\":[\"$STUDENT_ID\"],\"scenarioIds\":[\"$SCENARIO_ID\"],\"mode\":\"practice\",\"cardSource\":\"generated\",\"plan\":$plan}"
  check "мастер занятия: POST /sessions с планом" 201 '"state":"configured"' || return 1
  SESSION_ID="$(jget id)"
  req POST "/sessions/$SESSION_ID/start"
  check "старт занятия $SESSION_ID (configured → running)" 200 '"state":"running"' || return 1
  local flow
  flow="$(python3 "$WORK_DIR/tools.py" flow-count "$STUDENT_ID" <"$WORK_DIR/body")"
  [ "${flow:-0}" -ge 2 ] && pass "расписание выдачи по плану: карточек курсанту — $flow" ||
    fail "расписание выдачи по плану" "карточек курсанту: $flow (ожидалось ≥ 2)"
  req POST "/sessions/$SESSION_ID/start"
  check "повторный старт вне графа → 409 invalidTransition" 409 '"invalidTransition"'
}

# ─── 4. Лента занятия и управление выдачей (T3.3, T3.2-11) ────────────────────────────────────────

step_feed() {
  req GET "/sessions/$SESSION_ID/feed"
  check "лента занятия: GET /sessions/$SESSION_ID/feed" 200 '"events"' || return 1
  local issued
  issued="$(python3 "$WORK_DIR/tools.py" feed-issued "$STUDENT_ID" <"$WORK_DIR/body")"
  [ -n "$issued" ] || {
    fail "в ленте есть выдача карточки (cardIssued)" "событий выдачи нет"
    return 1
  }
  CARD_ID="${issued%% *}"
  ISSUED_AT="${issued#* }"
  pass "лента выдала карточку $CARD_ID курсанту $STUDENT_ID (issuedAt=$ISSUED_AT)"
  req GET "/sessions/$SESSION_ID/control"
  check "состояние управления: GET /sessions/$SESSION_ID/control" 200 '"pendingCount"' || return 1
  expect "выдача идёт (пауза снята)" "$(jget paused)" false
}

# ─── 5. Действия курсанта видны преподавателю ─────────────────────────────────────────────────────

# student_status <ddsStatus> <русское название> — статус ДДС + отметка в попытке.
student_status() {
  req POST "/cards/$CARD_ID/status" "{\"ddsStatus\":\"$1\"}"
  check "курсант: статус «$2» ($1)" 200 "\"ddsStatus\":\"$1\"" || return 1
  req POST "/attempts/$ATTEMPT_ID/progress" "{\"status\":{\"ddsStatus\":\"$1\",\"at\":\"$(jget at)\"}}"
  check "курсант: статус «$2» записан в попытку" 200 "\"ddsStatus\":\"$1\""
}

step_student_work() {
  login "$STUDENT_LOGIN" "$STUDENT_PASSWORD" "$STUDENT_ARM" student || return 1
  STUDENT_COOKIE="$SESSION_COOKIE"
  req POST "/cards/$CARD_ID/attempt" "{\"studentId\":\"$STUDENT_ID\",\"issuedAt\":\"$ISSUED_AT\"}"
  check "курсант открыл карточку $CARD_ID (POST /cards/$CARD_ID/attempt)" 201 '"created":true' || return 1
  ATTEMPT_ID="$(jget attempt.id)"
  expect "попытка попала в занятие преподавателя $SESSION_ID" "$(jget sessionId)" "$SESSION_ID"
  student_status accepted "Принята"
  student_status responseStarted "Начало реагирования"
  student_status arrived "Прибытие"
  student_status workInProgress "Проведение работ"
  student_status workDone "Работы завершены"
  req POST "/attempts/$ATTEMPT_ID/progress" \
    "{\"enteredText\":{\"dispatcherAction\":\"Наряд направлен\"},\"completedAt\":\"$(now_iso)\"}"
  check "курсант завершил карточку (completedAt, fullProcessingMs)" 200 '"fullProcessingMs"'
}

step_teacher_sees_work() {
  SESSION_COOKIE="$TEACHER_COOKIE"
  req GET "/sessions/$SESSION_ID/feed"
  check "преподаватель читает ленту занятия после работы курсанта" 200 '"cardOpened"' || return 1
  local counts opened statuses completed
  counts="$(python3 "$WORK_DIR/tools.py" feed-kinds cardOpened statusChanged cardCompleted <"$WORK_DIR/body")"
  read -r opened statuses completed <<<"$counts"
  [ "${opened:-0}" -ge 1 ] && pass "в ленте видно открытие карточки курсантом" ||
    fail "открытие карточки в ленте" "cardOpened: $opened"
  [ "${statuses:-0}" -ge 5 ] && pass "в ленте видны 5 статусов реагирования" ||
    fail "статусы в ленте" "statusChanged: $statuses (ожидалось ≥ 5)"
  [ "${completed:-0}" -ge 1 ] && pass "в ленте видно завершение отработки" ||
    fail "завершение в ленте" "cardCompleted: $completed"
  req GET "/sessions/$SESSION_ID/feed?studentId=$STUDENT_ID"
  check "монитор курсанта: GET /sessions/$SESSION_ID/feed?studentId=$STUDENT_ID" 200 '"cardCompleted"'
  req GET "/attempts/$ATTEMPT_ID/evaluation"
  check "мок-оценка ИИ по попытке курсанта" 200 '"totalScore"'
  local code
  code="$(page "/teacher/monitor/$STUDENT_ID")"
  expect "экран курсанта /teacher/monitor/$STUDENT_ID открыт преподавателю" "$code" 200
}

# ─── 6. Управление занятием: пауза, возобновление, внеочередная выдача (T3.2-11) ──────────────────

step_control() {
  req POST "/sessions/$SESSION_ID/control" '{"action":"pause"}'
  check "пауза выдачи новых карточек" 200 '"paused":true' || return 1
  req POST "/sessions/$SESSION_ID/control" '{"action":"resume"}'
  check "возобновление выдачи" 200 '"paused":false' || return 1
  req GET "/sessions/$SESSION_ID/feed"
  local before after
  before="$(python3 "$WORK_DIR/tools.py" feed-kinds cardIssued <"$WORK_DIR/body")"
  req POST "/sessions/$SESSION_ID/control" "{\"action\":\"issue\",\"studentId\":\"$STUDENT_ID\"}"
  check "внеочередная выдача карточки курсанту" 200 '"session"' || return 1
  req GET "/sessions/$SESSION_ID/feed"
  after="$(python3 "$WORK_DIR/tools.py" feed-kinds cardIssued <"$WORK_DIR/body")"
  [ "${after:-0}" -gt "${before:-0}" ] &&
    pass "внеочередная карточка появилась в ленте ($before → $after выдач)" ||
    fail "внеочередная карточка в ленте" "выдач было $before, стало $after"
  req POST "/sessions/$SESSION_ID/control" "{\"action\":\"issue\",\"studentId\":\"$OTHER_STUDENT_ID\"}"
  check "выдача чужому курсанту → 400 validationFailed" 400 '"validationFailed"'
}

# ─── 7. Завершение занятия и отчёт (T3.2-12) ──────────────────────────────────────────────────────

step_finish() {
  req POST "/sessions/$SESSION_ID/stop"
  check "«Завершить занятие»: POST /sessions/$SESSION_ID/stop" 200 '"state":"finished"' || return 1
  req POST "/sessions/$SESSION_ID/control" "{\"action\":\"issue\",\"studentId\":\"$STUDENT_ID\"}"
  check "после завершения карточку не выдать → 400" 400 '"validationFailed"'
  req POST "/sessions/$SESSION_ID/control" '{"action":"report"}'
  check "«Сформировать отчёт»: finished → reported" 200 '"state":"reported"' || return 1
  req POST "/sessions/$SESSION_ID/control" '{"action":"report"}'
  check "повторный переход в reported → 409 invalidTransition" 409 '"invalidTransition"'
  local code
  code="$(page "/teacher/reports/$SESSION_ID")"
  expect "отчёт занятия /teacher/reports/$SESSION_ID открыт" "$code" 200
}

# ─── 8. Отчёты: журнал, правка оценки, обратная связь (T3.4) ──────────────────────────────────────

step_journal() {
  req GET "/reports/journal?teacherId=$TEACHER_ID"
  check "журнал отчётов: GET /reports/journal?teacherId=$TEACHER_ID" 200 '"rows"' || return 1
  local verdict build_sec
  verdict="$(python3 "$WORK_DIR/tools.py" journal-has-session "$SESSION_ID" <"$WORK_DIR/body")"
  expect "проведённое занятие попало в журнал" "$verdict" ok
  build_sec="$(python3 "$WORK_DIR/tools.py" journal-build-sec "$REPORTED_SESSION" <"$WORK_DIR/body")"
  if [ -n "$build_sec" ] && [ "$build_sec" -le "$REPORT_BUILD_LIMIT" ]; then
    pass "отчёт $REPORTED_SESSION сформирован за $build_sec сек (норматив ≤ $REPORT_BUILD_LIMIT)"
  else
    fail "индикация «сформирован за N сек»" "buildSec=$build_sec при нормативе $REPORT_BUILD_LIMIT"
  fi
}

step_report_and_override() {
  req GET "/reports?sessionId=$REPORTED_SESSION"
  check "отчёт занятия: GET /reports?sessionId=$REPORTED_SESSION" 200 '"groupReport"' || return 1
  SCORE_BEFORE="$(python3 "$WORK_DIR/tools.py" report-score "$STUDENT_ID" <"$WORK_DIR/body")"
  pass "балл курсанта до правки: $SCORE_BEFORE"
  req POST "/attempts/$REPORTED_ATTEMPT/evaluation" \
    "{\"teacherId\":\"$TEACHER_ID\",\"score\":$OVERRIDE_SCORE,\"comment\":\"Пропущено уточнение адреса\"}"
  check "правка оценки преподавателем: POST /attempts/$REPORTED_ATTEMPT/evaluation" 200 '"teacherOverride"' ||
    return 1
  expect "балл преподавателя записан" "$(jget teacherOverride.score)" "$OVERRIDE_SCORE"
  req POST "/attempts/$REPORTED_ATTEMPT/evaluation" "{\"teacherId\":\"$TEACHER_ID\",\"score\":50}"
  check "правка без комментария → 400 validationFailed" 400 '"validationFailed"'
  req GET "/admin/audit?type=grades&perPage=100"
  check "аудит правки оценки: GET /admin/audit" 200 '"evaluation.override"' || return 1
  local details
  details="$(python3 "$WORK_DIR/tools.py" audit-override "$REPORTED_ATTEMPT" <"$WORK_DIR/body")"
  if printf '%s' "$details" | grep -q "стало $OVERRIDE_SCORE"; then
    pass "аудит «было → стало»: $details"
  else
    fail "аудит «было → стало»" "запись: ${details:-нет}"
  fi
  req GET "/reports?sessionId=$REPORTED_SESSION"
  check "отчёт пересчитан после правки" 200 '"reports"' || return 1
  local after
  after="$(python3 "$WORK_DIR/tools.py" report-score "$STUDENT_ID" <"$WORK_DIR/body")"
  [ -n "$after" ] && [ "$after" != "$SCORE_BEFORE" ] &&
    pass "балл курсанта пересчитан по правке преподавателя: $SCORE_BEFORE → $after" ||
    fail "пересчёт балла по правке" "было $SCORE_BEFORE, стало ${after:-нет}"
}

step_feedback() {
  req POST /reports/feedback \
    "{\"reportId\":\"$REPORTED_REPORT\",\"teacherId\":\"$TEACHER_ID\",\"text\":\"Отработайте уточнение адреса\",\"recommendations\":[\"Повторить опросную карту\"]}"
  check "обратная связь курсанту: POST /reports/feedback" 201 '"reportId"'
  req GET "/reports?sessionId=$REPORTED_SESSION"
  check "обратная связь видна преподавателю в отчёте" 200 'Отработайте уточнение адреса'
}

# ─── 9. Обратная связь и изоляция на стороне курсанта ─────────────────────────────────────────────

step_student_sees_feedback() {
  SESSION_COOKIE="$STUDENT_COOKIE"
  req GET "/reports?sessionId=$REPORTED_SESSION"
  check "курсант открывает отчёт своего занятия" 200 '"reports"' || return 1
  local text group
  text="$(python3 "$WORK_DIR/tools.py" report-feedback "$STUDENT_ID" <"$WORK_DIR/body")"
  expect "обратная связь преподавателя видна курсанту в /reports" "$text" "Отработайте уточнение адреса"
  group="$(python3 "$WORK_DIR/tools.py" group-report-is-null <"$WORK_DIR/body")"
  expect "групповой отчёт курсанту не отдан" "$group" ok
  req GET "/reports?studentId=$OTHER_STUDENT_ID"
  check "чужие отчёты курсанту → 403 forbidden" 403 '"forbidden"'
  req GET "/sessions/$SESSION_ID/feed?studentId=$OTHER_STUDENT_ID"
  check "чужая лента курсанту → 403 forbidden" 403 '"forbidden"'
  req GET "/reports/journal?teacherId=$TEACHER_ID"
  check "журнал преподавателя курсанту недоступен → 403" 403 '"forbidden"'
  local code
  code="$(page /teacher)"
  expect "курсант на /teacher → 403" "$code" 403
}

# ─── 10. Ограничения преподавателя: чужое занятие и чужой курсант (T3.3-09) ───────────────────────

step_teacher_limits() {
  SESSION_COOKIE="$TEACHER_COOKIE"
  req POST /sessions \
    "{\"teacherId\":\"$OTHER_TEACHER_ID\",\"studentIds\":[\"$OTHER_STUDENT_ID\"],\"scenarioIds\":[\"$OTHER_SCENARIO\"],\"mode\":\"practice\",\"cardSource\":\"generated\"}"
  check "занятие другого преподавателя создано (подготовка проверки)" 201 '"state":"configured"' || return 1
  FOREIGN_SESSION_ID="$(jget id)"
  req GET "/sessions/$FOREIGN_SESSION_ID/feed"
  check "чужое занятие преподавателю → 403 forbidden" 403 '"forbidden"'
  req GET "/sessions/$SESSION_ID/feed?studentId=$OTHER_STUDENT_ID"
  check "лента своего занятия по чужому курсанту: доступ есть, событий нет" 200 '"events":[]'
  login "$OTHER_TEACHER_LOGIN" "$TEACHER_PASSWORD" "$OTHER_TEACHER_ARM" teacher || return 1
  req GET "/sessions/$SESSION_ID/feed"
  check "другой преподаватель в занятие $SESSION_ID → 403 forbidden" 403 '"forbidden"'
  SESSION_COOKIE="$TEACHER_COOKIE"
}

printf '\n== Сквозной прогон АРМ преподавателя: %s ==\n\n' "$BASE_URL"

if ! curl -sS -o /dev/null --max-time 5 "$API/reference"; then
  printf 'FAIL  сервер недоступен: %s (запустите `npx next start -p 3130`)\n' "$BASE_URL"
  exit 1
fi

step_login_teacher || {
  printf '\nПрогон прерван: без сессии преподавателя остальные шаги не имеют смысла.\n'
  exit 1
}
step_generate || {
  printf '\nПрогон прерван: без сценария нечего вести на занятии.\n'
  exit 1
}
step_edit_scenario
step_correction
step_approve
step_materials_and_profiles
step_scenario_audit
step_wizard || {
  printf '\nПрогон прерван: занятие не запущено.\n'
  exit 1
}
step_feed || {
  printf '\nПрогон прерван: лента занятия пуста.\n'
  exit 1
}
step_student_work
step_teacher_sees_work
step_control
step_finish
step_journal
step_report_and_override
step_feedback
step_student_sees_feedback
step_teacher_limits

printf '\nИтог: PASS %d, FAIL %d (шагов %d)\n' "$PASSED" "$FAILED" "$STEP"
[ "$FAILED" -eq 0 ] || exit 1
