import { describe, expect, it } from "vitest";

import { resolvePostLoginRoute, sanitizeReturnUrl } from "./redirect";

describe("resolvePostLoginRoute", () => {
  it("по умолчанию — раздел роли: student → /arm, teacher → /teacher, admin → /admin/users", () => {
    expect(resolvePostLoginRoute("student")).toBe("/arm");
    expect(resolvePostLoginRoute("teacher", null)).toBe("/teacher");
    expect(resolvePostLoginRoute("admin", "")).toBe("/admin/users");
  });

  it("returnUrl гварда — возврат на тот же URL (с query)", () => {
    expect(resolvePostLoginRoute("student", "/arm/card/card-881412")).toBe("/arm/card/card-881412");
    expect(resolvePostLoginRoute("teacher", "/teacher/reports?tab=group")).toBe("/teacher/reports?tab=group");
  });

  it("returnUrl чужого раздела — вместо 403 раздел своей роли", () => {
    expect(resolvePostLoginRoute("teacher", "/arm/card/card-881412")).toBe("/teacher");
  });

  it("open-redirect отсекается", () => {
    [
      "https://evil.example",
      "//evil.example/arm",
      "/\\evil.example",
      "javascript:alert(1)",
      "/login?returnUrl=/arm",
    ].forEach((returnUrl) => expect(resolvePostLoginRoute("student", returnUrl)).toBe("/arm"));
  });
});

describe("sanitizeReturnUrl", () => {
  it("только внутренние пути", () => {
    expect(sanitizeReturnUrl("/arm/help#keys")).toBe("/arm/help#keys");
    expect(sanitizeReturnUrl("/\t/evil.example")).toBeNull();
    expect(sanitizeReturnUrl(undefined)).toBeNull();
  });
});
