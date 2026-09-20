import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readGroupReport, readReports } from "../../../../app/api/mock/_server/testing";

import { ReportCharts } from "./ReportCharts";

const groupReport = readGroupReport();
const sessionReports = readReports().filter((report) => report.sessionId === groupReport.sessionId);
const attemptCount = sessionReports.flatMap((report) => report.charts.byStage.attempts).length;

describe("ReportCharts (T0.3-12)", () => {
  it("byStage: точки = попыткам мока, линии нормативов 30/180 подписаны", () => {
    const { container, getByText } = render(
      <ReportCharts reports={sessionReports} groupReport={groupReport} />,
    );
    const byStage = container.querySelector("[data-block='byStage']") as HTMLElement;
    const charts = byStage.querySelectorAll("figure");
    expect(charts).toHaveLength(2);
    charts.forEach((chart) => expect(chart.querySelectorAll("[data-point]")).toHaveLength(attemptCount));
    expect(byStage.querySelector("[data-norm='30']")).not.toBeNull();
    expect(byStage.querySelector("[data-norm='180']")).not.toBeNull();
    expect(within(byStage).getByText("норматив 180 с")).toBeInTheDocument();
    expect(getByText("опциональный модуль аналитики (ТЗ §6)")).toBeInTheDocument();
  });

  it("byErrorType: ячейки heatmap = курсанты × типы; dynamics: столбцы = scoreByStudent", () => {
    const { container } = render(<ReportCharts reports={sessionReports} groupReport={groupReport} />);
    expect(container.querySelectorAll("[data-heat-cell]")).toHaveLength(sessionReports.length * 5);
    const dynamics = container.querySelector("[data-block='dynamics']") as HTMLElement;
    expect(dynamics.querySelectorAll("[data-bar]")).toHaveLength(
      groupReport.charts.scoreByStudent.series.values.length,
    );
    const scoreCount = sessionReports.flatMap((report) => report.charts.dynamics.scores).length;
    expect(dynamics.querySelectorAll("[data-series='Балл попытки'] [data-point]")).toHaveLength(scoreCount);
  });
});

describe("ReportCharts: достоверность и текстовые альтернативы (T3.4-13…15)", () => {
  it("bar «балл по курсантам» берёт те же значения, что сводная таблица (Report.score)", () => {
    const { container } = render(<ReportCharts reports={sessionReports} groupReport={groupReport} />);
    const dynamics = container.querySelector("[data-block='dynamics']") as HTMLElement;
    const values = [...dynamics.querySelectorAll("[data-bar] title")].map((node) => node.textContent);
    expect(values).toEqual(
      sessionReports.map((report) => `${report.student.fullName.split(" ")[0]}: ${report.score}`),
    );
  });

  it("byStage и dynamics продублированы таблицей значений (доступность, ч/б печать)", () => {
    const { getByRole } = render(<ReportCharts reports={sessionReports} groupReport={groupReport} />);
    const stageTable = getByRole("table", { name: /Тайминги по попыткам/ });
    expect(within(stageTable).getByText("232")).toBeInTheDocument();
    expect(getByRole("table", { name: "Балл по попыткам занятия" })).toBeInTheDocument();
  });

  it("нулевые ошибки → честное пустое состояние вместо тепловой карты", () => {
    const clean = sessionReports.map((report) => ({
      ...report,
      charts: {
        ...report.charts,
        byErrorType: {
          grammar: { spelling: 0, syntax: 0 },
          errors: { critical: 0, major: 0, minor: 0 },
        },
      },
    }));
    const { container, getByRole } = render(<ReportCharts reports={clean} groupReport={groupReport} />);
    expect(container.querySelectorAll("[data-heat-cell]")).toHaveLength(0);
    expect(getByRole("status")).toHaveTextContent("тепловая карта пуста");
  });
});
