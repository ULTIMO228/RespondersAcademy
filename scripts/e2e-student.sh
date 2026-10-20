#!/usr/bin/env bash
# Сквозной прогон АРМ обучающегося по HTTP (замена Playwright — браузерных зависимостей в проекте нет).
# Работает против ТОЛЬКО ЧТО запущенного сервера: `npx next start -p 3130`, затем `scripts/e2e-student.sh`.
# Мок-стор живёт в памяти процесса и накапливает состояние, поэтому перед повторным прогоном сервер перезапускать.
# Печатает PASS/FAIL по шагам; код возврата 0 — все шаги прошли.
#
# Покрытие (гейты T2.2/T2.3/T2.4/T2.5):
#   вход → журнал → старт модуля «Билет 05» → лента занятия → открытие карточки (попытка)
#   → цепочка статусов Принята … Работы завершены (+409 вне графа, +400 «Не принята» без комментария)
#   → вызов софтфона в попытку → оценка попытки → попытка видна в /sessions и /reports → чужие данные 403.
# Режим 112 (спека 009, T051; только при подключённом бэкенде, иначе блок пропускается с SKIP):
#   учитель создаёт задание → журнал ученика (200, учителю 403) → вызов «×» (callHidden) → строка в очереди
#   → «Принять» → события карточки (fieldChanged, typeAdded, linkAdded) → отправка: пустой адрес 400, filled + канал,
#   повтор 409; СМС-билет c-066 (канал sms, текст обращения) → отправка; нет контакта (outcome noContact) → 200.
set -uo pipefail

# Скрипт читает mocks/*.json — работаем от корня репозитория независимо от места запуска.
cd "$(dirname "$0")/.." || exit 1

BASE_URL="${BASE_URL:-http://127.0.0.1:3130}"
API="$BASE_URL/api/mock"
# spec/008: ivanov — специалист-112, занятие ДДС проходит petrova; «чужой» курсант — ivanov (у него есть попытки в сидах).
LOGIN="${E2E_LOGIN:-petrova}"
PASSWORD="${E2E_PASSWORD:-student112}"
ARM_NUMBER="${E2E_ARM:-2}"
TWO_FACTOR="${E2E_2FA:-123456}"
SCENARIO_ID="${E2E_SCENARIO:-s-005}" # «Билет 05: пожар-окно 9 эт. + отравление + стройка»
TEACHER_ID="${E2E_TEACHER:-u-002}"
OTHER_STUDENT_ID="${E2E_OTHER_STUDENT:-u-005}"
PHONE_NUMBER="${E2E_PHONE:-301}" # Руководитель дежурной смены ДДС
# Режим 112 (T051): специалист-112 — ivanov (АРМ 1, u-005), учитель — morozova (АРМ 21); пароли — как в сидах.
OPERATOR_STUDENT="${E2E_112_STUDENT:-ivanov}"
OPERATOR_STUDENT_ID="${E2E_112_STUDENT_ID:-u-005}"
OPERATOR_STUDENT_ARM="${E2E_112_ARM:-1}"
OPERATOR_TEACHER="${E2E_112_TEACHER:-morozova}"
OPERATOR_TEACHER_ARM="${E2E_112_TEACHER_ARM:-21}"
TEACHER_PASSWORD="${E2E_TEACHER_PASSWORD:-teacher112}"

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
  if [ -n "$needle" ] && ! grep -q -- "$needle" "$WORK_DIR/body"; then
    fail "$title" "в ответе нет «$needle»: $(head -c 300 "$WORK_DIR/body")"
    return 1
  fi
  pass "$title"
  return 0
}

# req <METHOD> <путь от /api/mock> [<тело JSON>] — с cookie сессии, если она уже получена.
# Путь `/api/v1/…` (режим 112, бэкенд) идёт на BASE_URL напрямую: rewrite фронта отдаёт его бэкенду.
req() {
  local method="$1" path="$2" body="${3:-}"
  local url="$API$path"
  case "$path" in /api/v1/*) url="$BASE_URL$path" ;; esac
  local args=(-sS -o "$WORK_DIR/body" -D "$WORK_DIR/headers" -w '%{http_code}' -X "$method" "$url")
  [ -n "${SESSION_COOKIE:-}" ] && args+=(-H "Cookie: arm112_session=$SESSION_COOKIE")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  HTTP_CODE="$(curl "${args[@]}" 2>"$WORK_DIR/curl-err")" || HTTP_CODE="000"
  [ "$HTTP_CODE" = "000" ] && cp "$WORK_DIR/curl-err" "$WORK_DIR/body"
  return 0
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


def feed_issued_at() -> None:
    """issuedAt первой выданной карточки студента из ленты занятия."""
    feed = json.load(sys.stdin)
    for event in feed.get("events", []):
        if event.get("kind") == "cardIssued" and event.get("studentId") == sys.argv[2]:
            print(f"{event['cardId']} {event['at']}")
            return
    print("")


def other_attempt() -> None:
    """id попытки другого курсанта (для проверки 403). На вход — статика занятий: свои выдачи чужих попыток не содержат."""
    sessions = json.load(sys.stdin)
    for session in sessions:
        for event in session.get("cardEvents", []):
            if event.get("studentId") == sys.argv[2]:
                print(event["id"])
                return
    print("")


def attempt_in_sessions() -> None:
    """ok, если попытка attemptId видна студенту в его занятиях; печатает primaryReactionMs и число статусов."""
    sessions = json.load(sys.stdin)
    for session in sessions:
        for event in session.get("cardEvents", []):
            if event.get("id") == sys.argv[2]:
                print(f"ok {event.get('primaryReactionMs')} {len(event.get('statuses', []))} "
                      f"{len(event.get('calls', []))} {event.get('completedAt') or '-'}")
                return
    print("")


def own_reports() -> None:
    """ok, если все отчёты — свои и групповой отчёт не отдан (изоляция T2.5-01)."""
    payload = json.load(sys.stdin)
    alien = [r for r in payload.get("reports", []) if r["student"]["studentId"] != sys.argv[2]]
    print("ok" if not alien and payload.get("groupReport") is None else "bad")


globals()[sys.argv[1].replace("-", "_")]()
PY

# Черновик карточки 112 (CardDraft, camelCase) для POST …/submit: draft112 <исход> <канал> <адрес 1|0>.
# Содержимое — как у билета c-010 в тестах бэкенда (_draft_for_c010); при адрес 0 адресного блока нет (400).
cat >"$WORK_DIR/draft112.py" <<'PY'
import json
import sys

outcome, channel, with_address = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
address = {
    "formal": "Россия, Москва, улица Грина, дом неизвестен, библиотека № 19",
    "street": "ул. Грина",
    "house": "",
    "source": "directory",
    "descriptive": "в доме библиотека № 19",
} if with_address else {}
draft = {
    "applicant": {"name": "Сидорова Анна Викторовна", "status": "очевидец"},
    "phones": {"aon": "+7 (916) 126-34-71", "provided": "+7 (916) 126-34-71", "onSite": ""},
    "address": address,
    "what": {
        "pollAnswers": "Пожар, горит балкон и окна на 13 этаже",
        "signs": ["жилой дом", "балкон", "открытое пламя"],
        "finalType": "",
        "classifierCode": "1050201",
        "casualties": {"injured": False, "ambulanceRefused": False, "blocked": False},
    },
    "description": "Со слов заявителя: горит балкон и два окна на 13-м этаже, открытое пламя, наблюдают с улицы.",
    "emergency": {"chs": False, "chp": False},
    "notificationList": [],
    "channel": channel,
    "outcome": outcome,
}
print(json.dumps(draft, ensure_ascii=False))
PY

step_login() {
  req POST /auth/login "{\"login\":\"$LOGIN\",\"password\":\"$PASSWORD\",\"armNumber\":$ARM_NUMBER}"
  check "вход $LOGIN / АРМ $ARM_NUMBER / 2FA $TWO_FACTOR" 200 '"role":"student"' || return 1
  STUDENT_ID="$(jget userId)"
  SESSION_COOKIE="$(session_cookie_from_headers)"
  [ -n "$STUDENT_ID" ] && [ -n "$SESSION_COOKIE" ] || {
    fail "cookie сессии arm112_session" "пустая сессия"
    return 1
  }
  pass "cookie сессии arm112_session для $STUDENT_ID"
}

step_journal() {
  req GET "/cards?page=1&perPage=10&sort=-createdAt"
  check "журнал: GET /cards (страница 1, 10 записей)" 200 '"total"' || return 1
  local total
  total="$(jget total)"
  [ "${total:-0}" -gt 0 ] || {
    fail "журнал непуст" "total=$total"
    return 1
  }
  pass "журнал непуст (total=$total)"
}

step_session() {
  req POST /sessions "{\"teacherId\":\"$TEACHER_ID\",\"studentIds\":[\"$STUDENT_ID\"],\"scenarioIds\":[\"$SCENARIO_ID\"],\"mode\":\"practice\",\"cardSource\":\"generated\"}"
  check "старт модуля: POST /sessions («Билет 05» = $SCENARIO_ID)" 201 '"state":"configured"' || return 1
  SESSION_ID="$(jget id)"
  req POST "/sessions/$SESSION_ID/start"
  check "занятие $SESSION_ID переведено в running" 200 '"state":"running"' || return 1
  req POST "/sessions/$SESSION_ID/start"
  check "повторный start вне графа → 409 invalidTransition" 409 '"invalidTransition"'
}

step_feed() {
  req GET "/sessions/$SESSION_ID/feed"
  check "лента занятия: GET /sessions/$SESSION_ID/feed" 200 '"events"' || return 1
  local issued
  issued="$(python3 "$WORK_DIR/tools.py" feed-issued-at "$STUDENT_ID" <"$WORK_DIR/body")"
  [ -n "$issued" ] || {
    fail "в ленте есть выдача карточки (cardIssued)" "событий выдачи нет"
    return 1
  }
  CARD_ID="${issued%% *}"
  ISSUED_AT="${issued#* }"
  pass "лента выдала карточку $CARD_ID (issuedAt=$ISSUED_AT)"
}

step_open_card() {
  req POST "/cards/$CARD_ID/attempt" "{\"studentId\":\"$STUDENT_ID\",\"issuedAt\":\"$ISSUED_AT\"}"
  check "открытие карточки $CARD_ID: POST /cards/$CARD_ID/attempt" 201 '"created":true' || return 1
  ATTEMPT_ID="$(jget attempt.id)"
  local reaction opened
  reaction="$(jget attempt.primaryReactionMs)"
  opened="$(jget attempt.openedAt)"
  [ -n "$ATTEMPT_ID" ] && [ -n "$opened" ] || {
    fail "попытка несёт openedAt и id" "$(head -c 200 "$WORK_DIR/body")"
    return 1
  }
  pass "попытка $ATTEMPT_ID: openedAt=$opened, primaryReactionMs=$reaction (норматив 30 с)"
  req POST "/cards/$CARD_ID/attempt" "{\"studentId\":\"$STUDENT_ID\",\"issuedAt\":\"$ISSUED_AT\"}"
  check "повторное открытие идемпотентно (created:false, та же попытка)" 200 "\"id\":\"$ATTEMPT_ID\""
}

# Первичная реакция дольше 30 с фиксируется как нарушение норматива: issuedAt на 45 с раньше открытия.
step_reaction_violation() {
  local late_card late_issued
  late_card="$(python3 -c "
import json,sys
scenario=[s for s in json.load(open('mocks/scenarios.json'))['scenarios'] if s['id']=='$SCENARIO_ID'][0]
print(scenario['cardIds'][-1])" 2>/dev/null)"
  [ -n "$late_card" ] || late_card="c-015"
  late_issued="$(python3 -c "
import datetime
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
print((now-datetime.timedelta(seconds=45)).isoformat(timespec='seconds'))")"
  req POST "/cards/$late_card/attempt" "{\"studentId\":\"$STUDENT_ID\",\"issuedAt\":\"$late_issued\"}"
  check "нарушение норматива 30 с: открытие $late_card через 45 с" 201 '"primaryReactionMs"' || return 1
  local reaction
  reaction="$(jget attempt.primaryReactionMs)"
  if [ "${reaction:-0}" -gt 30000 ]; then
    pass "primaryReactionMs=$reaction > 30000 — нарушение зафиксировано в попытке"
  else
    fail "primaryReactionMs > 30000" "получено $reaction"
  fi
}

# status <ddsStatus> <русское название> [<комментарий>]
status_step() {
  local dds="$1" title="$2" comment="${3:-}"
  local payload="{\"ddsStatus\":\"$dds\""
  [ -n "$comment" ] && payload="$payload,\"comment\":\"$comment\""
  payload="$payload}"
  req POST "/cards/$CARD_ID/status" "$payload"
  check "статус «$title» ($dds)" 200 "\"ddsStatus\":\"$dds\"" || return 1
  req POST "/attempts/$ATTEMPT_ID/progress" "{\"status\":{\"ddsStatus\":\"$dds\",\"at\":\"$(jget at)\"}}"
  check "статус «$title» записан в попытку $ATTEMPT_ID" 200 "\"ddsStatus\":\"$dds\""
}

step_status_chain() {
  req POST "/cards/$CARD_ID/status" '{"ddsStatus":"notAccepted"}'
  check "«Не принята» без комментария → 400 validationFailed" 400 '"validationFailed"'

  status_step accepted "Принята"

  req POST "/cards/$CARD_ID/status" '{"ddsStatus":"arrived"}'
  check "нарушение порядка (Принята → Прибытие) → 409 invalidTransition" 409 '"invalidTransition"'

  status_step responseStarted "Начало реагирования"
  status_step arrived "Прибытие"
  status_step workInProgress "Проведение работ"
  status_step workDone "Работы завершены"

  req POST "/attempts/$ATTEMPT_ID/progress" "{\"enteredText\":{\"dispatcherAction\":\"Наряд направлен\"},\"completedAt\":\"$(python3 -c "
import datetime
print(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds'))")\"}"
  check "завершение попытки (completedAt, fullProcessingMs)" 200 '"fullProcessingMs"'
}

step_call() {
  local started ended
  started="$(python3 -c "
import datetime
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
print((now-datetime.timedelta(seconds=20)).isoformat(timespec='seconds'))")"
  ended="$(python3 -c "
import datetime
print(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds'))")"
  req POST /calls/reply "{\"toNumber\":\"$PHONE_NUMBER\",\"turn\":\"answer\"}"
  check "софтфон: реплика ИИ-абонента $PHONE_NUMBER (POST /calls/reply)" 200 '"origin":"ai"'
  req POST "/cards/$CARD_ID/calls" "{\"studentId\":\"$STUDENT_ID\",\"toNumber\":\"$PHONE_NUMBER\",\"startedAt\":\"$started\",\"endedAt\":\"$ended\",\"transcript\":[{\"speaker\":\"dispatcher\",\"text\":\"Вызов по карточке $CARD_ID\",\"at\":\"$started\"},{\"speaker\":\"ai\",\"text\":\"Принято\",\"at\":\"$ended\"}]}"
  check "вызов записан в попытку (POST /cards/$CARD_ID/calls)" 201 "\"attemptId\":\"$ATTEMPT_ID\""
}

step_evaluation() {
  req GET "/attempts/$ATTEMPT_ID/evaluation"
  check "оценка попытки: GET /attempts/$ATTEMPT_ID/evaluation" 200 '"totalScore"'
}

step_visible_in_sessions() {
  req GET "/sessions?studentId=$STUDENT_ID"
  check "занятия студента: GET /sessions?studentId=$STUDENT_ID" 200 "$SESSION_ID" || return 1
  local found
  found="$(python3 "$WORK_DIR/tools.py" attempt-in-sessions "$ATTEMPT_ID" <"$WORK_DIR/body")"
  if [ -n "$found" ]; then
    pass "попытка $ATTEMPT_ID видна в /sessions (реакция/статусы/вызовы/завершение: ${found#ok })"
  else
    fail "попытка видна в /sessions" "попытки $ATTEMPT_ID в выдаче нет"
  fi
  ALIEN_ATTEMPT_ID="$(python3 -c "import json,sys;json.dump(json.load(open('mocks/sessions.json'))['sessions'],sys.stdout)" | python3 "$WORK_DIR/tools.py" other-attempt "$OTHER_STUDENT_ID")"
}

step_reports() {
  req GET "/reports?studentId=$STUDENT_ID"
  check "отчёты студента: GET /reports?studentId=$STUDENT_ID" 200 '"reports"' || return 1
  local verdict
  verdict="$(python3 "$WORK_DIR/tools.py" own-reports "$STUDENT_ID" <"$WORK_DIR/body")"
  if [ "$verdict" = "ok" ]; then
    pass "в /reports только свои отчёты, групповой отчёт не отдан (groupReport: null)"
  else
    fail "изоляция /reports" "в выдаче чужие отчёты или групповой отчёт"
  fi
}

step_isolation() {
  req GET "/reports?studentId=$OTHER_STUDENT_ID"
  check "чужие отчёты: GET /reports?studentId=$OTHER_STUDENT_ID → 403" 403 '"forbidden"'
  req GET "/sessions?studentId=$OTHER_STUDENT_ID"
  check "чужие занятия: GET /sessions?studentId=$OTHER_STUDENT_ID → 403" 403 '"forbidden"'
  if [ -n "${ALIEN_ATTEMPT_ID:-}" ]; then
    req GET "/attempts/$ALIEN_ATTEMPT_ID/evaluation"
    check "чужая попытка: GET /attempts/$ALIEN_ATTEMPT_ID/evaluation → 403" 403 '"forbidden"'
  else
    # Чужие попытки не видны в выдаче студента — берём id из статики занятий.
    ALIEN_ATTEMPT_ID="$(python3 -c "
import json
for session in json.load(open('mocks/sessions.json'))['sessions']:
    for event in session['cardEvents']:
        if event['studentId'] != '$STUDENT_ID':
            print(event['id'])
            raise SystemExit" 2>/dev/null)"
    if [ -n "$ALIEN_ATTEMPT_ID" ]; then
      req GET "/attempts/$ALIEN_ATTEMPT_ID/evaluation"
      check "чужая попытка: GET /attempts/$ALIEN_ATTEMPT_ID/evaluation → 403" 403 '"forbidden"'
    else
      fail "чужая попытка → 403" "в моках нет попытки другого курсанта"
    fi
  fi
}

step_guards() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/arm/progress")"
  [ "$code" = "307" ] && pass "гвард: аноним на /arm/progress → 307 /login" ||
    fail "гвард анонима" "получен HTTP $code"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: arm112_session=$SESSION_COOKIE" "$BASE_URL/teacher")"
  [ "$code" = "403" ] && pass "гвард: студент на /teacher → 403" || fail "гвард чужой роли" "получен HTTP $code"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: arm112_session=$SESSION_COOKIE" "$BASE_URL/arm")"
  [ "$code" = "200" ] && pass "студент открывает /arm (200)" || fail "студент открывает /arm" "HTTP $code"
}

# login_as <логин> <пароль> <номер АРМ> — меняет cookie сессии (SESSION_COOKIE) для дальнейших запросов.
login_as() {
  req POST /auth/login "{\"login\":\"$1\",\"password\":\"$2\",\"armNumber\":$3}"
  check "вход $1 / АРМ $3" 200 '"role"' || return 1
  SESSION_COOKIE="$(session_cookie_from_headers)"
  [ -n "$SESSION_COOKIE" ] || {
    fail "cookie сессии $1" "пустая сессия"
    return 1
  }
}

# expect_body <описание> <подстрока> — проверка тела последнего ответа без проверки кода (для части ответа).
expect_body() {
  if grep -qF -- "$2" "$WORK_DIR/body"; then
    pass "$1"
  else
    fail "$1" "в ответе нет «$2»: $(head -c 300 "$WORK_DIR/body")"
  fi
}

# Режим 112 (спека 009, T051): HTTP /api/v1 через rewrite фронта. Без бэкенда /api/v1 отвечает 404 без тела — блок пропускается.
step_112() {
  local probe
  probe="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/operator112/journal?assignmentId=asg-none")"
  if [ "$probe" = "404" ]; then
    printf 'SKIP  режим 112: %s/api/v1 не отвечает (нужен бэкенд: backend/scripts/run_frontend_e2e.sh --only student)\n' "$BASE_URL"
    return 0
  fi

  login_as "$OPERATOR_TEACHER" "$TEACHER_PASSWORD" "$OPERATOR_TEACHER_ARM" || return 1
  req POST /api/v1/assignments "{\"studentIds\":[\"$OPERATOR_STUDENT_ID\"],\"trainingMode\":\"operator112\",\"format\":\"training\",\"cardIds\":[\"c-010\",\"c-066\"],\"title\":\"E2E 009 · режим 112\"}"
  check "учитель: задание 112 для $OPERATOR_STUDENT (POST /assignments)" 201 '"id"' || return 1
  local assignment_112
  assignment_112="$(jget id)"
  req GET "/api/v1/operator112/journal?assignmentId=$assignment_112"
  check "журнал 112 учителю → 403 forbidden (журнал — у обучающегося)" 403 '"forbidden"'

  login_as "$OPERATOR_STUDENT" "$PASSWORD" "$OPERATOR_STUDENT_ARM" || return 1
  req GET "/api/v1/operator112/journal?assignmentId=$assignment_112"
  check "журнал ученика-112: GET /operator112/journal?assignmentId= → 200" 200 '"rows"' || return 1
  req GET /api/v1/operator112/journal
  check "журнал без assignmentId → 400 validationFailed" 400 '"validationFailed"'

  # Вызов c-010: окно «Входящий звонок» закрыто «×» (callHidden) → строка в очереди → «Принять».
  req POST /api/v1/operator112/attempts "{\"assignmentId\":\"$assignment_112\",\"cardId\":\"c-010\"}"
  check "поступление вызова c-010: POST /operator112/attempts → 201, состояние ringing" 201 '"state":"ringing"' || return 1
  local call_id
  call_id="$(jget id)"
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"fieldChanged","payload":{"field":"applicant.name","value":"Сидорова"}}'
  check "правка до «Принять» → 409 invalidTransition (сначала примите вызов)" 409 '"invalidTransition"'
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"callHidden"}'
  check "«×» на окне вызова: событие callHidden → 201" 201 '"callHidden"' || return 1
  req GET "/api/v1/operator112/journal?assignmentId=$assignment_112"
  check "закрытый вызов — строка журнала в очереди (queued)" 200 '"queued":true'
  req POST "/api/v1/operator112/attempts/$call_id/answer"
  check "«Принять»: POST /operator112/attempts/{id}/answer → answered" 200 '"state":"answered"' || return 1

  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"fieldChanged","payload":{"value":"Сидорова"}}'
  check "fieldChanged без payload.field → 400 validationFailed" 400 '"validationFailed"'
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"fieldChanged","payload":{"field":"applicant.name","value":"Сидорова Анна Викторовна"}}'
  check "правка заявителя: fieldChanged → 201" 201 '"fieldChanged"' || return 1
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"typeAdded","payload":{"finalType":"Пожар в жилом доме","classifierCode":"1050201"}}'
  check "вкладка «Происшествие»: typeAdded → 201" 201 '"typeAdded"'
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"linkAdded","payload":{"cardId":"card-881412"}}'
  check "связь с карточкой журнала (card-881412): linkAdded → 201" 201 '"linkAdded"'
  req POST "/api/v1/operator112/attempts/$call_id/events" '{"type":"linkAdded","payload":{"cardId":"card-000000"}}'
  check "связь с карточкой вне журнала → 400 validationFailed" 400 '"validationFailed"'

  # Отправка: без адресного блока — 400; с адресом и каналом call — 200; повтор — 409.
  req POST "/api/v1/operator112/attempts/$call_id/submit" "$(python3 "$WORK_DIR/draft112.py" filled call 0)"
  check "отправка без адресного блока → 400 validationFailed" 400 '"validationFailed"'
  req POST "/api/v1/operator112/attempts/$call_id/submit" "$(python3 "$WORK_DIR/draft112.py" filled call 1)"
  check "отправка карточки c-010 (outcome filled, канал call) → 200 с evaluationId" 200 '"evaluationId"' || return 1
  req POST "/api/v1/operator112/attempts/$call_id/submit" "$(python3 "$WORK_DIR/draft112.py" filled call 1)"
  check "повторная отправка → 409 invalidTransition" 409 '"invalidTransition"'
  req GET "/api/v1/operator112/attempts/$call_id/evaluation"
  check "оценка 112: GET /operator112/attempts/{id}/evaluation" 200 '"totalScore"'
  req GET "/api/v1/operator112/journal?assignmentId=$assignment_112"
  check "журнал: отправленная карточка ученика отмечена isOwn" 200 '"isOwn":true'

  # СМС-билет c-066: канал sms и текст обращения приходят из билета (спека 009, T031).
  req POST /api/v1/operator112/attempts "{\"assignmentId\":\"$assignment_112\",\"cardId\":\"c-066\"}"
  check "СМС-билет c-066: POST /operator112/attempts → 201, канал sms" 201 '"channel":"sms"' || return 1
  local sms_id
  sms_id="$(jget id)"
  expect_body "СМС-билет: текст обращения smsText в попытке" '"smsText":"Знакомый хочет повеситься'
  req POST "/api/v1/operator112/attempts/$sms_id/answer"
  check "СМС: «Принять» → answered, канал sms сохраняется" 200 '"channel":"sms"' || return 1
  req POST "/api/v1/operator112/attempts/$sms_id/submit" "$(python3 "$WORK_DIR/draft112.py" filled sms 0)"
  check "СМС: отправка без адресного блока → 400 validationFailed" 400 '"validationFailed"'
  req POST "/api/v1/operator112/attempts/$sms_id/submit" "$(python3 "$WORK_DIR/draft112.py" filled sms 1)"
  check "СМС: отправка карточки с каналом sms → 200" 200 '"evaluationId"' || return 1

  # Исход «нет контакта»: карточка сохраняется пустой, адрес и тип не обязательны (FR-017).
  req POST /api/v1/operator112/attempts "{\"assignmentId\":\"$assignment_112\",\"cardId\":\"c-010\"}"
  check "повторный вызов c-010 в тренировке: новая попытка → 201" 201 '"state":"ringing"' || return 1
  local nc_id
  nc_id="$(jget id)"
  req POST "/api/v1/operator112/attempts/$nc_id/answer"
  check "повторный вызов принят → answered" 200 '"state":"answered"' || return 1
  req POST "/api/v1/operator112/attempts/$nc_id/submit" "$(python3 "$WORK_DIR/draft112.py" noContact call 0)"
  check "исход «нет контакта» (noContact) без адреса → 200" 200 '"evaluationId"'
}

printf '\n== Сквозной прогон АРМ обучающегося: %s ==\n\n' "$BASE_URL"

if ! curl -sS -o /dev/null --max-time 5 "$API/reference"; then
  printf 'FAIL  сервер недоступен: %s (запустите `npx next start -p 3130`)\n' "$BASE_URL"
  exit 1
fi

step_login || {
  printf '\nПрогон прерван: без сессии остальные шаги не имеют смысла.\n'
  exit 1
}
step_journal
step_session
step_feed
step_open_card
step_reaction_violation
step_status_chain
step_call
step_evaluation
step_visible_in_sessions
step_reports
step_isolation
step_guards
step_112

printf '\nИтог: PASS %d, FAIL %d (шагов %d)\n' "$PASSED" "$FAILED" "$STEP"
[ "$FAILED" -eq 0 ] || exit 1
