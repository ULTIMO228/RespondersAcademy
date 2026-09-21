from app.services.time import ms_to_iso, now_iso, parse_iso_ms


async def test_error_format_not_found(client):
    response = await client.get("/no-such-endpoint")
    assert response.status_code == 404


async def test_time_helpers():
    assert now_iso().endswith("+03:00") and "." not in now_iso()
    ms = parse_iso_ms("2026-09-16T10:02:00+03:00")
    assert ms_to_iso(ms) == "2026-09-16T10:02:00+03:00"
    assert parse_iso_ms("2026-09-16T07:02:00Z") == ms
