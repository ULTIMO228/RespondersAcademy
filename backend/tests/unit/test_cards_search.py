from app.services.cards_query import card_region, filter_cards, normalize


def _card(**overrides):
    base = {
        "id": "card-1",
        "number": 881412,
        "createdAt": "2026-08-20T11:57:19+03:00",
        "registeredBy": "Опер. 14, АРМ 7, Рожкова О.И.",
        "source": "Служба 112",
        "cardStatus": "completed",
        "phones": {"aon": "+7 (749) 512-34-56", "provided": "", "onSite": ""},
        "applicant": {"name": "Иванов", "status": "очевидец"},
        "address": {"formal": "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58", "okrug": "ЮАО", "raion": "Чертаново Южное", "descriptive": "Дерево во дворе"},
        "what": {"finalType": "Дерево упало во дворе", "klass": "Дерево упало во дворе;", "signs": ["Дерево", "Упало, сломано", "Двор тротуар газон"]},
        "description": "информация принята",
        "workLines": [{"operator": "оп. 3"}],
        "notificationList": [{"serviceId": "svc-upr-chert"}],
    }
    base.update(overrides)
    return base


def test_normalize_and_region():
    assert normalize("  ЁЛКА  Ёж ") == "елка еж"
    assert card_region(_card()) == "Москва"
    assert card_region(_card(address={"formal": "Москва, (ЦАО, Арбат), ул. Арбат, 1"})) == "Москва"


def test_text_and_list_filters():
    cards = [_card(), _card(id="card-2", address={"formal": "Россия, Москва, (САО, Ховрино), Дыбенко, 1", "okrug": "САО", "raion": "Ховрино", "descriptive": ""})]
    assert [c["id"] for c in filter_cards(cards, {"okrugs": ["ЮАО"]})] == ["card-1"]
    assert [c["id"] for c in filter_cards(cards, {"okrugs": ["ЮАО", "САО"]})] == ["card-1", "card-2"]
    assert [c["id"] for c in filter_cards(cards, {"incidentType": "дерево"})] == ["card-1", "card-2"]
    assert filter_cards(cards, {"raion": "ховрино"})[0]["id"] == "card-2"
    assert filter_cards(cards, {"applicant": "512-34"}) and filter_cards(cards, {"applicant": "иванов"})
    assert filter_cards(cards, {"operator": "оп. 3"}) and not filter_cards(cards, {"operator": "оп. 9"})
    assert filter_cards(cards, {"signs": ["упало, сломано"]}) and not filter_cards(cards, {"signs": ["Двор тротуар газон"]})
    assert filter_cards(cards, {"arms": ["7"]}) and not filter_cards(cards, {"arms": ["8"]})
    assert filter_cards(cards, {"channels": ["телефония (АОН)"]}) and not filter_cards(cards, {"channels": ["МЧС"]})
    assert filter_cards(cards, {"cardNumber": "8814"}) and not filter_cards(cards, {"cardNumber": "999"})
    assert filter_cards(cards, {"createdFrom": "2026-08-20T00:00:00+03:00", "createdTo": "2026-08-21T00:00:00+03:00"})
    assert not filter_cards(cards, {"createdTo": "2026-08-19T00:00:00+03:00"})
    assert filter_cards(cards, {"services": ["svc-upr-chert"]}) and filter_cards(cards, {"cardStatuses": ["completed"]})
    assert filter_cards(cards, {"okrugs": [""], "incidentType": " "}) == cards


async def test_cards_endpoint_contract(client):
    page = await client.get("/cards", params={"page": 1, "perPage": 10, "sort": "-createdAt"})
    assert page.status_code == 200
    body = page.json()
    assert set(body) == {"items", "total", "page", "perPage"} and body["total"] == 108 and len(body["items"]) == 10
    dates = [item["createdAt"] for item in body["items"]]
    assert dates == sorted(dates, reverse=True)
    training = await client.get("/cards", params={"dataset": "training", "perPage": 100})
    assert training.json()["total"] == 96 and training.json()["items"][0]["id"] == "c-001"
    assert training.json()["items"][0]["cardStatus"] == "registered" and training.json()["items"][0]["number"] == 1
    fixtures = await client.get("/cards", params={"dataset": "fixtures"})
    assert fixtures.json()["total"] == 12 and fixtures.json()["items"][0]["id"] == "card-881412"
    yuao = await client.get("/cards", params=[("okrug", "ЮАО"), ("cardStatus", "registered")])
    assert yuao.status_code == 200
    assert (await client.get("/cards", params={"status": "nope"})).status_code == 400
    assert (await client.get("/cards", params={"perPage": 500})).status_code == 400
    assert (await client.get("/cards", params={"view": "wrong"})).status_code == 400
    assert (await client.get("/cards", params={"sort": "name"})).status_code == 400
    assert (await client.get("/cards", params={"createdFrom": "yesterday"})).status_code == 400
    beyond = await client.get("/cards", params={"page": 99})
    assert beyond.json()["items"] == [] and beyond.json()["total"] == 108


async def test_card_details(client):
    fixture = await client.get("/cards/card-881412")
    assert fixture.status_code == 200 and fixture.json()["kind"] == "fixture"
    assert set(fixture.json()["runtime"]) == {"statusEvents", "workLines", "reminders", "sms"}
    training = await client.get("/cards/c-001")
    assert training.json()["kind"] == "training" and training.json()["resolvedFixtureId"].startswith("card-")
    assert training.json()["card"]["expectedTags"] == ["на улице", "мусор", "открытое пламя"]
    assert (await client.get("/cards/nope")).status_code == 404
