import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuestionnaireChips } from "./QuestionnaireChips";

describe("QuestionnaireChips", () => {
  it("рендерит вопросы и выбранные чипы read-only", () => {
    render(
      <QuestionnaireChips
        groups={[{ question: "112-Признак.1", options: ["Дом", "Улица"], selected: ["Дом"] }]}
      />,
    );
    expect(screen.getByText("112-Признак.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Дом" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Улица" })).toBeDisabled();
  });

  it("пустая карта — пометка", () => {
    render(<QuestionnaireChips groups={[]} />);
    expect(screen.getByText("Опросная карта не заполнена")).toBeInTheDocument();
  });
});
