import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LIST_PREVIEW_LIMIT, renderList } from "./ScenarioTable";

describe("renderList", () => {
  it("короткий список выводит целиком, без «ещё»", () => {
    render(renderList(["А", "Б", "В"]));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(/ещё/)).toBeNull();
  });

  it("длинный список: первые 3 и подпись «ещё N» с полным списком в подсказке", () => {
    const values = Array.from({ length: 30 }, (_, i) => `Тип ${i + 1}`);
    render(renderList(values));
    expect(LIST_PREVIEW_LIMIT).toBe(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Тип 3")).toBeTruthy();
    expect(screen.queryByText("Тип 4")).toBeNull();
    const more = screen.getByText(/ещё 27/);
    expect(more.getAttribute("title")).toBe(values.join("\n"));
  });
});
