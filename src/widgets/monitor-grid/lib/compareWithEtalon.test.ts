import { describe, expect, it } from "vitest";

import { compareWithEtalon } from "./compareWithEtalon";

const dictionary = { statusTitles: { accepted: "Принята", workDone: "Работы завершены" } };
const expected = ["openCard:c-095", "status:accepted", "call:103", "call:102", "call:101", "status:workDone"];

describe("compareWithEtalon", () => {
  it("подсвечивает нарушение порядка и ожидаемые действия", () => {
    const rows = compareWithEtalon({
      actions: [
        { action: "openCard:c-095", at: "2026-09-17T11:20:09+03:00" },
        { action: "status:accepted", at: "2026-09-17T11:20:23+03:00" },
        { action: "call:102", at: "2026-09-17T11:21:02+03:00" },
        { action: "call:103", at: "2026-09-17T11:21:48+03:00" },
      ],
      expected,
      isCardFinished: false,
      dictionary,
    });
    expect(rows.map((row) => row.deviation)).toEqual(["ok", "ok", "ok", "order", "pending", "pending"]);
    expect(rows[1]).toMatchObject({ label: "Статус «Принята»", offset: "+0:14" });
  });

  it("незавершённые шаги закрытой карточки — пропущены", () => {
    const rows = compareWithEtalon({
      actions: [{ action: "openCard:c-095", at: "2026-09-17T11:20:09+03:00" }],
      expected,
      isCardFinished: true,
      dictionary,
    });
    expect(rows.filter((row) => row.deviation === "missing")).toHaveLength(expected.length - 1);
  });
});
