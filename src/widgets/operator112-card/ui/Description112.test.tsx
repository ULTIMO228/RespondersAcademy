import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DESCRIPTION_MAX, Description112 } from "./Description112";

describe("Description112", () => {
  it("плейсхолдер «введите» и счётчик «N / 1999»", () => {
    render(<Description112 value="пожар" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("введите")).toBeInTheDocument();
    expect(screen.getByText("5 / 1999")).toBeInTheDocument();
  });

  it("ввод сверх 1999 символов невозможен", () => {
    const onChange = vi.fn();
    render(<Description112 value="" onChange={onChange} />);
    const area = screen.getByLabelText("Описание со слов заявителя");
    expect(area).toHaveAttribute("maxlength", String(DESCRIPTION_MAX));
    fireEvent.change(area, { target: { value: "а".repeat(DESCRIPTION_MAX + 50) } });
    expect(onChange).toHaveBeenCalledWith("а".repeat(DESCRIPTION_MAX));
  });
});
