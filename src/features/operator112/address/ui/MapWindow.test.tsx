import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapWindow } from "./MapWindow";

afterEach(() => vi.unstubAllGlobals());

describe("MapWindow (КАРТОЧКА_image5)", () => {
  it("элементы окна: Широта, Долгота, ОК, Указать на карте, 50 м (неактивен), Слой (неактивен)", () => {
    render(<MapWindow onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "С112 - карта" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Широта")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Долгота")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ОК" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "50 м" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Слой" })).toBeDisabled();
  });

  it("«Указать на карте» + клик ставит маркер и пишет широту/долготу; «ОК» применяет", () => {
    const onApply = vi.fn();
    render(<MapWindow onApply={onApply} onClose={vi.fn()} />);
    const surface = screen.getByTestId("map-surface");
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.click(surface, { clientX: 50, clientY: 50 }); // без режима выбора — игнорируется
    expect(screen.queryByTestId("map-marker")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Указать на карте" }));
    fireEvent.click(surface, { clientX: 50, clientY: 50 });
    expect(screen.getByLabelText("Широта")).toHaveValue("55.7558");
    expect(screen.getByLabelText("Долгота")).toHaveValue("37.6173");
    expect(screen.getByTestId("map-marker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(onApply).toHaveBeenCalledWith({ lat: 55.7558, lon: 37.6173 });
  });

  it("нечисловые координаты — ошибка, onApply не вызывается", () => {
    const onApply = vi.fn();
    render(<MapWindow onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Широта"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("не делает сетевых запросов; подложка — локальный файл", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(
      <MapWindow lat={55.7558} lon={37.6173} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    const src = container.querySelector("img")?.getAttribute("src") ?? "";
    expect(src).toBe("/mock-map-tile.svg");
    expect(src.startsWith("http")).toBe(false);
  });
});
