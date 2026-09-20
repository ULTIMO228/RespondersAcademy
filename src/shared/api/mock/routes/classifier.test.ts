// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GET } from "../../../../../app/api/mock/classifier/route";
import type { ClassifierEntry } from "../../types";
import { CLASSIFIER_VERSION_HEADER } from "../classifier";
import { readClassifier, readClassifierMeta } from "../readers";

const TOTAL_ENTRIES = 1283;

function getClassifier(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/mock/classifier${query}`));
}

describe("GET /api/mock/classifier", () => {
  it("без параметра → все 1283 записи + версия в заголовке", async () => {
    const response = await getClassifier();
    expect(response.status).toBe(200);
    expect((await response.json()) as ClassifierEntry[]).toHaveLength(TOTAL_ENTRIES);
    const version = decodeURIComponent(response.headers.get(CLASSIFIER_VERSION_HEADER) ?? "");
    expect(version).toBe(readClassifierMeta().version);
  });

  it("?group= (кириллица, URL-encoded) → только записи группы", async () => {
    const group = "пожар на улице";
    const body: ClassifierEntry[] = await (await getClassifier(`?group=${encodeURIComponent(group)}`)).json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((entry) => entry.group === group)).toBe(true);
    expect(body).toHaveLength(readClassifier().filter((entry) => entry.group === group).length);
  });

  it("несуществующая группа → 200 и пустой массив", async () => {
    const response = await getClassifier("?group=нет%20такой");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
