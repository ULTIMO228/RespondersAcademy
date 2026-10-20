import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setOpenAttempt } from "@/shared/lib";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { SimulatorBar } from "./SimulatorBar";

describe("SimulatorBar: «В кабинет» и переключатель зон", () => {
  it("одна специализация: переключателя нет, ссылка в кабинет на месте", () => {
    render(<SimulatorBar zones={["dds"]} currentZone="dds" />);
    expect(screen.getByRole("link", { name: /В кабинет/ })).toHaveAttribute("href", "/student");
    expect(screen.queryByRole("navigation", { name: "Рабочая зона" })).not.toBeInTheDocument();
  });

  it("две специализации: подпись текущей роли и ссылка на другую зону", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />);
    const nav = screen.getByRole("navigation", { name: "Рабочая зона" });
    expect(nav).toHaveTextContent("Специалист 112");
    expect(screen.getByRole("link", { name: "Оператор ДДС" })).toHaveAttribute("href", "/arm");
    expect(screen.queryByRole("link", { name: "Специалист 112" })).not.toBeInTheDocument();
  });

  it("из зоны ДДС ссылка ведёт в режим 112", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="dds" />);
    expect(screen.getByRole("link", { name: "Специалист 112" })).toHaveAttribute("href", "/arm/operator112");
  });
});

describe("SimulatorBar: смена зоны при открытой попытке (FR-014)", () => {
  afterEach(() => {
    act(() => setOpenAttempt(null));
    pushMock.mockClear();
  });

  it("без открытой попытки ссылка зоны работает как обычная, подтверждения нет", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />);
    fireEvent.click(screen.getByRole("link", { name: "Оператор ДДС" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("при открытой попытке спрашивает подтверждение, называет роли и не уходит без согласия", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />);
    act(() => setOpenAttempt({ title: "Билет 112: Пожар" }));
    fireEvent.click(screen.getByRole("link", { name: "Оператор ДДС" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Билет 112: Пожар");
    expect(dialog).toHaveTextContent("Специалист 112");
    expect(dialog).toHaveTextContent("Оператор ДДС");
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Остаться" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("после подтверждения переходит в выбранную зону", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />);
    act(() => setOpenAttempt({ title: "Билет 112: Пожар" }));
    fireEvent.click(screen.getByRole("link", { name: "Оператор ДДС" }));
    fireEvent.click(screen.getByRole("button", { name: /Перейти/ }));
    expect(pushMock).toHaveBeenCalledWith("/arm");
  });
});
