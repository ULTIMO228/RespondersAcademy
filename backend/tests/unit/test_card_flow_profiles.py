from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.models.classifier import ClassifierEntry
from app.models.reference import ReferenceEntry
from app.models.system import SystemLog
from app.models.teacher import ProfileMappingRow
from app.models.user import User
from app.seed.load import seed_profile_mapping
from app.services.session_engine import filter_cards_for_student


async def test_profile_reaction_categories_and_fallback(seeded_db):
    async with get_sessionmaker()() as db:
        user = await db.get(User, 'u-005')
        user.service = 'test-profile'
        db.add(ProfileMappingRow(id='test-profile', profile='test-profile', incident_groups=['allowed', 'none', 'unrelated'], service_ids=['test-service']))
        services = await db.get(ReferenceEntry, 'services')
        services.value = [*services.value, {'id': 'test-service', 'classifierName': 'Test reaction'}]
        for index, (group, mode, name) in enumerate([('allowed', 'mapped', 'Test reaction'), ('none', 'none', 'Test reaction'), ('unrelated', 'card112', 'Other')]):
            db.add(ClassifierEntry(code=f'test-{index}', group=group, final_type=group, notifications=[{'service': name, 'mode': mode}]))
        await db.flush()
        pool = [{'cardId': g, 'group': g} for g in ['allowed', 'none', 'unrelated', 'outside']]
        assert await filter_cards_for_student(db, pool, user.id, []) == pool[:1]
        # Строгое пересечение пусто → мягкий фолбэк на категории профиля с WARN в системных журналах (уточнение T054).
        assert await filter_cards_for_student(db, pool, user.id, ['none']) == pool[1:2]
        warning = (await db.execute(select(SystemLog).where(SystemLog.level == 'WARN').order_by(SystemLog.id.desc()))).scalars().first()
        assert warning and 'u-005' in warning.message and 'none' in warning.message
        assert await filter_cards_for_student(db, pool, user.id, ['outside']) == []
        assert await filter_cards_for_student(db, pool, user.id, ['none'], 'operator112') == pool[1:2]
        mapping = await db.get(ProfileMappingRow, 'test-profile')
        mapping.service_ids = ['unmapped-district']
        await db.flush()
        assert await filter_cards_for_student(db, pool, user.id, []) == pool[:3]
        mapping.incident_groups = []
        await db.flush()
        assert await filter_cards_for_student(db, pool, user.id, []) == []
        await db.rollback()


async def test_profile_seed_idempotent(seeded_db):
    async with get_sessionmaker()() as db:
        assert await seed_profile_mapping(db) == 6
        await db.flush()
        assert await seed_profile_mapping(db) == 6
        await db.flush()
        assert (await db.execute(select(func.count()).select_from(ProfileMappingRow))).scalar_one() == 6
        await db.rollback()
