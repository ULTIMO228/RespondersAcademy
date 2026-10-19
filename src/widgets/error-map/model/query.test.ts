import { describe, expect, it } from "vitest";

import { parseErrorMapQuery, serializeErrorMapQuery } from "./query";

describe("parseErrorMapQuery", () => {
  it("умолчания: dds и месяц, группа не выбрана", () => {
    expect(parseErrorMapQuery(new URLSearchParams(""))).toEqual({ groupId: "", period: "1m", mode: "dds" });
  });

  it("читает корректные значения", () => {
    expect(parseErrorMapQuery(new URLSearchParams("group=g1&period=2w&mode=operator112"))).toEqual({
      groupId: "g1",
      period: "2w",
      mode: "operator112",
    });
  });

  it("неизвестные значения заменяются умолчанием", () => {
    expect(parseErrorMapQuery(new URLSearchParams("period=year&mode=x"))).toMatchObject({
      period: "1m",
      mode: "dds",
    });
  });

  it("принимает объект searchParams страницы, массив — первое значение", () => {
    expect(parseErrorMapQuery({ group: ["g2", "g3"], period: "all" })).toEqual({
      groupId: "g2",
      period: "all",
      mode: "dds",
    });
  });
});

describe("serializeErrorMapQuery", () => {
  it("записывает все фильтры и пропускает пустую группу", () => {
    expect(serializeErrorMapQuery({ groupId: "g1", period: "all", mode: "operator112" })).toBe(
      "group=g1&period=all&mode=operator112",
    );
    expect(serializeErrorMapQuery({ groupId: "", period: "1m", mode: "dds" })).toBe("period=1m&mode=dds");
  });

  it("round-trip сохраняет фильтры", () => {
    const filters = { groupId: "g1", period: "2w", mode: "dds" } as const;
    expect(parseErrorMapQuery(new URLSearchParams(serializeErrorMapQuery(filters)))).toEqual(filters);
  });
});
