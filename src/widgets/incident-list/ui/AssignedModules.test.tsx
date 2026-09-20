import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssignedModule } from "../model/types";
import { AssignedModules } from "./AssignedModules";

const MODULE: AssignedModule = {
  id: "s-032",
  title: "Билет 32: заблокирован проезд",
  shortTitle: "Билет 32",
  categories: ["ДТП", "пожар"],
  difficulty: 4,
  levelTitle: "продвинутый",
  deadline: "17.09.2026 12:20",
  teacherId: "u-002",
  cards: [{ id: "c-094", group: "ДТП" }],
};

describe("AssignedModules (T2.2-15)", () => {
  it("строка модуля: название, категории, сложность, дедлайн; клик — старт занятия", () => {
    const handleStart = vi.fn();
    render(<AssignedModules modules={[MODULE]} onStart={handleStart} />);
    expect(screen.getByText("Мои назначенные модули")).toBeInTheDocument();
    expect(screen.getByText("ДТП · пожар")).toBeInTheDocument();
    expect(screen.getByText("4 из 5 · продвинутый")).toBeInTheDocument();
    expect(screen.getByText("17.09.2026 12:20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Билет 32/ }));
    expect(handleStart).toHaveBeenCalledWith(MODULE);
  });

  it("активный модуль отмечен; ошибка старта — сообщение; пусто — «Назначенных модулей нет»", () => {
    const { rerender } = render(
      <AssignedModules
        modules={[MODULE]}
        activeModuleId="s-032"
        startState={{ status: "error", message: "В модуле нет карточек профильных групп" }}
      />,
    );
    expect(screen.getByRole("button", { name: /Билет 32/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("В модуле нет карточек профильных групп");
    rerender(<AssignedModules modules={[]} />);
    expect(screen.getByText("Назначенных модулей нет")).toBeInTheDocument();
    rerender(<AssignedModules modules={[]} status="loading" />);
    expect(screen.getByText("Загрузка модулей…")).toBeInTheDocument();
  });
});
