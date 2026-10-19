import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Filters } from "./Filters";

const groups = [
  { groupId: "g1", title: "Группа 1", studentCount: 5 },
  { groupId: "g2", title: "Группа 2", studentCount: 7 },
];
const value = { groupId: "g1", period: "1m", mode: "dds" } as const;

describe("Filters", () => {
  it("показывает три фильтра с текущими значениями", () => {
    render(<Filters groups={groups} value={value} onChange={() => {}} />);
    expect(screen.getByLabelText("Группа")).toHaveValue("g1");
    expect(screen.getByRole("button", { name: "месяц" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "ДДС" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Период" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Режим" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("вызывает onChange с обновлённым значением", () => {
    const onChange = vi.fn();
    render(<Filters groups={groups} value={value} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Группа"), { target: { value: "g2" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, groupId: "g2" });
    fireEvent.click(screen.getByRole("button", { name: "2 недели" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, period: "2w" });
    fireEvent.click(screen.getByRole("button", { name: "специалист-112" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, mode: "operator112" });
  });

  it("без выбранной группы предлагает «Выберите группу»", () => {
    render(<Filters groups={groups} value={{ ...value, groupId: "" }} onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "Выберите группу" })).toBeInTheDocument();
  });
});

describe("Filters: без группы", () => {
  it("showGroup=false скрывает выбор группы, период и режим остаются", () => {
    render(<Filters groups={groups} value={value} onChange={() => {}} showGroup={false} />);
    expect(screen.queryByLabelText("Группа")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Период" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Режим" })).toBeInTheDocument();
  });
});
