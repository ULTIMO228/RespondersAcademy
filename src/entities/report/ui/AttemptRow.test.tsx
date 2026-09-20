import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildAttemptView } from "../lib/buildAttemptView";
import type { AttemptSource } from "../lib/buildAttemptView";
import { AttemptRow } from "./AttemptRow";

const CARD = { cardNumber: "36814852", cardType: "Ребенок в опасности", cardHref: "/arm/card/card-36814852" };

/** att-01 (u-005) и att-03 (u-006) из mocks/sessions.json. */
const OWN_EVENT: AttemptSource = {
  id: "att-01",
  openedAt: "2026-09-16T10:02:14+03:00",
  primaryReactionMs: 14000,
  fullProcessingMs: 178000,
  evaluation: {
    timeScore: 100,
    correctnessScore: 95,
    grammarScore: 100,
    semanticScore: 96,
    totalScore: 98,
    grammarErrors: [],
    errors: [],
    aiComment: "Нормативы соблюдены. Реакция 14 с (норма 30 с), отработка 178 с (норма 180 с).",
  },
};

const FAILED_EVENT: AttemptSource = {
  id: "att-03",
  openedAt: "2026-09-16T10:02:48+03:00",
  primaryReactionMs: 48000,
  fullProcessingMs: 310000,
  evaluation: {
    timeScore: 62,
    correctnessScore: 80,
    grammarScore: 40,
    semanticScore: 85,
    totalScore: 66,
    grammarErrors: [{ fragment: "Сообщение пренято", wrong: "пренято", expected: "принято" }],
    errors: [
      {
        type: "timeReactionExceeded",
        severity: "major",
        message: "Превышен норматив реакции: 48 с (норма 30 с)",
      },
      {
        type: "missedRequiredCall",
        severity: "critical",
        message: "Пропущен ожидаемый звонок руководителю смены (301)",
      },
    ],
    aiComment: "Две орфографические ошибки в ключевом поле — риск искажения смысла.",
  },
};

const ownAttempt = buildAttemptView(OWN_EVENT, CARD);
const failedAttempt = buildAttemptView(FAILED_EVENT, CARD);

function renderRow(attempt = ownAttempt) {
  return render(
    <table>
      <tbody>
        <AttemptRow attempt={attempt} columnCount={7} />
      </tbody>
    </table>,
  );
}

describe("AttemptRow", () => {
  it("рендерит строку попытки из мока", () => {
    renderRow();
    expect(screen.getByText("36814852")).toBeInTheDocument();
    expect(screen.getByText("98")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /реакция: 0:14/ })).toHaveAttribute("data-exceeded", "false");
  });

  it("раскрывает разбор по клику: баллы по критериям и комментарий ИИ с бейджем", () => {
    renderRow();
    const toggle = screen.getByRole("button", { name: /Разбор попытки/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const criteria = screen.getByRole("region", { name: "Баллы по критериям" });
    expect(within(criteria).getByText("Корректность заполнения")).toBeInTheDocument();
    expect(within(criteria).getByText("95")).toBeInTheDocument();
    expect(screen.getByText(/Нормативы соблюдены/)).toBeInTheDocument();
    expect(screen.getAllByText("ИИ").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(toggle);
    expect(screen.queryByText(/Нормативы соблюдены/)).not.toBeInTheDocument();
  });

  it("показывает ошибки и правку преподавателя отдельным блоком", () => {
    renderRow({
      ...failedAttempt,
      teacherOverride: {
        score: 70,
        comment: "Учтена сложность",
        at: "2026-09-16T11:00:00+03:00",
        by: "Морозова Е. С.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Разбор попытки/ }));
    expect(screen.getByText(/Пропущен ожидаемый звонок/)).toBeInTheDocument();
    expect(screen.getByText("критичная")).toHaveAttribute("data-severity", "critical");
    expect(screen.getByText("существенная")).toHaveAttribute("data-severity", "major");
    expect(screen.getByText(/«пренято» → «принято»/)).toBeInTheDocument();
    const override = screen.getByTestId("teacher-override");
    expect(override.className).toContain("breakdown__note--teacher");
    expect(within(override).queryByText("ИИ")).not.toBeInTheDocument();
  });
});
