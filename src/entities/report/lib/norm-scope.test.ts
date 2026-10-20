import { describe, expect, it } from "vitest";

import { describeNorms, NORM_SCOPE_LABELS } from "./norm-scope";

describe("подписи нормативов по специализации (FR-011)", () => {
  it("112: ответ на вызов и отправка карточки, не «реакция на карточку»", () => {
    const norms = describeNorms("operator112");
    expect(norms.reaction).toBe("ответ на вызов, норматив 30 с");
    expect(norms.processing).toBe("отправка карточки, норматив 3 мин");
    expect(norms.summary).toMatch(/по умолчанию/);
  });

  it("ДДС: реакция на карточку и полная отработка", () => {
    const norms = describeNorms("dds");
    expect(norms.reaction).toBe("реакция на карточку, норматив 30 с");
    expect(norms.processing).toBe("полная отработка, норматив 3 мин");
    expect(norms.summary).not.toMatch(/по умолчанию/);
  });

  it("смешанный срез не выдаёт одно число за оба норматива", () => {
    const norms = describeNorms("all");
    expect(norms.summary).toMatch(/112.*ДДС/);
    expect(norms.summary).toMatch(/выберите режим/);
  });

  it("метки режимов совпадают с подписями интерфейса", () => {
    expect(NORM_SCOPE_LABELS).toEqual({ operator112: "Режим 112", dds: "Режим ДДС" });
  });
});
