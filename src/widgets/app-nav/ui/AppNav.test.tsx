import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppNav } from "./AppNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/arm/operator112" }));
vi.mock("@/entities/user", () => ({
  LogoutLink: ({ children }: { children: React.ReactNode }) => <a href="/login">{children}</a>,
}));

function renderNav(zones: ("operator112" | "dds")[]) {
  render(
    <AppNav role="student" roleTitle="Обучающийся" userName="Иванов С. П." armNumber={1} zones={zones} />,
  );
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

describe("AppNav: вкладки по специализации", () => {
  it("только ДДС: журнал и софтфон на месте", () => {
    const hrefs = renderNav(["dds"]);
    expect(hrefs).toContain("/arm");
    expect(hrefs).toContain("/arm/phone");
  });

  it("только 112: нет входа в зону ДДС (журнал, софтфон ДДС)", () => {
    const hrefs = renderNav(["operator112"]);
    expect(hrefs).not.toContain("/arm");
    expect(hrefs).not.toContain("/arm/phone");
  });

  it("общие вкладки (прогресс, справка) остаются для обеих зон", () => {
    const hrefs = renderNav(["operator112"]);
    expect(hrefs).toContain("/arm/progress");
    expect(hrefs).toContain("/arm/help");
  });

  it("две специализации: набор вкладок как у ДДС", () => {
    const hrefs = renderNav(["operator112", "dds"]);
    expect(hrefs).toContain("/arm");
    expect(hrefs).toContain("/arm/phone");
  });
});
