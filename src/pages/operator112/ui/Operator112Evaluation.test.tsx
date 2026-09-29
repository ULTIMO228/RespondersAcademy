import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OperatorEvaluation } from "@/shared/api";

import { Operator112Evaluation } from "./Operator112Evaluation";

function evaluation(overrides: Partial<OperatorEvaluation> = {}): OperatorEvaluation {
  return {
    timeScore: 90,
    correctnessScore: 80,
    grammarScore: 100,
    semanticScore: 70,
    totalScore: 85,
    grammarErrors: [],
    errors: [],
    aiComment: "Адрес указан верно, не уточнён этаж",
    fieldDiff: [
      { field: "address.street", entered: "ул. Грина", expected: "ул. Грина", ok: true },
      { field: "what.signs", entered: ["балкон"], expected: ["балкон", "открытое пламя"], ok: false },
    ],
    mode: "operator112",
    assessorVersion: "operator112-1.0.0",
    ...overrides,
  };
}

describe("Operator112Evaluation", () => {
  it("тренировка: балл и составляющие, без «сдан/не сдан», бейдж «ИИ» у комментария", () => {
    render(<Operator112Evaluation evaluation={evaluation()} format="training" />);
    expect(screen.getByTestId("total-score")).toHaveTextContent("85");
    const components = within(screen.getByRole("list", { name: "Составляющие оценки" }));
    expect(components.getByText("Время").nextSibling).toHaveTextContent("90");
    expect(components.getByText("Смысл").nextSibling).toHaveTextContent("70");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Адрес указан верно, не уточнён этаж")).toBeInTheDocument();
    expect(screen.getByLabelText(/^ИИ:/)).toBeInTheDocument();
    expect(screen.getByText("Оценщик: operator112-1.0.0")).toBeInTheDocument();
  });

  it("экзамен: «Сдан»/«Не сдан» по passed с порогом задания", () => {
    const { rerender } = render(
      <Operator112Evaluation evaluation={evaluation({ passed: true })} format="exam" passThreshold={70} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Сдан (порог 70)");
    rerender(
      <Operator112Evaluation evaluation={evaluation({ passed: false })} format="exam" passThreshold={70} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Не сдан (порог 70)");
  });

  it("экзамен без passed (порога нет) вердикта не показывает", () => {
    render(<Operator112Evaluation evaluation={evaluation()} format="exam" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("таблица сличения: совпало ✓, не совпало ✗, массивы через запятую", () => {
    render(<Operator112Evaluation evaluation={evaluation()} format="training" />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText("совпадает")).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText("не совпадает")).toBeInTheDocument();
    expect(within(rows[1]).getByText("балкон, открытое пламя")).toBeInTheDocument();
  });

  it("пустой список ошибок и пустое сличение — понятные пустые состояния", () => {
    render(<Operator112Evaluation evaluation={evaluation({ fieldDiff: [] })} format="training" />);
    expect(screen.getByText("Ошибок не найдено")).toBeInTheDocument();
    expect(screen.getByText("Различий не зафиксировано")).toBeInTheDocument();
  });

  it("ошибки — одной строкой с критичностью; грамматика — «было → стало»", () => {
    render(
      <Operator112Evaluation
        evaluation={evaluation({
          errors: [{ type: "missingService", severity: "major", message: "Не добавлена служба 103" }],
          grammarErrors: [{ wrong: "ложить", expected: "класть" }],
        })}
        format="training"
      />,
    );
    expect(screen.getByText("Не добавлена служба 103 (существенная)")).toBeInTheDocument();
    expect(screen.getByText("Грамматика: «ложить» → «класть»")).toBeInTheDocument();
  });
});
