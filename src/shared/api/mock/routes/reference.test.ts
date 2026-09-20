// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GET } from "../../../../../app/api/mock/reference/route";
import type { ReferenceData } from "../../types";
import { readReference } from "../readers";

const REFERENCE_KEY_COUNT = 11;

describe("GET /api/mock/reference (образец route handler)", () => {
  it("200 и 11 коллекций справочника, meta не отдаётся", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body: ReferenceData = await response.json();
    expect(Object.keys(body)).toHaveLength(REFERENCE_KEY_COUNT);
    expect(body).not.toHaveProperty("meta");
    expect(body.classifierRows).toHaveProperty("$ref");
    expect(body.ddsStatuses.length).toBeGreaterThan(0);
  });

  it("ответ не связан с кэшем ридера", async () => {
    const body: ReferenceData = await (await GET()).json();
    body.channels.push("изменено");
    expect(readReference().channels).not.toContain("изменено");
  });
});
