#!/usr/bin/env python3
# Валидация моков spec/mocks под пересобранные схемы (пересборка 2026-09-17 по hack/Фронт/МОКИ-ДАННЫЕ.md):
# JSON-синтаксис, форматы id, перекрёстные ссылки, доменные правила.
# Запуск из корня репо: python3 spec/mocks/_tools/validate_mocks.py  (exit 0 = PASS, exit 1 = FAIL)
import json, os, re, sys
from datetime import datetime

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
errors, warnings, summary = [], [], []

def err(f, msg): errors.append(f'{f}: {msg}')
def warn(f, msg): warnings.append(f'{f}: {msg}')

def load(name):
    try:
        with open(os.path.join(BASE, name), encoding='utf-8') as fh:
            return json.load(fh)
    except Exception as e:
        err(name, f'ошибка JSON: {e}')
        return None

def ts(s):
    return datetime.fromisoformat(s).timestamp()

# ---------- загрузка ----------
users = load('users.json'); ref = load('reference.json'); cards = load('cards.json')
scn = load('scenarios.json'); ses = load('sessions.json'); rep = load('reports.json')
clf = load('classifier.json'); fx = load('fixtures/arm-cards.json')
if errors:
    print('ОШИБКИ ЗАГРУЗКИ:'); [print(' -', e) for e in errors]
    print('FAIL'); sys.exit(1)

# ---------- users.json ----------
F = 'users.json'
us = users.get('users', [])
uids = set()
for u in us:
    uid = u.get('id', '?')
    if not re.fullmatch(r'u-\d{3}', uid): err(F, f'id {uid!r} не формата u-XXX')
    if uid in uids: err(F, f'дубликат id {uid}')
    uids.add(uid)
    if u.get('role') not in ('admin', 'teacher', 'student'): err(F, f'{uid}: недопустимая role {u.get("role")!r}')
    if not isinstance(u.get('armNumber'), int) or isinstance(u.get('armNumber'), bool):
        err(F, f'{uid}: armNumber не число')
    if not isinstance(u.get('isActive'), bool): err(F, f'{uid}: isActive не boolean')
    if u.get('role') != 'student' and ('group' in u or 'service' in u):
        err(F, f'{uid}: group/service у не-student')
arms = [u.get('armNumber') for u in us if isinstance(u.get('armNumber'), int)]
if len(arms) != len(set(arms)): err(F, 'armNumber не уникальны')
inactive = [u['id'] for u in us if u.get('isActive') is False]
if len(inactive) != 1: err(F, f'isActive=false ровно один, фактически: {len(inactive)} {inactive}')
summary.append(f'{F}: {len(us)} пользователей, неактивен {inactive}')

# ---------- classifier.json (нужен reference.json и cards.json) ----------
F = 'classifier.json'
entries = clf.get('entries', [])
REQ = ('code', 'group', 'sign1', 'sign2', 'sign3', 'finalType', 'mainService', 'notifications')
MODES = ('card112', 'integration', 'none', 'mapped')
codes = set()
for e in entries:
    code = e.get('code', '?')
    if code in codes: err(F, f'дубликат code {code}')
    codes.add(code)
    for k in REQ:
        if k not in e: err(F, f'{code}: нет обязательного поля {k}')
    if 'responseScenario' in e: err(F, f'{code}: присутствует запрещённое поле responseScenario')
    for n in e.get('notifications', []):
        if n.get('mode') not in MODES: err(F, f'{code}: недопустимый mode {n.get("mode")!r}')
meta = clf.get('meta', {})
groups = {e.get('group') for e in entries}
if meta.get('rowCount') != len(entries):
    err(F, f'meta.rowCount={meta.get("rowCount")} != фактически {len(entries)}')
if meta.get('groupCount') != len(groups):
    err(F, f'meta.groupCount={meta.get("groupCount")} != фактически {len(groups)}')
summary.append(f'{F}: {len(entries)} записей, {len(groups)} групп')

# ---------- reference.json ----------
F = 'reference.json'
for k in ('ddsStatuses', 'serviceStatuses', 'callerStatuses', 'channels', 'services',
          'incidentGroups', 'classifierRows', 'cardStatuses', 'districts', 'sources', 'internalNumbers'):
    if k not in ref: err(F, f'нет ключа {k}')
dds = ref.get('ddsStatuses', [])
dstat = {s.get('status') for s in dds}
if not {'accepted', 'notAccepted'} <= dstat:
    err(F, f'первичный выбор accepted|notAccepted не полон: {sorted(dstat)}')
for s in dds:
    if s.get('status') in ('notAccepted', 'workRefused') and s.get('requiresComment') is not True:
        err(F, f'{s.get("status")}: requiresComment должен быть true')
    for nxt in s.get('next', []):
        if nxt not in dstat: err(F, f'{s.get("status")}: next -> несуществующий статус {nxt!r}')
# граф next согласован: из accepted достижимы все непервичные статусы
reach, queue = {'accepted'}, ['accepted']
while queue:
    cur = queue.pop()
    for s in dds:
        if s.get('status') == cur:
            for nxt in s.get('next', []):
                if nxt not in reach: reach.add(nxt); queue.append(nxt)
orphans = dstat - reach - {'notAccepted'}
if orphans: err(F, f'статусы недостижимы из accepted: {sorted(orphans)}')
if len(ref.get('callerStatuses', [])) != 6: err(F, f'callerStatuses != 6 ({len(ref.get("callerStatuses", []))})')
if len(ref.get('channels', [])) != 9: err(F, f'channels != 9 ({len(ref.get("channels", []))})')
svcs = ref.get('services', [])
svcids = set()
for s in svcs:
    sid = s.get('id', '?')
    if sid in svcids: err(F, f'дубликат service id {sid}')
    svcids.add(sid)
    if s.get('kind') not in ('arm112', 'vis', 'phoneOnly'): err(F, f'{sid}: недопустимый kind {s.get("kind")!r}')
ig = ref.get('incidentGroups', [])
if len(ig) != 105: err(F, f'incidentGroups != 105 ({len(ig)})')
if set(ig) != groups: err(F, 'incidentGroups не совпадают с множеством group из classifier.json')
inums = {n.get('number') for n in ref.get('internalNumbers', [])}
if not {'101', '102', '103', '104', '301', '302'} <= inums:
    err(F, f'internalNumbers не содержит 101–104 и 301/302: {sorted(inums)}')
summary.append(f'{F}: 7 нормативных + 4 расширения, служб {len(svcs)}, групп {len(ig)}')

# ---------- cards.json ----------
F = 'cards.json'
cs = cards.get('cards', [])
cstat = set(ref.get('callerStatuses', []))
if len(cs) != 96: err(F, f'карточек != 96 ({len(cs)})')
ids = [c.get('id') for c in cs]
if ids != [f'c-{i:03d}' for i in range(1, 97)]:
    err(F, 'id не c-001..c-096 по порядку (или дубликаты)')
cids = set(ids)
pairs = [(c.get('ticketNo'), c.get('situationNo')) for c in cs]
full = {(t, s) for t in range(1, 33) for s in range(1, 4)}
if set(pairs) != full or len(set(pairs)) != 96:
    err(F, f'покрытие билетов 1..32 × 1..3 нарушено: нет {sorted(full - set(pairs))}, лишние {sorted(set(pairs) - full)}')
for c in cs:
    cid = c.get('id', '?')
    st = c.get('caller', {}).get('status') if isinstance(c.get('caller'), dict) else None
    if st and st not in cstat: err(F, f'{cid}: caller.status {st!r} не из callerStatuses')
    if not isinstance(c.get('group'), str) or not c['group'].strip():
        err(F, f'{cid}: group не непустая строка')
    elif c['group'] not in set(ig):
        warn(F, f'{cid}: группа {c["group"]!r} отсутствует в incidentGroups')
    if not isinstance(c.get('expectedServices'), list) or not c['expectedServices']:
        err(F, f'{cid}: expectedServices пуст')
    if not isinstance(c.get('expectedTags'), list) or not c['expectedTags']:
        err(F, f'{cid}: expectedTags пуст')
    if 'duplicateOf' in c and c['duplicateOf'] not in cids:
        err(F, f'{cid}: duplicateOf -> несуществующая карточка {c["duplicateOf"]!r}')
    for b in ('noAmbulance', 'crossRegion'):
        if b in c and not isinstance(c[b], bool): err(F, f'{cid}: {b} не boolean')
summary.append(f'{F}: {len(cs)} карточек, билеты 1–32 покрыты')

# ---------- scenarios.json ----------
F = 'scenarios.json'
ss = scn.get('scenarios', [])
if len(ss) != 36: err(F, f'сценариев != 36 ({len(ss)})')
sids_list = [s.get('id') for s in ss]
if sids_list != [f's-{i:03d}' for i in range(1, 37)]:
    err(F, 'id не s-001..s-036 по порядку (или дубликаты)')
scnids = set(sids_list)
for s in ss:
    sid = s.get('id', '?')
    if s.get('level') not in ('beginner', 'advanced'): err(F, f'{sid}: недопустимый level {s.get("level")!r}')
    if not isinstance(s.get('sourceTicketNo'), int) or not 1 <= s['sourceTicketNo'] <= 32:
        err(F, f'{sid}: sourceTicketNo вне 1..32: {s.get("sourceTicketNo")!r}')
    for cid in s.get('cardIds', []):
        if cid not in cids: err(F, f'{sid}: неизвестная карточка {cid}')
    tn = s.get('timeNorms', {})
    if tn.get('primaryReactionSec') != 30 or tn.get('fullProcessingSec') != 180:
        err(F, f'{sid}: timeNorms != {{30, 180}}: {tn}')
    if not isinstance(s.get('hints', {}).get('enabled'), bool): err(F, f'{sid}: hints.enabled не boolean')
    v = s.get('validation', {})
    if v.get('status') not in ('draft', 'pending', 'approved', 'rejected'):
        err(F, f'{sid}: недопустимый validation.status {v.get("status")!r}')
    if v.get('reviewedBy') and v['reviewedBy'] not in uids:
        err(F, f'{sid}: неизвестный проверяющий {v["reviewedBy"]}')
summary.append(f'{F}: {len(ss)} сценариев')

# ---------- sessions.json ----------
F = 'sessions.json'
STATES = ('draft', 'configured', 'running', 'finished', 'reported')
SEV = ('critical', 'major', 'minor')
GR = ('spelling', 'syntax')
for s in ses.get('sessions', []):
    sid = s.get('id', '?')
    if s.get('state') not in STATES: err(F, f'{sid}: недопустимый state {s.get("state")!r}')
    if s.get('teacherId') not in uids: err(F, f'{sid}: неизвестный преподаватель {s.get("teacherId")!r}')
    for x in s.get('studentIds', []):
        if x not in uids: err(F, f'{sid}: неизвестный курсант {x}')
    for x in s.get('scenarioIds', []):
        if x not in scnids: err(F, f'{sid}: неизвестный сценарий {x}')
    for fl in s.get('cardFlow', []):
        if fl.get('cardId') not in cids: err(F, f'{sid}: cardFlow — неизвестная карточка {fl.get("cardId")}')
        if fl.get('studentId') not in uids: err(F, f'{sid}: cardFlow — неизвестный курсант {fl.get("studentId")}')
    for ev in s.get('cardEvents', []):
        eid = ev.get('id', '?')
        if ev.get('cardId') not in cids: err(F, f'{sid}/{eid}: неизвестная карточка {ev.get("cardId")}')
        if ev.get('studentId') not in uids: err(F, f'{sid}/{eid}: неизвестный курсант {ev.get("studentId")}')
        flows = [fl for fl in s.get('cardFlow', [])
                 if fl.get('cardId') == ev.get('cardId') and fl.get('studentId') == ev.get('studentId')]
        if not flows:
            err(F, f'{sid}/{eid}: нет соответствующей записи в cardFlow')
        else:
            deltas = [abs(ev.get('primaryReactionMs', 0) - round((ts(ev['openedAt']) - ts(fl['issuedAt'])) * 1000))
                      for fl in flows]
            if min(deltas) > 1000:
                err(F, f'{sid}/{eid}: primaryReactionMs != openedAt−issuedAt (расхождение {min(deltas)} мс)')
        if 'completedAt' in ev and 'openedAt' in ev:
            full = round((ts(ev['completedAt']) - ts(ev['openedAt'])) * 1000)
            if ev.get('fullProcessingMs') != full:
                err(F, f'{sid}/{eid}: fullProcessingMs={ev.get("fullProcessingMs")} != {full}')
        for st in ev.get('statuses', []):
            if st.get('ddsStatus') not in dstat: err(F, f'{sid}/{eid}: недопустимый ddsStatus {st.get("ddsStatus")!r}')
            if st.get('ddsStatus') in ('notAccepted', 'workRefused') and not st.get('comment'):
                err(F, f'{sid}/{eid}: {st.get("ddsStatus")} без обязательного comment')
            if 'dutyNumber' in st and not isinstance(st['dutyNumber'], str):
                err(F, f'{sid}/{eid}: dutyNumber не строка')
        evl = ev.get('evaluation', {})
        for e2 in evl.get('errors', []):
            if e2.get('severity') not in SEV: err(F, f'{sid}/{eid}: недопустимый severity {e2.get("severity")!r}')
        for g in evl.get('grammarErrors', []):
            if g.get('type') not in GR: err(F, f'{sid}/{eid}: недопустимый тип grammarErrors {g.get("type")!r}')
summary.append(f'{F}: {len(ses.get("sessions", []))} занятий, '
               f'{sum(len(s.get("cardEvents", [])) for s in ses.get("sessions", []))} cardEvents')

# ---------- reports.json ----------
F = 'reports.json'
sesids = {s.get('id') for s in ses.get('sessions', [])}
for r in rep.get('reports', []):
    rid = r.get('id', '?')
    if r.get('sessionId') not in sesids: err(F, f'{rid}: неизвестное занятие {r.get("sessionId")!r}')
    if r.get('student', {}).get('studentId') not in uids:
        err(F, f'{rid}: неизвестный курсант {r.get("student", {}).get("studentId")!r}')
    for m in r.get('timeMetrics', []):
        if m.get('deviationMs') != m.get('factMs', 0) - m.get('normMs', 0):
            err(F, f'{rid}: deviationMs != factMs−normMs ({m})')
    for k in ('byStage', 'byErrorType', 'dynamics'):
        if k not in r.get('charts', {}): err(F, f'{rid}: в charts нет ключа {k}')
if not rep.get('groupReport'): err(F, 'groupReport отсутствует')
summary.append(f'{F}: {len(rep.get("reports", []))} отчётов + groupReport')

# ---------- fixtures/arm-cards.json ----------
F = 'fixtures/arm-cards.json'
fxc = fx.get('cards', [])
n_lists = 0
for c in fxc:
    for n in c.get('notificationList', []):
        n_lists += 1
        if n.get('serviceId') not in svcids:
            err(F, f'{c.get("id", "?")}: неизвестная служба {n.get("serviceId")!r}')
summary.append(f'{F}: {len(fxc)} карточек, {n_lists} записей notificationList')

# ---------- итог ----------
print('СВОДКА:')
for line in summary: print('  ', line)
if warnings:
    print(f'\nПРЕДУПРЕЖДЕНИЯ ({len(warnings)}):')
    for w in warnings: print('  ~', w)
if errors:
    print(f'\nОШИБКИ ({len(errors)}):')
    for e in errors: print('  -', e)
    print('\nFAIL')
    sys.exit(1)
print(f'\nPASS — все проверки пройдены ({len(summary)} файлов, предупреждений: {len(warnings)}).')
