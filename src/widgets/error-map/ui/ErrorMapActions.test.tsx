import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorMapActions, ErrorMapToolbar } from "./ErrorMapActions";

describe("кнопки показа и печати", () => {
  it("«Показать на экране» — обычная ссылка, «Распечатать» — PDF в новой вкладке", () => {
    render(<ErrorMapActions presentHref="/p?step=1" pdfHref="/api/v1/error-map/export.pdf?scope=group" />);
    expect(screen.getByRole("link", { name: "Показать на экране" })).toHaveAttribute("href", "/p?step=1");
    const print = screen.getByRole("link", { name: /Распечатать/ });
    expect(print).toHaveAttribute("href", "/api/v1/error-map/export.pdf?scope=group");
    expect(print).toHaveAttribute("target", "_blank");
    expect(print).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(print.getAttribute("aria-label")).toContain("PDF");
  });

  it("без адреса показа выводится только «Распечатать»", () => {
    render(<ErrorMapActions pdfHref="/x.pdf" />);
    expect(screen.queryByRole("link", { name: "Показать на экране" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Распечатать/ })).toBeInTheDocument();
  });

  it("«Скачать в Excel» — обычная ссылка на файл; без адреса её нет", () => {
    const { rerender } = render(
      <ErrorMapActions pdfHref="/x.pdf" xlsxHref="/api/v1/error-map/export.xlsx?scope=journal" />,
    );
    const excel = screen.getByRole("link", { name: /Скачать в Excel/ });
    expect(excel).toHaveAttribute("href", "/api/v1/error-map/export.xlsx?scope=journal");
    expect(excel).toHaveAttribute("download");
    rerender(<ErrorMapActions pdfHref="/x.pdf" />);
    expect(screen.queryByRole("link", { name: /Скачать в Excel/ })).not.toBeInTheDocument();
  });

  it("панель держит содержимое в одной строке", () => {
    render(
      <ErrorMapToolbar>
        <span>внутри</span>
      </ErrorMapToolbar>,
    );
    expect(screen.getByText("внутри")).toBeInTheDocument();
  });
});
