import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ErrorMapJournalRow, ErrorMapStage, ErrorMapStageLevel } from "@/shared/api";

import { Journal } from "./Journal";

const STAGES: ErrorMapStage[] = [
  { id: "address", order: 1, title: "Адрес" },
  { id: "services", order: 2, title: "Службы" },
  { id: "closing", order: 3, title: "Завершение" },
];

function level(
  stageId: string,
  kind: ErrorMapStageLevel["level"],
  extra: Partial<ErrorMapStageLevel> = {},
): ErrorMapStageLevel {
  const withError = kind === "often" ? 3 : kind === "sometimes" ? 1 : 0;
  return {
    stageId,
    attempts: kind === "noData" ? 2 : 5,
    attemptsWithError: withError,
    share: kind === "noData" ? null : withError / 5,
    level: kind,
    affectedStudents: withError ? 1 : 0,
    ...extra,
  };
}

const ROWS: ErrorMapJournalRow[] = [
  {
    studentId: "u-1",
    name: "Иванов Пётр",
    attempts: 5,
    levels: [
      level("address", "often", { comparison: "worse" }),
      level("services", "sometimes", { comparison: "same" }),
      level("closing", "rare", { comparison: "better" }),
    ],
  },
  {
    studentId: "u-2",
    name: "Петрова Анна",
    attempts: 2,
    levels: [level("address", "noData"), level("services", "noData"), level("closing", "noData")],
  },
];

const cellHref = (studentId: string, stageId: string) => `/s/${studentId}?stage=${stageId}`;

function setup() {
  return render(<Journal stages={STAGES} rows={ROWS} cellHref={cellHref} caption="Журнал группы Группа 1" />);
}

describe("журнал группы", () => {
  it("в каждой ячейке есть значок и слово уровня, а не только цвет", () => {
    setup();
    const cell = screen.getByRole("link", { name: /Иванов Пётр, Адрес/ });
    expect(cell).toHaveTextContent("!");
    expect(cell).toHaveTextContent("часто");
    expect(screen.getByRole("link", { name: /Иванов Пётр, Службы/ })).toHaveTextContent("~ иногда");
    expect(screen.getByRole("link", { name: /Иванов Пётр, Завершение/ })).toHaveTextContent("✓ редко");
    expect(screen.getByRole("link", { name: /Петрова Анна, Адрес/ })).toHaveTextContent("○ мало данных");
  });

  it("каждая ячейка таблицы — ссылка с видимым словом уровня", () => {
    setup();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(ROWS.length * STAGES.length);
    for (const link of links) {
      expect(link.textContent).toMatch(/(редко|иногда|часто|мало данных)/);
    }
  });

  it("таблица читается скринридером: подпись, заголовки столбцов и строк", () => {
    setup();
    expect(screen.getByRole("table", { name: "Журнал группы Группа 1" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((item) => item.textContent);
    expect(headers).toEqual(["Обучающийся", "Адрес", "Службы", "Завершение"]);
    expect(screen.getByRole("rowheader", { name: /Иванов Пётр/ })).toHaveTextContent("попыток: 5");
    expect(screen.getByRole("rowheader", { name: /Петрова Анна/ })).toHaveTextContent("попыток: 2");
  });

  it("доступное имя ячейки называет сравнение с группой; у «мало данных» сравнения нет", () => {
    setup();
    expect(
      screen.getByRole("link", { name: "Иванов Пётр, Адрес: часто, 60% · 3 из 5, хуже группы" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Иванов Пётр, Завершение: редко.*лучше группы/ }),
    ).toBeInTheDocument();
    const gray = screen.getByRole("link", { name: /Петрова Анна, Адрес/ });
    expect(gray.getAttribute("aria-label")).toBe("Петрова Анна, Адрес: мало данных, попыток: 2");
  });

  it("клик по ячейке ведёт на разбор «этап → обучающийся»", () => {
    setup();
    const row = screen.getByRole("rowheader", { name: /Иванов Пётр/ }).closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: /Службы/ })).toHaveAttribute(
      "href",
      "/s/u-1?stage=services",
    );
    expect(screen.getByRole("link", { name: /Петрова Анна, Завершение/ })).toHaveAttribute(
      "href",
      "/s/u-2?stage=closing",
    );
  });

  it("обучающийся без ячейки этапа не ломает таблицу", () => {
    render(
      <Journal
        stages={STAGES}
        rows={[{ studentId: "u-3", name: "Без Данных", attempts: 0, levels: [level("address", "rare")] }]}
        cellHref={cellHref}
        caption="Журнал"
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getAllByRole("cell")).toHaveLength(3);
  });
});
