import { describe, expect, it } from "vitest";

import { fromMoscowInputValue, toMoscowInputValue, toMoscowIso } from "./time";

describe("метки времени ленты (+03:00)", () => {
  it("мс → ISO +03:00 и значение datetime-local в московском времени", () => {
    const ms = Date.parse("2026-09-17T08:50:44Z");
    expect(toMoscowIso(ms)).toBe("2026-09-17T11:50:44+03:00");
    expect(toMoscowInputValue(ms)).toBe("2026-09-17T11:50");
  });

  it("datetime-local → ISO; мусор → undefined", () => {
    expect(fromMoscowInputValue("2026-09-17T11:50")).toBe("2026-09-17T11:50:00+03:00");
    expect(fromMoscowInputValue("")).toBeUndefined();
    expect(fromMoscowInputValue("вчера")).toBeUndefined();
  });
});
