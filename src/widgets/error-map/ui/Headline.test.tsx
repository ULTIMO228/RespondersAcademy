import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Headline } from "./Headline";

describe("Headline", () => {
  it("показывает «Критичных проблем нет», когда проблем нет", () => {
    render(<Headline headline={{ kind: "clean", stageIds: [], text: "Критичных проблем нет" }} />);
    expect(screen.getByText("Критичных проблем нет")).toBeInTheDocument();
  });

  it("показывает фразу про проблемы", () => {
    render(
      <Headline headline={{ kind: "problems", stageIds: ["c"], text: "Главная проблема группы: службы" }} />,
    );
    expect(screen.getByText("Главная проблема группы: службы")).toBeInTheDocument();
  });

  it("вид вывода несёт значок помимо цвета, значок скрыт от чтения", () => {
    const { container, rerender } = render(
      <Headline headline={{ kind: "problems", stageIds: [], text: "x" }} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("!");
    rerender(<Headline headline={{ kind: "clean", stageIds: [], text: "x" }} />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("✓");
    rerender(<Headline headline={{ kind: "noData", stageIds: [], text: "Мало данных" }} />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("○");
  });
});
