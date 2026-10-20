import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Journal112Header } from "./Journal112Header";

const NOW = new Date(2019, 5, 27, 11, 39, 49).getTime();

describe("Journal112Header", () => {
  it("показывает поиск, дату, оператора, часы и действия", () => {
    const onCreate = vi.fn();
    render(<Journal112Header operatorName="Иванов С П" nowMs={NOW} onCreateCard={onCreate} onLogout={vi.fn()} />);
    expect(screen.getByText("Поиск происшествий")).toBeTruthy();
    for (const t of ["×", "сбросить", "новый поиск", "настроить", "справка", "выйти", "не подключен"]) {
      expect(screen.getAllByText(new RegExp(t)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/расширенный по параметрам/)).toBeTruthy();
    expect(screen.getByText("Четверг, 27 Июнь 2019")).toBeTruthy();
    expect(screen.getByText(/, Иванов С П/)).toBeTruthy();
    expect(screen.getByText("11:39")).toBeTruthy();
    expect(screen.getByText(":49")).toBeTruthy();
    fireEvent.click(screen.getByText("создать новую карточку"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("меню: активен только «журнал», остальные aria-disabled", () => {
    render(<Journal112Header operatorName="X" nowMs={NOW} onCreateCard={vi.fn()} />);
    expect(screen.getByText("журнал").getAttribute("aria-current")).toBe("page");
    for (const t of ["экран", "статистика", "УЕР", "вики", "заявители", "техника", "аудит", "отчёты"]) {
      expect(screen.getByText(t).getAttribute("aria-disabled")).toBe("true");
    }
  });
});
