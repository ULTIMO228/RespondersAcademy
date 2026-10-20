"""Правило профиля режима обучаемого (spec/008)."""

from __future__ import annotations

from app.models.user import User
from app.services import training_profile


def _user(profile: str | None, name: str = "Иванов Сергей Петрович", user_id: str = "u-005") -> User:
    return User(id=user_id, login=user_id, password_hash="", full_name=name, role="student", arm_number=1,
                training_profile=profile)


def test_allows_without_profile_both_modes() -> None:
    user = _user(None)
    assert training_profile.allows(user, "dds")
    assert training_profile.allows(user, "operator112")


def test_allows_only_own_mode() -> None:
    user = _user("operator112")
    assert training_profile.allows(user, "operator112")
    assert not training_profile.allows(user, "dds")
    assert training_profile.allows(_user("dds"), "dds")
    assert not training_profile.allows(_user("dds"), "operator112")


def test_chain_is_not_restricted() -> None:
    assert training_profile.allows(_user("operator112"), "chain")


def test_blocked_message() -> None:
    assert training_profile.blocked_message(_user("operator112"), "dds") == (
        "Задание режима ДДС недоступно для учётной записи специалиста-112"
    )
    assert training_profile.blocked_message(_user("dds"), "operator112") == (
        "Задание режима 112 недоступно для учётной записи диспетчера ДДС"
    )


def test_create_rejection_lists_short_names() -> None:
    blocked = [_user("operator112"), _user("operator112", "Петрова Анна Дмитриевна", "u-006")]
    assert training_profile.create_rejection(blocked, "dds") == (
        "Задание режима ДДС нельзя назначить: профиль специалиста-112 — Иванов С. П., Петрова А. Д."
    )


def test_create_rejection_for_session() -> None:
    assert training_profile.create_rejection([_user("operator112")], "dds", "Занятие").startswith(
        "Занятие режима ДДС нельзя назначить: профиль специалиста-112"
    )


def test_split_keeps_order() -> None:
    first, second, third = _user(None, user_id="a"), _user("operator112", user_id="b"), _user("dds", user_id="c")
    allowed, blocked = training_profile.split_by_profile([first, second, third], "dds")
    assert [u.id for u in allowed] == ["a", "c"]
    assert [u.id for u in blocked] == ["b"]


def test_profile_title() -> None:
    assert training_profile.profile_title("operator112") == "Специалист системы-112"
    assert training_profile.profile_title(None) == "Не задан"


def test_old_sqlite_users_table_gets_training_profile() -> None:
    """Старая SQLite-база без колонки (create_all её не добавит): init_db догоняет и переводит ivanov в специалисты-112."""
    from sqlalchemy import create_engine

    from app.db.session import _add_missing_sqlite_columns

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT, service TEXT)")
        connection.exec_driver_sql("INSERT INTO users VALUES ('u-005', 'ivanov', 'ДДС района Чертаново Южное'), "
                                   "('u-006', 'petrova', 'ДДС района Чертаново Южное')")
        _add_missing_sqlite_columns(connection)
        _add_missing_sqlite_columns(connection)  # повторный запуск ничего не меняет
        rows = dict((row[0], row[1:]) for row in connection.exec_driver_sql(
            "SELECT login, service, training_profile FROM users"))
    assert rows["ivanov"] == ("ЦОВ системы-112", "operator112")
    assert rows["petrova"] == ("ДДС района Чертаново Южное", None)
