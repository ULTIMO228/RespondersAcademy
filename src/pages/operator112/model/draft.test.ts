import { describe, expect, it } from "vitest";

import type { CardDraftWhat, NotificationListItem, OperatorEvent, OperatorEventKind } from "@/shared/api";

import { EMPTY_FORM, mergeNotificationList, restoreForm, toCardDraft } from "./draft";
import type { DraftForm } from "./draft";

const AT = "2026-09-29T10:00:00+03:00";
let sequence = 0;

function event(type: OperatorEventKind, payload: Record<string, unknown> = {}): OperatorEvent {
  sequence += 1;
  return { id: `ev-${sequence}`, type, at: AT, payload };
}

function field(name: string, value: unknown): OperatorEvent {
  return event("fieldChanged", { field: name, value });
}

function service(serviceId: string, addedBy: NotificationListItem["addedBy"] = "auto"): NotificationListItem {
  return { serviceId, addedBy, title: serviceId };
}

function what(finalType: string): CardDraftWhat {
  return {
    pollAnswers: "",
    signs: [],
    flags: [],
    finalType,
    classifierCode: "",
    casualties: { injured: false, ambulanceRefused: false, blocked: false },
  };
}

/** Форма с переопределениями; адрес копируется, чтобы тесты не меняли общий EMPTY_FORM. */
function form(overrides: Partial<DraftForm> = {}): DraftForm {
  return { ...EMPTY_FORM, address: { ...EMPTY_FORM.address }, ...overrides };
}

describe("значения по умолчанию", () => {
  it("адрес: страна «Россия», субъект и город «Москва»; улицы нет", () => {
    expect(EMPTY_FORM.address).toMatchObject({ country: "Россия", subject: "Москва", locality: "Москва" });
    expect(EMPTY_FORM.address.street).toBe("");
    expect(restoreForm([]).address).toMatchObject({ country: "Россия", subject: "Москва", locality: "Москва" });
  });

  it("новые поля: одна вкладка, связей нет, исход «заполнена», канал «звонок»", () => {
    expect(EMPTY_FORM).toMatchObject({ extraIncidents: [], links: [], outcome: "filled", channel: "call" });
  });
});

describe("toCardDraft", () => {
  it("одна вкладка: what = incidents[0], канал, исход и связи переданы", () => {
    const draft = toCardDraft(
      form({ finalType: "Пожар", classifierCode: "3-1", signs: ["дым"] }),
      "9161263471",
    );
    expect(draft.incidents).toHaveLength(1);
    expect(draft.what).toBe(draft.incidents?.[0]);
    expect(draft.what).toMatchObject({ finalType: "Пожар", classifierCode: "3-1", signs: ["дым"] });
    expect(draft.phones.aon).toBe("9161263471");
    expect(draft.channel).toBe("call");
    expect(draft.outcome).toBe("filled");
    expect(draft.links).toEqual([]);
  });

  it("дополнительные вкладки идут после первой по порядку; what остаётся первой", () => {
    const draft = toCardDraft(
      form({
        finalType: "Пожар",
        extraIncidents: [{ what: what("ДТП"), notifications: [] }],
      }),
      "9161263471",
    );
    expect(draft.incidents?.map((item) => item.finalType)).toEqual(["Пожар", "ДТП"]);
    expect(draft.what.finalType).toBe("Пожар");
  });

  it("служба из нескольких вкладок попадает в notificationList один раз", () => {
    const draft = toCardDraft(
      form({
        notifications: [service("s-01", "auto"), service("s-02", "manual")],
        extraIncidents: [
          { what: what("ДТП"), notifications: [service("s-01", "auto"), service("s-03", "manual")] },
        ],
      }),
      "9161263471",
    );
    expect(draft.notificationList).toEqual([
      { serviceId: "s-01", addedBy: "auto" },
      { serviceId: "s-02", addedBy: "manual" },
      { serviceId: "s-03", addedBy: "manual" },
    ]);
  });

  it("исход «нет контакта» и связи уходят в карточку как есть", () => {
    const links = [{ cardId: "c-010", primary: true }];
    const draft = toCardDraft(form({ outcome: "noContact", links, channel: "sms" }), "9161263471");
    expect(draft.outcome).toBe("noContact");
    expect(draft.links).toEqual(links);
    expect(draft.channel).toBe("sms");
  });
});

describe("mergeNotificationList", () => {
  it("дубли по serviceId убираются, порядок — первый встреченный", () => {
    const merged = mergeNotificationList([
      [service("s-02", "manual"), service("s-01", "auto")],
      [service("s-01", "auto"), service("s-03", "manual")],
    ]);
    expect(merged.map((item) => item.serviceId)).toEqual(["s-02", "s-01", "s-03"]);
  });

  it("auto побеждает manual: службу, которую требует хоть одна вкладка, нельзя удалить", () => {
    expect(mergeNotificationList([[service("s-1", "manual")], [service("s-1", "auto")]])).toEqual([
      { serviceId: "s-1", addedBy: "auto" },
    ]);
  });

  it("пустой набор списков → пустой список", () => {
    expect(mergeNotificationList([])).toEqual([]);
  });
});

describe("восстановление из событий", () => {
  it("старый формат: события без новых типов и полей дают значения по умолчанию", () => {
    const restored = restoreForm([
      field("applicant.name", "Иван"),
      field("description", "Горит балкон"),
      event("signSelected", { signs: ["дым"] }),
    ]);
    expect(restored).toMatchObject({
      applicantName: "Иван",
      description: "Горит балкон",
      signs: ["дым"],
      links: [],
      extraIncidents: [],
      outcome: "filled",
      channel: "call",
    });
    expect(restored.address).toMatchObject({ country: "Россия", subject: "Москва", locality: "Москва" });
    expect(toCardDraft(restored, "9161263471").incidents).toHaveLength(1);
  });

  it("адресные поля: улица, объект, корпус, страна и координаты (число)", () => {
    const restored = restoreForm([
      field("address.street", "Тверская"),
      field("address.object", "ТЦ Атриум"),
      field("address.korpus", "2"),
      field("address.country", "Россия"),
      field("address.lat", 55.76),
      field("address.lon", 37.6),
    ]);
    expect(restored.address).toMatchObject({
      street: "Тверская",
      object: "ТЦ Атриум",
      korpus: "2",
      country: "Россия",
      lat: 55.76,
      lon: 37.6,
      formal: "Москва, Тверская",
    });
  });

  it("координата не число не восстанавливается", () => {
    expect(restoreForm([field("address.lat", "55")]).address.lat).toBeUndefined();
  });

  it("вкладки: typeAdded добавляет дополнительную вкладку, typeRemoved с index 1 её удаляет, index 0 не трогает первую", () => {
    const restored = restoreForm([
      event("typeAdded", { finalType: "ДТП", classifierCode: "7-2" }),
      event("typeAdded", { finalType: "Пожар" }),
      event("typeRemoved", { index: 1 }),
      event("typeRemoved", { index: 0 }),
    ]);
    expect(restored.extraIncidents.map((item) => item.what.finalType)).toEqual(["Пожар"]);
    expect(restored.extraIncidents[0].what.casualties).toEqual({
      injured: false,
      ambulanceRefused: false,
      blocked: false,
    });
  });

  it("связи: первая привязанная карточка главная; linkPrimary переносит главную; снятие главной назначает первую", () => {
    const restored = restoreForm([
      event("linkAdded", { cardId: "c-1" }),
      event("linkAdded", { cardId: "c-2" }),
      event("linkPrimary", { cardId: "c-2" }),
      event("linkRemoved", { cardId: "c-2" }),
      event("linkAdded", { cardId: "c-3" }),
      event("linkRemoved", { cardId: "c-1" }),
    ]);
    expect(restored.links).toEqual([{ cardId: "c-3", primary: true }]);
  });

  it("связи: повтор linkAdded и linkPrimary на несвязанной карточке ничего не меняют", () => {
    const restored = restoreForm([
      event("linkAdded", { cardId: "c-1" }),
      event("linkAdded", { cardId: "c-1" }),
      event("linkAdded", { cardId: "c-2" }),
      event("linkPrimary", { cardId: "c-9" }),
    ]);
    expect(restored.links).toEqual([
      { cardId: "c-1", primary: true },
      { cardId: "c-2", primary: false },
    ]);
  });

  it("исход из событий: «нет контакта» восстанавливается, неизвестное значение — «заполнена»", () => {
    expect(restoreForm([field("outcome", "noContact")]).outcome).toBe("noContact");
    expect(restoreForm([field("outcome", "unknown")]).outcome).toBe("filled");
  });

  it("канал передаётся параметром; по умолчанию — звонок", () => {
    expect(restoreForm([], "sms").channel).toBe("sms");
    expect(restoreForm([]).channel).toBe("call");
  });
});

describe("регрессии: общие объекты не утекают между формами", () => {
  it("восстановление вкладок и связей не меняет EMPTY_FORM", () => {
    restoreForm([event("typeAdded", { finalType: "ДТП" }), event("linkAdded", { cardId: "c-1" })]);
    expect(EMPTY_FORM.extraIncidents).toEqual([]);
    expect(EMPTY_FORM.links).toEqual([]);
  });

  it("правка адреса в восстановленной форме не меняет адрес по умолчанию", () => {
    restoreForm([field("address.street", "Тверская")]);
    expect(restoreForm([]).address.street).toBe("");
    expect(EMPTY_FORM.address.street).toBe("");
  });
});
