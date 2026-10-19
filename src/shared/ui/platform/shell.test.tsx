import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformShell, SideNav } from "./shell";

const items = [{ href: "/teacher/constructor", title: "Конструктор", icon: "flow" as const, active: true }];

describe("PlatformShell — рабочее место во весь экран (конструктор, фича 005)", () => {
  it("свёрнутая панель: пункты — значки с подписью для диктора, плашка «Учебная система» остаётся", () => {
    const { container } = render(
      <PlatformShell brandHref="/teacher" workspace nav={<SideNav items={items} compact />} topbar={<div />}>
        <p>Содержимое</p>
      </PlatformShell>,
    );
    expect(container.firstElementChild).toHaveAttribute("data-layout", "workspace");
    const link = screen.getByRole("link", { name: "Конструктор" });
    expect(link).toHaveAttribute("title", "Конструктор");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Учебная система. Не является рабочей системой-112")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Учебный тренажёр оператора ДДС" })).toBeInTheDocument();
  });

  it("обычная оболочка не меняется (парный случай)", () => {
    const { container } = render(
      <PlatformShell brandHref="/teacher" nav={<SideNav items={items} />} topbar={<div />}>
        <p>Содержимое</p>
      </PlatformShell>,
    );
    expect(container.firstElementChild).not.toHaveAttribute("data-layout");
    expect(screen.getByRole("link", { name: "Конструктор" })).not.toHaveAttribute("title");
    expect(screen.getByText(/оператора ДДС/)).toBeInTheDocument();
  });
});
