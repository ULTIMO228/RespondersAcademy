import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";

describe("charts", () => {
  it("рисует столько столбцов, сколько значений", () => {
    const { container } = render(<BarChart title="Баллы" labels={["А", "Б", "В"]} values={[96, 71, 58]} />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(3);
  });

  it("рисует точки линии и линию норматива", () => {
    const { container } = render(
      <LineChart
        title="Реакция"
        labels={["1", "2"]}
        series={[{ name: "Реакция", values: [14, 41] }]}
        norms={[{ value: 30, label: "норматив 30 с" }]}
      />,
    );
    expect(container.querySelectorAll("[data-point]")).toHaveLength(2);
    expect(container.querySelector("[data-norm='30']")).not.toBeNull();
  });
});
