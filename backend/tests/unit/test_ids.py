from app.db.ids import format_id, group_report_id, max_suffix, report_id


def test_max_suffix_and_format():
    assert max_suffix(["att-01", "att-06", "ses-100", "x"], "att") == 6
    assert max_suffix([], "u") == 0
    assert format_id("att", 7) == "att-007"
    assert format_id("u", 25) == "u-025"


def test_report_ids():
    assert report_id("ses-042", "u-005") == "rep-042-u-005"
    assert group_report_id("ses-2026-09-16-01") == "rep-2026-09-16-01-group"
