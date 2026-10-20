"""Правило профиля режима обучаемого (spec/008) поверх специализаций (фича 007, единая модель спеки 021)."""

from __future__ import annotations

from app.models.user import User
from app.services import training_profile

BOTH = ["operator112", "dds"]


def _user(specializations: list[str] | None, name: str = "Иванов Сергей Петрович", user_id: str = "u-005",
          role: str = "student") -> User:
    return User(id=user_id, login=user_id, password_hash="", full_name=name, role=role, arm_number=1,
                specializations=specializations)


def test_allows_with_both_specializations_both_modes() -> None:
    user = _user(BOTH)
    assert training_profile.allows(user, "dds")
    assert training_profile.allows(user, "operator112")
    assert training_profile.profile_of(user) is None


def test_allows_only_own_mode() -> None:
    user = _user(["operator112"])
    assert training_profile.allows(user, "operator112")
    assert not training_profile.allows(user, "dds")
    assert training_profile.allows(_user(["dds"]), "dds")
    assert not training_profile.allows(_user(["dds"]), "operator112")
    assert training_profile.profile_of(user) == "operator112"


def test_student_without_field_is_dds_like_migration_0007() -> None:
    legacy = _user(None)
    assert training_profile.allows(legacy, "dds")
    assert not training_profile.allows(legacy, "operator112")
    assert training_profile.profile_of(legacy) == "dds"


def test_staff_is_not_restricted() -> None:
    teacher = _user(None, role="teacher")
    assert training_profile.allows(teacher, "dds") and training_profile.allows(teacher, "operator112")
    assert training_profile.profile_of(teacher) is None


def test_chain_is_not_restricted() -> None:
    assert training_profile.allows(_user(["operator112"]), "chain")


def test_blocked_message() -> None:
    assert training_profile.blocked_message(_user(["operator112"]), "dds") == (
        "Задание режима ДДС недоступно для учётной записи специалиста-112"
    )
    assert training_profile.blocked_message(_user(["dds"]), "operator112") == (
        "Задание режима 112 недоступно для учётной записи диспетчера ДДС"
    )


def test_create_rejection_lists_short_names() -> None:
    blocked = [_user(["operator112"]), _user(["operator112"], "Петрова Анна Дмитриевна", "u-006")]
    assert training_profile.create_rejection(blocked, "dds") == (
        "Задание режима ДДС нельзя назначить: профиль специалиста-112 — Иванов С. П., Петрова А. Д."
    )


def test_create_rejection_for_session() -> None:
    assert training_profile.create_rejection([_user(["operator112"])], "dds", "Занятие").startswith(
        "Занятие режима ДДС нельзя назначить: профиль специалиста-112"
    )


def test_split_keeps_order() -> None:
    first, second, third = _user(BOTH, user_id="a"), _user(["operator112"], user_id="b"), _user(["dds"], user_id="c")
    allowed, blocked = training_profile.split_by_profile([first, second, third], "dds")
    assert [u.id for u in allowed] == ["a", "c"]
    assert [u.id for u in blocked] == ["b"]


def test_old_sqlite_users_table_gets_specializations() -> None:
    """Старая SQLite-база без колонки (create_all её не добавит): init_db догоняет как 0007 + 0012."""
    from sqlalchemy import create_engine

    from app.db.session import _add_missing_sqlite_columns

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT, role TEXT, service TEXT)")
        connection.exec_driver_sql("INSERT INTO users VALUES ('u-005', 'ivanov', 'student', 'ДДС района Чертаново Южное'), "
                                   "('u-006', 'petrova', 'student', 'ДДС района Чертаново Южное'), "
                                   "('u-002', 'morozova', 'teacher', NULL)")
        _add_missing_sqlite_columns(connection)
        _add_missing_sqlite_columns(connection)  # повторный запуск ничего не меняет
        rows = dict((row[0], row[1:]) for row in connection.exec_driver_sql(
            "SELECT login, service, specializations FROM users"))
    assert rows["ivanov"] == ("ЦОВ системы-112", '["operator112"]')
    assert rows["petrova"] == ("ДДС района Чертаново Южное", '["dds"]')
    assert rows["morozova"] == (None, None)


def test_old_sqlite_table_with_training_profile_moves_it_to_specializations() -> None:
    """База SASHA (spec/008) с колонкой `training_profile`: профиль переносится в список, «не задан» — «оператор ДДС»."""
    from sqlalchemy import create_engine

    from app.db.session import _add_missing_sqlite_columns

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT, role TEXT, service TEXT, "
                                   "training_profile VARCHAR(16))")
        connection.exec_driver_sql("INSERT INTO users VALUES ('u-005', 'ivanov', 'student', 'ЦОВ системы-112', 'operator112'), "
                                   "('u-010', 'egorov', 'student', 'ДДС района Обручевский', 'dds'), "
                                   "('u-006', 'petrova', 'student', 'ДДС района Чертаново Южное', NULL)")
        _add_missing_sqlite_columns(connection)
        rows = dict(connection.exec_driver_sql("SELECT login, specializations FROM users").fetchall())
    assert rows == {"ivanov": '["operator112"]', "egorov": '["dds"]', "petrova": '["dds"]'}
