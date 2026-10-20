"""Строка ЕКП по признакам: точное совпадение признака и группы важнее нечёткого (ДТП с/без пострадавших)."""

from ml.classify.notification_list import find_entry_by_signs

ENTRIES = [
    {"code": "2010000", "group": "Дорожно-транспортные происшествия без пострадавших", "sign1": "ДТП", "finalType": "ДТП без пострадавших"},
    {"code": "2020000", "group": "Дорожно-транспортные происшествия с пострадавшими", "sign1": "ДТП пострадавшие", "finalType": "ДТП с пострадавшими"},
    {"code": "2020100", "group": "Дорожно-транспортные происшествия с пострадавшими", "sign1": "ДТП пострадавшие", "sign2": "Наезд на пешехода", "finalType": "ДТП наезд на пешехода"},
]


def test_exact_sign_beats_token_subset() -> None:
    assert find_entry_by_signs(ENTRIES, ["ДТП пострадавшие"])["code"] == "2020000"
    assert find_entry_by_signs(ENTRIES, ["ДТП"])["code"] == "2010000"


def test_exact_group_is_not_mixed_with_similar_one() -> None:
    entry = find_entry_by_signs(ENTRIES, ["ДТП"], "Дорожно-транспортные происшествия с пострадавшими")
    assert entry is not None and entry["group"].endswith("с пострадавшими")


def test_second_sign_refines_row() -> None:
    assert find_entry_by_signs(ENTRIES, ["ДТП пострадавшие", "Наезд на пешехода"])["code"] == "2020100"


def test_build_tabs_merges_services_without_duplicates() -> None:
    from ml.classify.notification_list import build_tabs

    entries = [
        {"code": "1", "group": "Пожар", "sign1": "дом", "finalType": "Пожар", "notifications": [{"service": "101", "mode": "card112"}, {"service": "112", "mode": "card112"}]},
        {"code": "2", "group": "Газ", "sign1": "запах", "finalType": "Газ", "notifications": [{"service": "112", "mode": "card112"}, {"service": "104", "mode": "card112"}]},
    ]
    reference = {"services": [{"id": "svc-101", "name": "Служба 101", "classifierName": "101"}, {"id": "svc-104", "name": "Служба 104", "classifierName": "104"}, {"id": "svc-112", "name": "Служба 112", "classifierName": "112"}]}
    tabs = [{"group": "Пожар", "signs": ["дом"]}, {"group": "Газ", "signs": ["запах"]}]
    result = build_tabs(entries, reference, tabs=tabs, manual=[{"serviceId": "svc-104"}, {"serviceId": "svc-103"}])
    ids = result.service_ids
    assert len(ids) == len(set(ids))
    assert ids.index("svc-101") < ids.index("svc-104") and ids[-1] == "svc-103"
    assert result.classifier_code == "1"


def test_single_row_group_resolves_without_signs() -> None:
    from ml.classify.notification_list import build

    entries = [{"code": "15040000", "group": "Граждане с оружием", "sign1": "Граждане с оружием", "finalType": "Граждане с оружием", "notifications": [{"service": "102", "mode": "card112"}]}]
    reference = {"services": [{"id": "svc-102", "name": "Служба 102", "classifierName": "102"}]}
    result = build(entries, reference, signs=[], group="Граждане с оружием")
    assert result.classifier_code == "15040000" and result.service_ids == ["svc-102"]


def test_multi_row_group_without_signs_lists_common_services() -> None:
    from ml.classify.notification_list import build, build_tabs

    entries = [
        {"code": "1", "group": "Пожар", "sign1": "дом", "finalType": "Пожар в доме", "notifications": [{"service": "101", "mode": "card112"}, {"service": "103", "mode": "card112"}]},
        {"code": "2", "group": "Пожар", "sign1": "трава", "finalType": "Пожар травы", "notifications": [{"service": "101", "mode": "card112"}]},
    ]
    reference = {"services": [{"id": "svc-101", "name": "Служба 101", "classifierName": "101"}, {"id": "svc-103", "name": "Служба 103", "classifierName": "103"}]}
    result = build(entries, reference, signs=[], group="Пожар")
    assert result.service_ids == ["svc-101"]
    assert [s.service_id for s in result.conditional] == ["svc-103"]
    tabs = build_tabs(entries, reference, tabs=[{"group": "Газ", "signs": []}, {"group": "Пожар", "signs": []}])
    assert tabs.service_ids == ["svc-101"]
