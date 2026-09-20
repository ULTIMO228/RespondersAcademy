import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reference } from "@/shared/api";

import { InternalNumbers } from "./InternalNumbers";

describe("InternalNumbers", () => {
  it("показывает номера из мока с названиями и подсвечивает ожидаемый", () => {
    render(
      <InternalNumbers
        numbers={reference.internalNumbers}
        expectedNumbers={["104"]}
        onCall={() => undefined}
      />,
    );
    for (const number of ["101", "102", "103", "104", "301", "302", "303"]) {
      expect(screen.getByText(number)).toBeInTheDocument();
    }
    expect(screen.getByText("Руководитель дежурной смены ДДС")).toBeInTheDocument();
    const expectedRow = screen.getByText("104").closest("li");
    expect(expectedRow).toHaveAttribute("data-expected", "true");
    expect(within(expectedRow as HTMLElement).getByText(/Ожидается по эталону/)).toBeInTheDocument();
  });

  it("кнопка «Вызов» передаёт номер", () => {
    const handleCall = vi.fn();
    render(<InternalNumbers numbers={reference.internalNumbers} onCall={handleCall} />);
    fireEvent.click(screen.getByTitle("Вызов 301"));
    expect(handleCall).toHaveBeenCalledWith("301");
  });
});
