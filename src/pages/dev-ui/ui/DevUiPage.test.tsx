import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/shared/ui";

import { DevUiPage } from "./DevUiPage";

describe("DevUiPage", () => {
  it("рендерит полку примитивов", () => {
    render(<DevUiPage />);
    expect(screen.getByText("Полка UI-примитивов")).toBeInTheDocument();
    expect(screen.getAllByRole("timer")).toHaveLength(4);
  });

  it("неактивная кнопка не кликается", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        неактивна
      </Button>,
    );
    fireEvent.click(screen.getByText("неактивна"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
