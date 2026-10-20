import { afterEach, describe, expect, it, vi } from "vitest";

import { getSessionErrorSummary } from "./training";

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => Response.json(payload)),
  );
}

describe("сводка ошибок занятия: ответ бэкенда и автономного режима приводятся к одной форме", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("бэкенд (bySeverity/byType, без byDetector) не ломает форму", async () => {
    stubFetch({
      schemaVersion: "ai-workflow/1",
      sessionId: "ses-702",
      totalErrors: 3,
      byType: { "rule-a": 2, "rule-b": 1 },
      byMode: { operator112: 1, dds: 2 },
      bySeverity: { critical: 1, major: 2, minor: 0 },
      byStudent: { "u-1": 3 },
      errorRecordIds: ["e1", "e2", "e3"],
    });
    const summary = await getSessionErrorSummary("ses-702");
    expect(summary).toMatchObject({
      sessionId: "ses-702",
      totalErrors: 3,
      critical: 1,
      major: 2,
      minor: 0,
      byRule: { "rule-a": 2, "rule-b": 1 },
      byDetector: {},
      byCategory: {},
      byStudent: { "u-1": 3 },
    });
  });

  it("пустая сводка бэкенда — нули и пустые словари, а не undefined", async () => {
    stubFetch({ sessionId: "ses-702", totalErrors: 0, byType: {}, bySeverity: {}, byStudent: {} });
    const summary = await getSessionErrorSummary("ses-702");
    expect(summary).toMatchObject({ critical: 0, major: 0, minor: 0, byDetector: {}, byRule: {} });
  });

  it("форма автономного режима проходит без изменений (парный случай)", async () => {
    const full = {
      sessionId: "ses-1",
      totalErrors: 4,
      critical: 1,
      major: 1,
      minor: 2,
      byCategory: { address: 4 },
      byRule: { r: 4 },
      byDetector: { rule: 4 },
      byStudent: { "u-1": 4 },
    };
    stubFetch(full);
    expect(await getSessionErrorSummary("ses-1")).toEqual(full);
  });
});
