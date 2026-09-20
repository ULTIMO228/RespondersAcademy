// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readIntParam, readJsonBody, readListParam, readPageParams, readSearchParams } from "./request";
import { MockApiError } from "./respond";

const BASE_URL = "http://localhost/api/mock/cards";

function postJson(body: string): Request {
  return new Request(BASE_URL, { method: "POST", body, headers: { "content-type": "application/json" } });
}

describe("readJsonBody", () => {
  it("разбирает JSON-объект", async () => {
    expect(await readJsonBody(postJson('{"ddsStatus":"accepted"}'))).toEqual({ ddsStatus: "accepted" });
  });

  it.each(["не json", "[1,2]", "null"])("некорректное тело %s → 400", async (raw) => {
    await expect(readJsonBody(postJson(raw))).rejects.toMatchObject({ status: 400, code: "badRequest" });
  });

  it("guard отклоняет неверную форму → 400", async () => {
    const hasText = (candidate: unknown): candidate is { text: string } =>
      typeof (candidate as { text?: unknown }).text === "string";
    await expect(readJsonBody(postJson('{"text":1}'), hasText)).rejects.toBeInstanceOf(MockApiError);
  });
});

describe("query-параметры", () => {
  it("кириллица декодируется, множественные — повторными ключами", () => {
    const params = readSearchParams(
      new Request(`${BASE_URL}?okrug=${encodeURIComponent("ЮАО")}&okrug=${encodeURIComponent("САО")}&okrug=`),
    );
    expect(readListParam(params, "okrug")).toEqual(["ЮАО", "САО"]);
  });

  it("page/perPage: дефолты 1/10", () => {
    expect(readPageParams(new URLSearchParams())).toEqual({ page: 1, perPage: 10 });
  });

  it.each(["abc", "1.5", "0"])("мусорный page=%s → 400", (raw) => {
    expect(() => readPageParams(new URLSearchParams({ page: raw }))).toThrow(MockApiError);
  });

  it("readIntParam проверяет max", () => {
    expect(() =>
      readIntParam(new URLSearchParams({ perPage: "1000" }), "perPage", { fallback: 10, max: 100 }),
    ).toThrow(/perPage/);
  });
});
