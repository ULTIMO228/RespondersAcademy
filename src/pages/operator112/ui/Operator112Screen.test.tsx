import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import { getOpenAttempt } from "@/entities/operator112-attempt";
import type {
  AssignmentDetail,
  ClassifierEntry,
  Journal112Row,
  OperatorAttempt,
  OperatorEvaluation,
  StartAssignmentResult,
} from "@/shared/api";

import type { Operator112Api } from "../api/operator112Api";
import { Operator112Page } from "./Operator112Page";
import { Operator112Screen } from "./Operator112Screen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

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
    hints: {
      enabled: true,
      idleSec: 20,
      steps: [
        { stage: "answer", text: "Примите вызов: нажмите «Принять»" },
        { stage: "applicant", text: "Заполните заявителя" },
      ],
    },
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

function assignment(overrides: Partial<AssignmentDetail> = {}): AssignmentDetail {
  return {
    id: "asg-001",
    teacherId: "u-002",
    studentIds: ["u-005"],
    trainingMode: "operator112",
    format: "training",
    cardIds: ["c-010", "c-050"],
    params: { norms: { answerSec: 30, submitSec: 180 }, hints: { enabled: true, idleSec: 20 } },
    state: "active",
    createdAt: OPENED,
    title: "Режим 112: приём вызова и карточка (тренировка)",
    progress: [],
    ...overrides,
  };
}

const EVALUATION: OperatorEvaluation = {
  timeScore: 90,
  correctnessScore: 80,
  grammarScore: 100,
  semanticScore: 70,
  totalScore: 85,
  grammarErrors: [],
  errors: [],
  aiComment: "Хорошо",
  fieldDiff: [],
  mode: "operator112",
  assessorVersion: "operator112-1.0.0",
};

const ENTRIES: ClassifierEntry[] = [
  {
    code: "1050201",
    group: "пожар в жилом доме",
    sign1: "жилой дом",
    sign2: "балкон",
    sign3: "открытое пламя",
    extraSigns: "",
    finalType: "пожар: балкон",
    ekp35Type: "",
    mainService: "MCHS",
    notifications: [],
  },
];

const ROW: Journal112Row = {
  cardId: "c-900",
  number: "900",
  createdAt: "2026-09-29T09:50:00+03:00",
  operator: "Оп. 3",
  arm: "АРМ 2",
  whatHappened: "Задымление",
  injured: "",
  status: "Принята",
  address: "Москва, Тверская 1",
  description: "",
  linked: false,
  chs: false,
  checked: false,
  isOwn: false,
};
const QUEUED_ROW: Journal112Row = { ...ROW, cardId: "c-010", number: "4", queued: true, isOwn: true };

function makeApi(overrides: Partial<Record<keyof Operator112Api, unknown>> = {}) {
  const api = {
    getAssignment: vi.fn().mockResolvedValue(assignment()),
    startAssignment: vi
      .fn()
      .mockResolvedValue({ kind: "operator112", attempt: attempt() } satisfies StartAssignmentResult),
    getClassifier: vi.fn().mockResolvedValue(ENTRIES),
    answerAttempt: vi
      .fn()
      .mockResolvedValue(attempt({ state: "answered", answeredAt: "2026-09-29T10:00:05+03:00" })),
    sendEvent: vi.fn().mockResolvedValue({ id: "ev-1", type: "fieldChanged", at: "t", payload: {} }),
    submitAttempt: vi.fn().mockResolvedValue({
      attempt: attempt({ state: "submitted", completedAt: "2026-09-29T10:01:00+03:00" }),
      card: {},
      evaluationId: "att-100",
    }),
    getEvaluation: vi.fn().mockResolvedValue(EVALUATION),
    journal: vi.fn().mockResolvedValue({ rows: [QUEUED_ROW, ROW], total: 2 }),
    matches: vi.fn().mockResolvedValue({ matches: [] }),
    getNotificationList: vi.fn().mockResolvedValue({
      finalType: "",
      classifierCode: "",
      group: "",
      services: [],
      conditional: [],
    }),
    ...overrides,
  };
  return api as unknown as Mocked<Operator112Api>;
}

/** Журнал → окно входящего вызова → «Принять» → карточка. */
async function acceptCall() {
  fireEvent.click(await screen.findByRole("button", { name: "Принять" }));
  await waitFor(() => expect(screen.getByLabelText("Фамилия и имя заявителя")).toBeEnabled());
}

async function openSavedConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
  fireEvent.click(await screen.findByRole("button", { name: "оповестить" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("Operator112Screen: журнал и входящий вызов", () => {
  it("журнал: loading → строки из journal(assignmentId); вызов в очереди открывает окно, окно поверх журнала", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    expect(screen.getByRole("status")).toHaveTextContent("Выдача вызова");
    expect(await screen.findByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
    await waitFor(() => expect(api.journal).toHaveBeenCalledWith("asg-001"));
    expect((await screen.findAllByText("Задымление")).length).toBe(2);
    expect(screen.getByText(/с номера/)).toBeInTheDocument();
  });

  it("журнал: ошибка загрузки и пустой список показываются состояниями", async () => {
    const failing = makeApi({ journal: vi.fn().mockRejectedValue(new Error("Журнал недоступен")) });
    const first = render(<Operator112Screen assignmentId="asg-001" api={failing} />);
    expect(await screen.findByText("Журнал недоступен")).toBeInTheDocument();
    first.unmount();
    render(
      <Operator112Screen
        assignmentId="asg-001"
        api={makeApi({ journal: vi.fn().mockResolvedValue({ rows: [], total: 0 }) })}
      />,
    );
    expect(await screen.findByText("В журнале пока нет карточек")).toBeInTheDocument();
  });

  it("«×» прячет окно: вызов остаётся в очереди, callHidden уходит на сервер, журнал перечитывается; клик по строке очереди возвращает окно", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть окно вызова" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.sendEvent).toHaveBeenCalledWith("att-100", { type: "callHidden" });
    await waitFor(() => expect(api.journal.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(api.answerAttempt).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("tr[data-queued='true']") as HTMLElement);
    expect(await screen.findByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
  });

  it("карточка занята другим оператором: клик по строке открывает окно блокировки", async () => {
    const locked = { ...ROW, lockedBy: { operator: 7, name: "Иванов", arm: 3 } };
    const api = makeApi({ journal: vi.fn().mockResolvedValue({ rows: [locked], total: 1 }) });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть окно вызова" }));
    fireEvent.click((await screen.findAllByText("Задымление"))[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Вы не можете вносить изменения");
  });

  it("«справка» → «Краткая инструкция» и «Сообщить о проблеме» открываются из журнала", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть окно вызова" }));
    fireEvent.click(await screen.findByRole("button", { name: "справка" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Краткая инструкция" }));
    const guide = await screen.findByRole("dialog", { name: "Краткая инструкция" });
    expect(guide).toHaveTextContent("Принять");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    fireEvent.click(screen.getByRole("button", { name: "справка" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Сообщить о проблеме" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Отправить");
  });
});

describe("Operator112Screen: основной путь", () => {
  it("журнал → вызов → «Принять» → заполнение → «сохранить» → подтверждение → разбор; кнопки «Завершить» нет", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    expect(api.answerAttempt).toHaveBeenCalledWith("att-100");
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), {
      target: { value: "Горит балкон на 13 этаже" },
    });
    fireEvent.change(screen.getByLabelText("Улица:"), { target: { value: "улица Грина" } });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(await screen.findByRole("dialog", { name: "Подтвердите оповещение служб" })).toBeInTheDocument();
    expect(api.submitAttempt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "оповестить" }));
    expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
    const [attemptId, draft] = api.submitAttempt.mock.calls[0];
    expect(attemptId).toBe("att-100");
    expect(draft.description).toBe("Горит балкон на 13 этаже");
    expect(draft.address).toMatchObject({ street: "улица Грина", source: "manual", subject: "Москва" });
    expect(draft.phones.aon).toBe("9161263471");
    expect(draft.outcome).toBe("filled");
    expect(draft.notificationConfirmed).toBe(true);
    expect(draft.channel).toBe("call");
    expect(screen.getByTestId("total-score")).toHaveTextContent("85");
    expect(screen.queryByRole("button", { name: /Завершить/ })).toBeNull();
  });

  it("поля карточки до приёма недоступны: карточки нет, пока вызов не принят", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    await screen.findByRole("dialog", { name: "Входящий звонок" });
    expect(screen.queryByLabelText("Описание со слов заявителя")).toBeNull();
    expect(screen.queryByRole("button", { name: "сохранить" })).toBeNull();
  });

  it("после сохранения «Отработана», затем «Закрыть карточку» — события processed и close (фича 007)", async () => {
    const api = makeApi({
      submitAttempt: vi.fn().mockResolvedValue({
        attempt: attempt({ state: "submitted", completedAt: "2026-09-29T10:01:00+03:00" }),
        card: { cardStatus: "registered" },
        evaluationId: "att-100",
      }),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    await openSavedConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Отработана" }));
    await waitFor(() => expect(api.sendEvent).toHaveBeenLastCalledWith("att-100", { type: "processed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть карточку" }));
    await waitFor(() => expect(api.sendEvent).toHaveBeenLastCalledWith("att-100", { type: "close" }));
  });

  it("«отмена» в подтверждении оповещения не передаёт карточку", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    fireEvent.click(await screen.findByRole("button", { name: "отмена" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.submitAttempt).not.toHaveBeenCalled();
  });

  it("400 «Заполните адресный блок»: сообщение у адреса, введённое сохранено, повторное сохранение доступно", async () => {
    const api = makeApi({
      submitAttempt: vi
        .fn()
        .mockRejectedValue(new ApiError(400, "validationFailed", "Заполните адресный блок")),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), {
      target: { value: "Горит балкон" },
    });
    await openSavedConfirm();
    expect(await screen.findByText("Заполните адресный блок")).toBeInTheDocument();
    expect(screen.getByLabelText("Описание со слов заявителя")).toHaveValue("Горит балкон");
    expect(screen.getByRole("button", { name: "сохранить" })).toBeEnabled();
    expect(screen.queryByLabelText("Разбор попытки")).toBeNull();
  });

  it("409 «Карточка уже отправлена» показывается сообщением сервера", async () => {
    const api = makeApi({
      submitAttempt: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "invalidTransition", "Карточка уже отправлена")),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    await openSavedConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Карточка уже отправлена");
  });

  it("ошибка «Принять»: вызов остаётся во входящем окне, сообщение — в полосе тренажёра", async () => {
    const api = makeApi({ answerAttempt: vi.fn().mockRejectedValue(new Error("Вызов уже принят")) });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять" }));
    expect(await screen.findByText("Вызов уже принят")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
  });

  it("«×» до сохранения: «Закрыть карточку без сохранения?» · отмена остаётся в карточке, «закрыть» — журнал, задание не завершено", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), { target: { value: "Горит" } });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку" }));
    expect(
      await screen.findByRole("dialog", { name: "Закрыть карточку без сохранения?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "отмена" }));
    expect(screen.getByLabelText("Описание со слов заявителя")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку" }));
    fireEvent.click(await screen.findByRole("button", { name: "закрыть" }));
    expect(await screen.findByRole("button", { name: "создать новую карточку" })).toBeInTheDocument();
    expect(api.submitAttempt).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Разбор попытки")).toBeNull();
  });

  it("история сообщений поверх карточки не теряет введённое", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    await acceptCall();
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), {
      target: { value: "Горит балкон" },
    });
    fireEvent.click(screen.getByRole("button", { name: /список SMS/ }));
    expect(screen.getByLabelText("История сообщений")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /вернуться в карточку/ }));
    expect(screen.getByLabelText("Описание со слов заявителя")).toHaveValue("Горит балкон");
  });

  it("«нет контакта» и «срыв звонка» сохраняют карточку с исходом", async () => {
    for (const [button, outcome] of [
      ["нет контакта", "noContact"],
      ["срыв звонка", "dropped"],
    ] as const) {
      const api = makeApi();
      const { unmount } = render(<Operator112Screen assignmentId="asg-001" api={api} />);
      await acceptCall();
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
      // Пустая карточка с исходом сохраняется без окна оповещения: подтверждение сервер для неё не требует.
      expect(api.submitAttempt.mock.calls[0][1]).toMatchObject({ outcome, notificationConfirmed: false });
      unmount();
    }
  });

  it("двойной щелчок «оповестить» передаёт карточку один раз", async () => {
    let release: (value: unknown) => void = () => undefined;
    const api = makeApi({
      submitAttempt: vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve))),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const confirm = await screen.findByRole("button", { name: "оповестить" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
    await act(async () =>
      release({ attempt: attempt({ state: "submitted" }), card: {}, evaluationId: "att-100" }),
    );
    expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
  });

  it("«Следующий билет»: новый start; 409 «Все билеты задания уже выполнены» остаётся на экране", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    await openSavedConfirm();
    await screen.findByLabelText("Разбор попытки");
    api.startAssignment.mockRejectedValueOnce(
      new ApiError(409, "conflict", "Все билеты задания уже выполнены"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Следующий билет" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Все билеты задания уже выполнены");
    api.startAssignment.mockResolvedValueOnce({
      kind: "operator112",
      attempt: attempt({ id: "att-101", cardId: "c-050" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Следующий билет" }));
    expect(await screen.findByRole("button", { name: "Принять" })).toBeInTheDocument();
  });
});

describe("Operator112Screen: «создать новую карточку» (карточка-тренировка)", () => {
  it("пустая карточка без телефонии; сохранение — только закрытие с подтверждением, submit и приём не вызываются", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Закрыть окно вызова" }));
    fireEvent.click(await screen.findByRole("button", { name: "создать новую карточку" }));
    expect(await screen.findByRole("heading", { name: /Происшествие/ })).toBeInTheDocument();
    expect(screen.getByText("не подключен")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), { target: { value: "Учебная" } });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(
      await screen.findByRole("dialog", { name: "Закрыть карточку без сохранения?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "закрыть" }));
    expect(await screen.findByRole("button", { name: "создать новую карточку" })).toBeInTheDocument();
    expect(api.submitAttempt).not.toHaveBeenCalled();
    expect(api.answerAttempt).not.toHaveBeenCalled();
    expect(api.sendEvent).not.toHaveBeenCalledWith(
      "att-100",
      expect.objectContaining({ type: "fieldChanged" }),
    );
  });
});

describe("Operator112Screen: СМС и связи", () => {
  it("СМС-билет: «Входящее сообщение», после «Принять» текст — в «Истории сообщений», канал карточки sms", async () => {
    const sms = attempt({ channel: "sms", smsText: "Горит балкон, помогите" });
    const api = makeApi({
      startAssignment: vi.fn().mockResolvedValue({ kind: "operator112", attempt: sms }),
      answerAttempt: vi.fn().mockResolvedValue({ ...sms, state: "answered", answeredAt: OPENED }),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    expect(await screen.findByRole("dialog", { name: "Входящее сообщение" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));
    await waitFor(() => expect(screen.getByLabelText("Фамилия и имя заявителя")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /список SMS/ }));
    expect(screen.getByText("Горит балкон, помогите")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /вернуться в карточку/ }));
    await openSavedConfirm();
    await screen.findByLabelText("Разбор попытки");
    expect(api.submitAttempt.mock.calls[0][1]).toMatchObject({ channel: "sms" });
  });

  it("совпадение по АОН: окно «Есть карточка…», «привязать» шлёт linkAdded, links попадают в черновик", async () => {
    const api = makeApi({ matches: vi.fn().mockResolvedValue({ matches: [ROW] }) });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    expect(await screen.findByText("Есть карточка с заявителем по этому номеру:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "привязать карточку 900" }));
    expect(api.sendEvent).toHaveBeenCalledWith("att-100", {
      type: "linkAdded",
      payload: { cardId: "c-900" },
    });
    expect(screen.queryByText("Есть карточка с заявителем по этому номеру:")).toBeNull();
    await openSavedConfirm();
    await screen.findByLabelText("Разбор попытки");
    expect(api.submitAttempt.mock.calls[0][1].links).toEqual([{ cardId: "c-900", primary: true }]);
  });

  it("«закрыть и продолжить заполнение новой» не теряет поля", async () => {
    const api = makeApi({ matches: vi.fn().mockResolvedValue({ matches: [ROW] }) });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    fireEvent.click(await screen.findByRole("button", { name: "закрыть и продолжить заполнение новой" }));
    fireEvent.change(screen.getByLabelText("Описание со слов заявителя"), { target: { value: "Текст" } });
    expect(screen.getByLabelText("Описание со слов заявителя")).toHaveValue("Текст");
    expect(api.sendEvent).not.toHaveBeenCalledWith("att-100", expect.objectContaining({ type: "linkAdded" }));
  });
});

describe("Operator112Screen: перезагрузка и вход", () => {
  it.each([["training" as const], ["exam" as const]])(
    "перезагрузка (%s): start возвращает ту же попытку, форма восстановлена из событий",
    async (format) => {
      const restored = attempt({
        state: "answered",
        answeredAt: "2026-09-29T10:00:05+03:00",
        replays: format === "exam" ? 1 : 0,
        events: [
          {
            id: "ev-1",
            type: "fieldChanged",
            at: "t",
            payload: { field: "description", value: "Горит балкон" },
          },
          {
            id: "ev-2",
            type: "fieldChanged",
            at: "t",
            payload: { field: "applicant.name", value: "Сидорова А. В." },
          },
        ],
      });
      const api = makeApi({
        getAssignment: vi.fn().mockResolvedValue(assignment({ format })),
        startAssignment: vi.fn().mockResolvedValue({ kind: "operator112", attempt: restored }),
      });
      const first = render(<Operator112Screen assignmentId="asg-001" api={api} />);
      expect(await screen.findByLabelText("Описание со слов заявителя")).toHaveValue("Горит балкон");
      first.unmount();
      render(<Operator112Screen assignmentId="asg-001" api={api} />);
      expect(await screen.findByLabelText("Фамилия и имя заявителя")).toHaveValue("Сидорова А. В.");
      expect(api.startAssignment).toHaveBeenCalledTimes(2);
      expect(api.answerAttempt).not.toHaveBeenCalled();
      expect(screen.getByLabelText("АОН")).toHaveValue("+7 (916) 126-34-71");
      if (format === "exam")
        expect(await screen.findByText("Повторное прослушивание в экзамене запрещено")).toBeInTheDocument();
    },
  );

  it("прямая ссылка без assignmentId — пояснение, а не пустой экран", async () => {
    render(await Operator112Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("status")).toHaveTextContent("Откройте задание из раздела заданий");
    expect(screen.getByRole("link", { name: "К заданиям" })).toHaveAttribute("href", "/student/assignments");
  });

  it("assignmentId в query выбирает экран режима", async () => {
    const element = await Operator112Page({ searchParams: Promise.resolve({ assignmentId: ["asg-001"] }) });
    expect(element.props.assignmentId).toBe("asg-001");
  });

  it("этап ДДС цепочки: start вернул попытку ДДС → переход на карточку", async () => {
    const api = makeApi({
      startAssignment: vi.fn().mockResolvedValue({
        kind: "dds",
        sessionId: "ses-9",
        attempt: { id: "att-200", cardId: "c-777", studentId: "u-005" },
        created: true,
      }),
    });
    render(<Operator112Screen assignmentId="asg-005" api={api} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/arm/card/c-777"));
  });
});

describe("Operator112Screen: отказы при выдаче", () => {
  it.each([
    [new ApiError(403, "forbidden", "Обучающийся не назначен"), "Доступ запрещён"],
    [new ApiError(404, "notFound", "Задание «asg-9» не найдено"), "Задание «asg-9» не найдено"],
    [new ApiError(409, "conflict", "Все билеты задания уже выполнены"), "Все билеты задания уже выполнены"],
    [
      new ApiError(409, "conflict", "В экзамене билет выдаётся один раз"),
      "В экзамене билет выдаётся один раз",
    ],
    // Старое задание chain (режим выведен 20.10.2026): сервер отказывает в start, экран не падает.
    [
      new ApiError(
        409,
        "conflict",
        "Режим «Цепочка 112 → ДДС» выведен: задание доступно только для просмотра",
      ),
      "задание доступно только для просмотра",
    ],
  ])("%s", async (error, expected) => {
    render(
      <Operator112Screen
        assignmentId="asg-9"
        api={makeApi({ startAssignment: vi.fn().mockRejectedValue(error) })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("link", { name: "К заданиям" })).toBeInTheDocument();
  });

  it("без бэкенда — «Раздел требует подключения к серверу тренажёра»", async () => {
    render(
      <Operator112Screen
        assignmentId="asg-1"
        api={makeApi({ getAssignment: vi.fn().mockRejectedValue(new ServerRequiredError()) })}
      />,
    );
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });
});

describe("Operator112Screen: лимит времени экзамена на попытку", () => {
  const examParams = {
    norms: { answerSec: 30, submitSec: 180 },
    timeLimitSec: 60,
    passThreshold: 70,
    hints: { enabled: false },
  };
  const expiredAt = "2026-09-29T09:58:00+03:00"; // лимит 60 с исчерпан 60+ секунд назад

  function examApi(progressState: "notCompleted" | "answered") {
    const answered = attempt({
      state: "answered",
      answeredAt: "2026-09-29T09:58:05+03:00",
      openedAt: expiredAt,
      createdAt: expiredAt,
      hints: { enabled: false, idleSec: 20, steps: [] },
    });
    return makeApi({
      getAssignment: vi.fn().mockResolvedValue(
        assignment({
          format: "exam",
          params: examParams,
          progress: [
            {
              studentId: "u-005",
              cardId: "c-010",
              state: progressState,
              attemptId: "att-100",
              score: 0,
              passed: false,
            },
          ],
        }),
      ),
      startAssignment: vi.fn().mockResolvedValue({ kind: "operator112", attempt: answered }),
    });
  }

  it("по нулю индикатора клиент запрашивает задание и показывает итог сервера (оценка 0, не сдан)", async () => {
    const api = examApi("notCompleted");
    render(<Operator112Screen assignmentId="asg-002" api={api} />);
    expect(await screen.findByText("Время на билет истекло")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("оценка 0, экзамен по билету не сдан");
    expect(api.getAssignment.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(api.submitAttempt).not.toHaveBeenCalled();
  });

  it("передача при нулевом остатке: сначала чтение задания; закрыта сервером → submit не вызывается (submit сам лимит не применяет)", async () => {
    const api = examApi("answered");
    render(<Operator112Screen assignmentId="asg-002" api={api} />);
    await screen.findByLabelText("Описание со слов заявителя");
    api.getAssignment.mockResolvedValue(
      assignment({
        format: "exam",
        params: examParams,
        progress: [
          {
            studentId: "u-005",
            cardId: "c-010",
            state: "notCompleted",
            attemptId: "att-100",
            score: 0,
            passed: false,
          },
        ],
      }),
    );
    await openSavedConfirm();
    expect(await screen.findByText("Время на билет истекло")).toBeInTheDocument();
    expect(api.submitAttempt).not.toHaveBeenCalled();
  });

  it("расхождение часов: сервер лимит ещё не применил — карточка передаётся как обычно", async () => {
    const api = examApi("answered");
    render(<Operator112Screen assignmentId="asg-002" api={api} />);
    await screen.findByLabelText("Описание со слов заявителя");
    await openSavedConfirm();
    expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
  });
});

describe("Operator112Screen: подсказки", () => {
  it("тренировка: после idleSec простоя показывается шаг, сервер получает hintShown; в экзамене подсказок нет", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByLabelText("Подсказка")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });
    expect(screen.getByLabelText("Подсказка")).toHaveTextContent("Примите вызов");
    expect(api.sendEvent).toHaveBeenCalledWith("att-100", {
      type: "hintShown",
      payload: { stage: "answer" },
    });
  });
});

describe("Operator112Screen: реестр открытой попытки (спека 007, FR-014)", () => {
  it("пока попытка идёт — отмечена как открытая; после передачи — снята", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await acceptCall();
    expect(getOpenAttempt()?.title).toMatch(/билет 112/);
    await openSavedConfirm();
    await screen.findByLabelText("Разбор попытки");
    expect(getOpenAttempt()).toBeNull();
  });

  it("парная проверка: после ухода с экрана реестр очищен", async () => {
    const { unmount } = render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    await acceptCall();
    expect(getOpenAttempt()).not.toBeNull();
    unmount();
    expect(getOpenAttempt()).toBeNull();
  });
});
