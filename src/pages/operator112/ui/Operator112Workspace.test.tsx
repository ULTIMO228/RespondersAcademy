import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssignmentDetail, ClassifierEntry, OperatorAttempt } from "@/shared/api";

import { Operator112Result } from "./Operator112Result";
import { Operator112Workspace } from "./Operator112Workspace";

const NOW = Date.parse("2026-09-29T10:00:30+03:00");
const OPENED = "2026-09-29T10:00:00+03:00";

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-100",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: OPENED,
    openedAt: OPENED,
    state: "ringing",
    events: [],
    replays: 0,
    hintsShown: 0,
    audio: {
      cardId: "c-010",
      status: "failed",
      transcript: "Горит балкон",
      voice: "female",
      emergency: true,
    },
    ...overrides,
  };
}

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

const ENTRIES: ClassifierEntry[] = [];

function renderWorkspace(
  attemptOverrides: Partial<OperatorAttempt> = {},
  props: Partial<React.ComponentProps<typeof Operator112Workspace>> = {},
) {
  const sendEvent = vi.fn().mockResolvedValue({});
  const onSubmit = vi.fn();
  render(
    <Operator112Workspace
      assignment={ASSIGNMENT}
      attempt={attempt(attemptOverrides)}
      entries={ENTRIES}
      nowMs={NOW}
      isAnswering={false}
      answerError={null}
      isSubmitting={false}
      errors={{}}
      sendEvent={sendEvent}
      onAnswer={vi.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { sendEvent, onSubmit };
}

const ANSWERED = { state: "answered", answeredAt: "2026-09-29T10:00:05+03:00" } as const;

describe("Operator112Workspace: блокировка до «Принять» (T035)", () => {
  it("до ответа поля, флаги и «Сохранить карточку» недоступны, показана подсказка", () => {
    renderWorkspace();
    expect(screen.getByLabelText("Описание")).toBeDisabled();
    expect(screen.getByLabelText("ФИО")).toBeDisabled();
    expect(screen.getByLabelText("Улица")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Пострадавшие" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить карточку" })).toBeDisabled();
    expect(screen.getByText(/Сначала примите вызов/)).toBeInTheDocument();
  });

  it("парная: после ответа всё то же активно, подсказки нет", () => {
    renderWorkspace(ANSWERED);
    expect(screen.getByLabelText("Описание")).toBeEnabled();
    expect(screen.getByLabelText("ФИО")).toBeEnabled();
    expect(screen.getByLabelText("Улица")).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Пострадавшие" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Сохранить карточку" })).toBeEnabled();
    expect(screen.queryByText(/Сначала примите вызов/)).toBeNull();
  });

  it("во время сохранения кнопка и поля заблокированы", () => {
    renderWorkspace(ANSWERED, { isSubmitting: true });
    expect(screen.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
    expect(screen.getByLabelText("Описание")).toBeDisabled();
  });
});

describe("Operator112Workspace: «Сохранить» и подтверждение оповещения (T035)", () => {
  it("«Сохранить карточку» открывает диалог, а onSubmit не вызывается до подтверждения", () => {
    const { onSubmit } = renderWorkspace(ANSWERED);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить карточку" }));
    expect(screen.getByText("Подтверждение оповещения служб")).toBeInTheDocument();
    expect(screen.getByText("Список оповещения пуст.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("«Вернуться к карточке» закрывает диалог без передачи", () => {
    const { onSubmit } = renderWorkspace(ANSWERED);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить карточку" }));
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к карточке" }));
    expect(screen.queryByText("Подтверждение оповещения служб")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("«Подтвердить и сохранить» передаёт черновик ровно один раз", () => {
    const { onSubmit } = renderWorkspace(ANSWERED);
    fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Горит балкон" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить карточку" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить и сохранить" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ description: "Горит балкон" });
    expect(screen.queryByText("Подтверждение оповещения служб")).toBeNull();
  });

  it("Alt+S открывает тот же диалог; до ответа — не открывает", () => {
    renderWorkspace(ANSWERED);
    fireEvent.keyDown(document, { key: "s", altKey: true });
    expect(screen.getByText("Подтверждение оповещения служб")).toBeInTheDocument();
  });

  it("Alt+S до «Принять» диалог не открывает", () => {
    renderWorkspace();
    fireEvent.keyDown(document, { key: "s", altKey: true });
    expect(screen.queryByText("Подтверждение оповещения служб")).toBeNull();
  });
});

describe("Operator112Workspace: «Нет контакта» и «Срыв звонка» (T035)", () => {
  it("кнопки есть при входящем вызове и шлют события noContact / callDropped", async () => {
    const { sendEvent } = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Нет контакта" }));
    expect(sendEvent).toHaveBeenLastCalledWith({ type: "noContact" });
    expect(await screen.findByText("Зафиксировано: нет контакта")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Срыв звонка" }));
    expect(sendEvent).toHaveBeenLastCalledWith({ type: "callDropped" });
    expect(await screen.findByText("Зафиксирован срыв звонка")).toBeInTheDocument();
  });

  it("ошибка отправки события показывается сообщением", async () => {
    renderWorkspace({}, { sendEvent: vi.fn().mockRejectedValue(new Error("Сервер недоступен")) });
    fireEvent.click(screen.getByRole("button", { name: "Нет контакта" }));
    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
  });
});

describe("Operator112Result: «Закрыть карточку» по статусам (T035)", () => {
  function renderResult(cardStatus: string) {
    const onCardStatus = vi.fn();
    render(
      <Operator112Result
        assignment={ASSIGNMENT}
        result={{ evaluation: null, chainReview: false, cardStatus } as never}
        expired={null}
        nextProblem={null}
        onNext={vi.fn()}
        onCardStatus={onCardStatus}
      />,
    );
    return onCardStatus;
  }

  it("из «Зарегистрирована» доступна только «Отработана», закрыть нельзя", () => {
    renderResult("registered");
    expect(screen.getByRole("button", { name: "Отработана" })).toBeInTheDocument();
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
});
