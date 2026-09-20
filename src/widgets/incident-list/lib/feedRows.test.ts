import { describe, expect, it } from "vitest";

import type { IncidentCard } from "@/shared/api";

import { mergeIssued } from "./feedRows";
import type { IssuedCard } from "./feedRows";

function issued(id: string, issuedAt: string): IssuedCard {
  return { card: { id } as IncidentCard, issuedAt };
}

describe("поступление карточек занятия (T2.2-07)", () => {
  it("сортировка «новые сверху» и без дублей при повторном тике ленты", () => {
    const first = mergeIssued([], [issued("c-094", "2026-09-17T11:20:00+03:00")]);
    const second = mergeIssued(first, [
      issued("c-095", "2026-09-17T11:23:00+03:00"),
      issued("c-094", "2026-09-17T11:20:00+03:00"),
    ]);
    expect(second.map((item) => item.card.id)).toEqual(["c-095", "c-094"]);
    expect(mergeIssued(second, [issued("c-095", "2026-09-17T11:23:00+03:00")])).toHaveLength(2);
  });

  it("одновременная выдача — детерминированный порядок по id", () => {
    const same = "2026-09-17T11:20:00+03:00";
    expect(mergeIssued([], [issued("c-2", same), issued("c-1", same)]).map((item) => item.card.id)).toEqual([
      "c-1",
      "c-2",
    ]);
  });
});
