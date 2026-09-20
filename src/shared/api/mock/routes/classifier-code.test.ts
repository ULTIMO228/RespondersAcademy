// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GET } from "../../../../../app/api/mock/classifier/route";
import type { ClassifierEntry } from "../../types";

async function getByCode(code: string): Promise<ClassifierEntry[]> {
  const response = await GET(new Request(`http://localhost/api/mock/classifier?code=${code}`));
  expect(response.status).toBe(200);
  return (await response.json()) as ClassifierEntry[];
}

describe("GET /api/mock/classifier?code= (T2.3-08)", () => {
  it("возвращает записи группы, к которой относится код ЕКП", async () => {
    const entries = await getByCode("1050101");
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.every((entry) => entry.group === "пожар в жилом доме")).toBe(true);
    expect(entries.some((entry) => entry.code === "1050101")).toBe(true);
  });

  it("неизвестный код → пустой массив", async () => {
    expect(await getByCode("0000000")).toEqual([]);
  });
});
