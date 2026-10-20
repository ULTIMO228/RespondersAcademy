import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HotkeyHints } from "./HotkeyHints";

describe("HotkeyHints", () => {
  it("не показывает клавиши режима создания обучающемуся-ДДС", () => {
    render(<HotkeyHints isVisible isDdsLearner />);
    expect(screen.getByText("Общие")).toBeInTheDocument();
    expect(screen.getByText("Режим просмотра")).toBeInTheDocument();
    expect(screen.queryByText("Shift+F2")).toBeNull();
    expect(screen.queryByText("Alt+S")).toBeNull();
    expect(screen.queryByText(/Мгновенные действия/)).toBeNull();
    expect(screen.queryByText(/Создание напоминания/)).toBeNull();
  });

  it("оставляет справочные горячие клавиши преподавателю", () => {
    render(<HotkeyHints isVisible />);
    expect(screen.getByText(/Мгновенные действия/)).toBeInTheDocument();
  });
});
