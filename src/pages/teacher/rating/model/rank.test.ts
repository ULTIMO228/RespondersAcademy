import { describe, expect, it } from "vitest";

import type { StudentRatingRow } from "@/shared/api";

import { parseRatingQuery, rankRows, serializeRatingQuery } from "./rank";

function row(id: string, patch: Partial<StudentRatingRow>): StudentRatingRow {
  return {
    studentId: id,
    fullName: id,
    groupId: "Г-1",
    attempts: 5,
    averageScore: 50,
    averageReactionMs: 20_000,
    averageProcessingMs: 100_000,
    withinNormsShare: 0.5,
    ratingOperator112: 1000,
    ratingDds: 1000,
    enoughData: true,
    ...patch,
  };
}

describe("rankRows", () => {
  it("равные значения делят место, следующее — с пропуском", () => {
    const ranked = rankRows(
      [
        row("в", { averageScore: 70 }),
        row("а", { averageScore: 90 }),
        row("б", { averageScore: 70 }),
        row("г", { averageScore: 10 }),
      ],
      "averageScore",
      "desc",
    );
    expect(ranked.map((r) => [r.studentId, r.place])).toEqual([
      ["а", 1],
      ["б", 2],
      ["в", 2],
      ["г", 4],
    ]);
  });

  it("«мало данных» и пустые значения — внизу и без места", () => {
    const ranked = rankRows(
      [row("мало", { enoughData: false, averageScore: 99 }), row("ок", { averageScore: 40 })],
      "averageScore",
      "desc",
    );
    expect(ranked.map((r) => [r.studentId, r.place])).toEqual([
      ["ок", 1],
      ["мало", null],
    ]);
  });

  it("время сортируется по возрастанию: быстрее — выше", () => {
    const ranked = rankRows(
      [row("медленно", { averageReactionMs: 40_000 }), row("быстро", { averageReactionMs: 10_000 })],
      "averageReactionMs",
      "asc",
    );
    expect(ranked[0].studentId).toBe("быстро");
  });
});

describe("query", () => {
  it("неизвестные значения заменяются значениями по умолчанию, известные сохраняются", () => {
    const filters = parseRatingQuery(new URLSearchParams("groupId=Г-1&mode=dds&sort=bad&dir=asc"));
    expect(filters).toEqual({ groupId: "Г-1", mode: "dds", period: "all", sort: "averageScore", dir: "asc" });
    expect(parseRatingQuery(new URLSearchParams(serializeRatingQuery(filters)))).toEqual(filters);
  });
});
