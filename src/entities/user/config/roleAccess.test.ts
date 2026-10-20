import { describe, expect, it } from "vitest";

import { ROLE_ACCESS_ROWS } from "./roleAccess";

const noteOf = (route: string) => ROLE_ACCESS_ROWS.find((row) => row.route === route)?.access.student.note;

describe("матрица доступа: специализации обучающегося (спека 007)", () => {
  it("зоны ДДС помечены специализацией ДДС", () => {
    for (const route of ["/arm", "/arm/card/[id]", "/arm/phone"]) {
      expect(noteOf(route), route).toMatch(/специализаци[ией]+ ДДС/);
    }
  });

  it("режим «Специалист-112» помечен специализацией 112", () => {
    expect(noteOf("/arm/operator112")).toMatch(/специализаци[ией]+ 112/);
  });

  it("разделы платформы специализацией не ограничены", () => {
    expect(noteOf("/student")).toBeUndefined();
  });
});
