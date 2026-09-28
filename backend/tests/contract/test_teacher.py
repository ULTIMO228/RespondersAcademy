"""US5: профильные категории, мастер и управление занятием."""

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.teacher import ProfileMappingRow
from app.models.user import User
from app.services.time import parse_iso_ms
from tests.conftest import login_as, token_for


async def test_mapping_contract_and_atomic_save(client):
    original = (await client.get('/profile-mapping')).json()
    assert len(original) == 6
    async with get_sessionmaker()() as db:
        users = (await db.execute(select(User).where(User.role == 'student'))).scalars().all()
        for row in original:
            assert row['studentCount'] == sum(u.service == row['profile'] for u in users)
    body = {'savedBy': 'u-002', 'rows': [{'id': original[0]['id'], 'incidentGroups': []}]}
    await login_as(client, 'student')
    assert (await client.put('/profile-mapping', json=body)).status_code == 403
    await login_as(client, 'teacher')
    invalid = {**body, 'rows': [*body['rows'], {'id': 'missing', 'incidentGroups': []}]}
    assert (await client.put('/profile-mapping', json=invalid)).status_code == 404
    assert (await client.get('/profile-mapping')).json() == original
    invalid = {**body, 'rows': [{'id': original[0]['id'], 'incidentGroups': ['unknown']}]}
    assert (await client.put('/profile-mapping', json=invalid)).status_code == 400
    try:
        saved = await client.put('/profile-mapping', json=body)
        assert saved.status_code == 200, saved.text
        assert saved.json()[0]['incidentGroups'] == []
        async with get_sessionmaker()() as db:
            row = await db.get(ProfileMappingRow, original[0]['id'])
            assert row.updated_by == 'u-002' and row.updated_at
            entries = (await db.execute(select(AuditLog).where(AuditLog.action == 'profileMapping.save'))).scalars().all()
            assert entries[-1].user_id == 'u-002' and original[0]['id'] in entries[-1].details
    finally:
        restored = await client.put('/profile-mapping', json={'savedBy': 'u-002', 'rows': [{'id': r['id'], 'incidentGroups': r['incidentGroups']} for r in original]})
        assert restored.status_code == 200


async def test_users_for_teacher(client):
    await login_as(client, 'student')
    assert (await client.get('/users')).status_code == 403
    await login_as(client, 'teacher')
    response = await client.get('/users', params={'role': 'student', 'group': 'ДДС-01'})
    assert response.status_code == 200 and response.json()
    assert all(u['role'] == 'student' and u['group'] == 'ДДС-01' and 'password' not in u for u in response.json())


async def test_teacher_plan_and_control(client):
    await login_as(client, 'teacher')
    # Обручевский: отсутствие classifierName должно сохранить демо c-095/c-096.
    async with get_sessionmaker()() as db:
        student = (await db.execute(select(User).where(User.service == 'ДДС района Обручевский', User.role == 'student'))).scalars().first()
        student_id = student.id
        from app.models.scenario import Scenario
        scenarios = (await db.execute(select(Scenario))).scalars().all()
        scenario = next(s for s in scenarios if 'c-095' in s.card_ids and s.validation_status == 'approved')
        scenario_id = scenario.id
    plan = {'categories': ['Дорожно-транспортные происшествия с пострадавшими', 'Провода электрические'], 'issueOrder': 'manual', 'hints': True, 'timeNorms': {'primaryReactionSec': 30, 'fullProcessingSec': 180}, 'maxGrammarErrors': 1, 'paceSec': 60, 'conveyor': True}
    created = await client.post('/sessions', json={'teacherId': 'u-002', 'studentIds': [student_id], 'scenarioIds': [scenario_id], 'mode': 'practice', 'cardSource': 'generated', 'plan': plan})
    assert created.status_code == 201, created.text
    sid = created.json()['id']
    try:
        started = await client.post(f'/sessions/{sid}/start')
        assert started.status_code == 200
        flow = started.json()['cardFlow']
        assert flow and {f['cardId'] for f in flow} == {'c-095', 'c-096'}
        assert [f['cardId'] for f in flow[:2]] == ['c-095', 'c-096']
        assert parse_iso_ms(flow[1]['issuedAt']) - parse_iso_ms(flow[0]['issuedAt']) == 60000
        control = (await client.get(f'/sessions/{sid}/control')).json()
        assert control['plan'] == plan and not control['paused']
        paused = (await client.post(f'/sessions/{sid}/control', json={'action': 'pause'})).json()
        assert paused['paused'] and paused['pendingCount'] == len(flow) - 1
        resumed = (await client.post(f'/sessions/{sid}/control', json={'action': 'resume'})).json()
        assert not resumed['paused'] and len(resumed['session']['cardFlow']) == len(flow)
        issued = await client.post(f'/sessions/{sid}/control', json={'action': 'issue', 'studentId': student_id})
        assert issued.status_code == 200
        assert len(issued.json()['session']['cardFlow']) == len(flow) + 1
        assert issued.json()['session']['cardFlow'][-1]['cardId'] in {'c-095', 'c-096'}
        client.cookies.clear()
        client.headers['Authorization'] = f'Bearer {await token_for("u-003")}'
        assert (await client.get(f'/sessions/{sid}/control')).status_code == 403
        assert (await client.post(f'/sessions/{sid}/control', json={'action': 'pause'})).status_code == 403
        client.headers.pop('Authorization')
        await login_as(client, 'student')
        assert (await client.get(f'/sessions/{sid}/control')).status_code == 403
        assert (await client.post(f'/sessions/{sid}/control', json={'action': 'pause'})).status_code == 403
    finally:
        client.headers.pop('Authorization', None)
        await login_as(client, 'teacher')
        await client.post(f'/sessions/{sid}/stop')
