import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssignmentDetail } from "@/shared/api";

import { Operator112Result } from "./Operator112Result";

const OPENED = "2026-09-29T10:00:00+03:00";

const ASSIGNMENT: AssignmentDetail = {
  id: "asg-001",
  teacherId: "u-002",
  studentIds: ["u-005"],
  trainingMode: "operator112",
  format: "training",
  cardIds: ["c-010"],
  params: { norms: { answerSec: 30, submitSec: 180 } },
  state: "active",
  createdAt: OPENED,
  title: "Режим 112",
  progress: [],
};

describe("Operator112Result: «Отработана» и «Закрыть карточку» по статусам карточки (спека 007, T035)", () => {
  function renderResult(cardStatus: string) {
    const onCardStatus = vi.fn();
    render(
      <Operator112Result
        assignment={ASSIGNMENT}
        result={{ evaluation: null, cardStatus } as never}
        expired={null}
        nextProblem={null}
        onNext={vi.fn()}
        onCardStatus={onCardStatus}
      />,
    );
    return onCardStatus;
  }

  it("из «Зарегистрирована» доступна только «Отработана», закрыть нельзя", () => {
    const onCardStatus = renderResult("registered");
    fireEvent.click(screen.getByRole("button", { name: "Отработана" }));
    expect(onCardStatus).toHaveBeenCalledWith("processed");
    expect(screen.queryByRole("button", { name: "Закрыть карточку" })).toBeNull();
  });

  it.each(["processed", "completed"])("из «%s» закрытие доступно и шлёт close", (status) => {
    const onCardStatus = renderResult(status);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку" }));
    expect(onCardStatus).toHaveBeenCalledWith("close");
    expect(screen.queryByRole("button", { name: "Отработана" })).toBeNull();
  });

  it("после закрытия («closed») обе кнопки скрыты", () => {
    renderResult("closed");
    expect(screen.queryByRole("button", { name: "Закрыть карточку" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отработана" })).toBeNull();
  });

  it("«Следующий билет» без диалога смены зоны: цепочка 112 → ДДС выведена", () => {
    const onNext = vi.fn();
    render(
      <Operator112Result
        assignment={ASSIGNMENT}
        result={{ evaluation: null, cardStatus: "closed" } as never}
        expired={null}
        nextProblem={null}
        onNext={onNext}
        onCardStatus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Следующий билет" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
