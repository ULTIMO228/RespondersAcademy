import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type {
  AssignmentDetail,
  ClassifierEntry,
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
        { stage: "answer", text: "Примите вызов: нажмите «Ответить»" },
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
    ...overrides,
  };
  return api as unknown as Mocked<Operator112Api>;
}

async function answerCall() {
  fireEvent.click(await screen.findByRole("button", { name: "Ответить на вызов" }));
  await waitFor(() => expect(screen.getByLabelText("Описание")).toBeEnabled());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  replace.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("Operator112Screen: основной путь", () => {
  it("выдача → «Ответить» → заполнение → передача → разбор; кнопки «Завершить» нет", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    expect(screen.getByRole("status")).toHaveTextContent("Выдача вызова");
    await answerCall();
    expect(api.answerAttempt).toHaveBeenCalledWith("att-100");
    fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Горит балкон на 13 этаже" } });
    fireEvent.change(screen.getByLabelText("Улица"), { target: { value: "улица Грина" } });
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
    expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
    const [attemptId, draft] = api.submitAttempt.mock.calls[0];
    expect(attemptId).toBe("att-100");
    expect(draft.description).toBe("Горит балкон на 13 этаже");
    expect(draft.address).toMatchObject({
      street: "улица Грина",
      source: "manual",
      formal: "Москва, улица Грина",
    });
    expect(draft.phones.aon).toBe("9161263471");
    expect(screen.getByTestId("total-score")).toHaveTextContent("85");
    expect(screen.queryByRole("button", { name: /Завершить/ })).toBeNull();
  });

  it("поля недоступны до ответа, передача — тоже", async () => {
    render(<Operator112Screen assignmentId="asg-001" api={makeApi()} />);
    expect(await screen.findByLabelText("Описание")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Передать карточку" })).toBeDisabled();
    expect(screen.getByText(/Сначала примите вызов/)).toBeInTheDocument();
  });

  it("400 «Заполните адресный блок»: сообщение у адреса, введённое сохранено, повторная передача доступна", async () => {
    const api = makeApi({
      submitAttempt: vi
        .fn()
        .mockRejectedValue(new ApiError(400, "validationFailed", "Заполните адресный блок")),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await answerCall();
    fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Горит балкон" } });
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
    expect(await screen.findByText("Заполните адресный блок")).toBeInTheDocument();
    expect(screen.getByLabelText("Описание")).toHaveValue("Горит балкон");
    expect(screen.getByRole("button", { name: "Передать карточку" })).toBeEnabled();
    expect(screen.queryByLabelText("Разбор попытки")).toBeNull();
  });

  it("409 «Карточка уже отправлена» показывается сообщением сервера", async () => {
    const api = makeApi({
      submitAttempt: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "invalidTransition", "Карточка уже отправлена")),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await answerCall();
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Карточка уже отправлена");
  });

  it("двойной щелчок «Передать» отправляет карточку один раз", async () => {
    let release: (value: unknown) => void = () => undefined;
    const api = makeApi({
      submitAttempt: vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve))),
    });
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await answerCall();
    const submit = screen.getByRole("button", { name: "Передать карточку" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(api.submitAttempt).toHaveBeenCalledTimes(1);
    await act(async () =>
      release({ attempt: attempt({ state: "submitted" }), card: {}, evaluationId: "att-100" }),
    );
    expect(await screen.findByLabelText("Разбор попытки")).toBeInTheDocument();
  });

  it("«Следующий билет»: новый start; 409 «Все билеты задания уже выполнены» остаётся на экране", async () => {
    const api = makeApi();
    render(<Operator112Screen assignmentId="asg-001" api={api} />);
    await answerCall();
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
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
    expect(await screen.findByRole("button", { name: "Ответить на вызов" })).toBeInTheDocument();
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
      expect(await screen.findByLabelText("Описание")).toHaveValue("Горит балкон");
      first.unmount();
      render(<Operator112Screen assignmentId="asg-001" api={api} />);
      expect(await screen.findByLabelText("ФИО")).toHaveValue("Сидорова А. В.");
      expect(api.startAssignment).toHaveBeenCalledTimes(2);
      expect(api.answerAttempt).not.toHaveBeenCalled();
      expect(screen.getByText("9161263471")).toBeInTheDocument();
      if (format === "exam")
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Повторное прослушивание в экзамене запрещено",
        );
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
    await screen.findByLabelText("Описание");
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
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
    expect(await screen.findByText("Время на билет истекло")).toBeInTheDocument();
    expect(api.submitAttempt).not.toHaveBeenCalled();
  });

  it("расхождение часов: сервер лимит ещё не применил — карточка передаётся как обычно", async () => {
    const api = examApi("answered");
    render(<Operator112Screen assignmentId="asg-002" api={api} />);
    await screen.findByLabelText("Описание");
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
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

describe("Operator112Screen: цепочка 112 → ДДС", () => {
  const CHAIN_MESSAGES = [
    "Вход ДДС ожидает проверки и подтверждения преподавателем",
    "Сначала сохраните карточку режима 112",
    "Сохранённая карточка изменилась после подтверждения ДДС",
    "Цепочка A → B уже завершена",
    "Цепочке A → B не назначена утверждённая версия operator112",
  ];

  async function submitChain(api: ReturnType<typeof makeApi>) {
    api.submitAttempt.mockResolvedValue({
      attempt: attempt({ state: "submitted", completedAt: "2026-09-29T10:01:00+03:00" }),
      card: {} as never,
      evaluationId: "att-100",
      chainReview: { scenarioId: "ais-001", version: 2, cardId: "c-777" },
    });
    render(<Operator112Screen assignmentId="asg-011" api={api} />);
    await answerCall();
    fireEvent.click(screen.getByRole("button", { name: "Передать карточку" }));
    await screen.findByLabelText("Разбор попытки");
  }

  it("после передачи этапа A: «ожидает подтверждения преподавателем» и кнопка «Начать этап ДДС» вместо «Следующего билета»", async () => {
    const api = makeApi();
    await submitChain(api);
    expect(screen.getByText(/Этап ДДС ожидает проверки и подтверждения преподавателем/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Начать этап ДДС" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Следующий билет" })).toBeNull();
  });

  it.each(CHAIN_MESSAGES.map((message) => [message]))(
    "409 при повторном start: причина «%s» показана дословно",
    async (message) => {
      const api = makeApi();
      await submitChain(api);
      api.startAssignment.mockRejectedValueOnce(new ApiError(409, "conflict", message));
      fireEvent.click(screen.getByRole("button", { name: "Начать этап ДДС" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it("после подтверждения start возвращает попытку ДДС → открывается /arm/card/{cardId}", async () => {
    const api = makeApi();
    await submitChain(api);
    api.startAssignment.mockResolvedValueOnce({
      kind: "dds",
      sessionId: "ses-1",
      attempt: { id: "att-200", cardId: "c-777", studentId: "u-005" } as never,
      created: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Начать этап ДДС" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/arm/card/c-777"));
  });
});
