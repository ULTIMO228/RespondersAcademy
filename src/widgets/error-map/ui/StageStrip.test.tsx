import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ErrorMapStage, ErrorMapStageLevel } from "@/shared/api";

import { StageStrip } from "./StageStrip";

const stages: ErrorMapStage[] = [
  { id: "b", order: 2, title: "Адрес" },
  { id: "a", order: 1, title: "Приём вызова" },
  { id: "c", order: 3, title: "Службы" },
  { id: "d", order: 4, title: "Итог" },
];

function level(stageId: string, kind: ErrorMapStageLevel["level"], withError: number): ErrorMapStageLevel {
  return {
    stageId,
    attempts: 10,
    attemptsWithError: withError,
    share: kind === "noData" ? null : withError / 10,
    level: kind,
    affectedStudents: 1,
  };
}

const levels = [
  level("a", "rare", 0),
  level("b", "sometimes", 2),
  level("c", "often", 5),
  level("d", "noData", 0),
];

describe("StageStrip", () => {
  it("показывает этапы по порядку, у каждой плитки название, слово уровня и значок", () => {
    render(<StageStrip stages={stages} levels={levels} onSelect={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => within(b).getByText(/^(Приём вызова|Адрес|Службы|Итог)$/).textContent)).toEqual(
      ["Приём вызова", "Адрес", "Службы", "Итог"],
    );
    expect(within(buttons[0]).getByText("редко")).toBeInTheDocument();
    expect(within(buttons[1]).getByText("иногда")).toBeInTheDocument();
    expect(within(buttons[2]).getByText("часто")).toBeInTheDocument();
    expect(buttons[0].textContent).toContain("✓");
    expect(buttons[1].textContent).toContain("~");
    expect(buttons[2].textContent).toContain("!");
  });

  it("серая плитка подписана «мало данных» и значком", () => {
    render(<StageStrip stages={stages} levels={levels} onSelect={() => {}} />);
    const tile = screen.getByRole("button", { name: /Итог/ });
    expect(within(tile).getByText("мало данных")).toBeInTheDocument();
    expect(tile.textContent).toContain("○");
  });

  it("этап без записи уровня считается «мало данных»", () => {
    render(<StageStrip stages={stages} levels={[]} onSelect={() => {}} />);
    expect(screen.getAllByText("мало данных")).toHaveLength(4);
  });

  it("aria-label плитки содержит название и уровень; значок скрыт от чтения", () => {
    const { container } = render(<StageStrip stages={stages} levels={levels} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /^Службы: часто/ })).toBeInTheDocument();
    expect(container.querySelectorAll('button [aria-hidden="true"]').length).toBe(4);
  });

  it("плитка доступна с клавиатуры: нативная кнопка в порядке табуляции, клик вызывает onSelect", () => {
    const onSelect = vi.fn();
    render(<StageStrip stages={stages} levels={levels} onSelect={onSelect} />);
    const first = screen.getByRole("button", { name: /^Приём вызова/ });
    expect(first.tagName).toBe("BUTTON");
    expect(first).not.toHaveAttribute("tabindex", "-1");
    first.focus();
    expect(first).toHaveFocus();
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: /^Адрес/ }));
    expect(onSelect).toHaveBeenLastCalledWith("b");
  });

  it("выбранная плитка помечена aria-pressed", () => {
    render(<StageStrip stages={stages} levels={levels} selectedStageId="c" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /^Службы/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Адрес/ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("StageStrip: связанные этапы", () => {
  it("помечает связанные этапы словами, а не только рамкой", () => {
    render(
      <StageStrip
        stages={stages}
        levels={levels}
        onSelect={vi.fn()}
        selectedStageId="a"
        highlightedStageIds={["b"]}
      />,
    );
    expect(screen.getAllByText("связан с выбранным")).toHaveLength(1);
  });
});

describe("StageStrip: сравнение с группой", () => {
  it("подписывает плитки словами сравнения; у «мало данных» сравнения нет", () => {
    const compared = [
      { ...level("a", "rare", 0), comparison: "better" as const },
      { ...level("b", "sometimes", 2), comparison: "same" as const },
      { ...level("c", "often", 5), comparison: "worse" as const },
      { ...level("d", "noData", 0), comparison: "better" as const },
    ];
    render(<StageStrip stages={stages} levels={compared} onSelect={vi.fn()} />);
    expect(screen.getByText("лучше группы")).toBeInTheDocument();
    expect(screen.getByText("как у группы")).toBeInTheDocument();
    expect(screen.getByText("хуже группы")).toBeInTheDocument();
    expect(screen.getAllByText(/группы$/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: /^Службы: часто.*хуже группы$/ })).toBeInTheDocument();
  });

  it("карта группы без comparison не получает подписей сравнения", () => {
    render(<StageStrip stages={stages} levels={levels} onSelect={vi.fn()} />);
    expect(screen.queryByText(/группы$/)).not.toBeInTheDocument();
  });
});
