import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Evaluation } from "@/shared/api";

import { EvaluationDetails } from "./EvaluationDetails";

const base: Evaluation = {
  timeScore: 80,
  correctnessScore: 80,
  grammarScore: 80,
  semanticScore: 80,
  totalScore: 80,
  grammarErrors: [],
  errors: [],
  aiComment: "Разбор выполнен.",
};

describe("EvaluationDetails", () => {
  it("показывает источник комментария по фактическому полю", () => {
    render(<EvaluationDetails evaluation={{ ...base, aiCommentSource: "cloud" }} />);

    expect(screen.getByText("ИИ · облако")).toBeInTheDocument();
    expect(screen.getByText(base.aiComment)).toBeInTheDocument();
  });

  it("старые данные без источника помечает как шаблон", () => {
    render(<EvaluationDetails evaluation={base} />);

    expect(screen.getByText("шаблон")).toBeInTheDocument();
  });
});
