import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import type {
  AssignmentDetail,
  CardDraft,
  OperatorAttempt,
  OperatorEvaluation,
  StartAssignmentResult,
} from "@/shared/api";

import type { Operator112Api } from "../api/operator112Api";
import { operator112Title, useOperator112 } from "./useOperator112";

const OPENED = "2026-09-29T10:00:00+03:00";
const ANSWERED = "2026-09-29T10:00:05+03:00";

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
    cardIds: ["c-010"],
    params: {},
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
  aiComment: "",
  fieldDiff: [],
  mode: "training",
  assessorVersion: "test",
};

const DRAFT: CardDraft = {
  applicant: { name: "Иван", status: "" },
  phones: { aon: "9161263471", provided: "", onSite: "" },
  address: {
    formal: "Москва, Тверская",
    street: "Тверская",
    house: "",
    okrug: "",
    raion: "",
    descriptive: "",
    source: "manual",
  },
  what: {
    pollAnswers: "",
    signs: [],
    flags: [],
    finalType: "Пожар",
    classifierCode: "",
    casualties: { injured: false, ambulanceRefused: false, blocked: false },
  },
  description: "Горит балкон",
  emergency: { chs: false, chp: false },
  notificationList: [],
};

/** Все методы — vi.fn(); по умолчанию вызов выдан, принимается, передаётся и оценивается. */
function makeApi(
  initial: OperatorAttempt,
  overrides: Partial<Record<keyof Operator112Api, unknown>> = {},
): Mocked<Operator112Api> {
  const started: StartAssignmentResult = { kind: "operator112", attempt: initial };
  return {
    getAssignment: vi.fn().mockResolvedValue(assignment()),
    startAssignment: vi.fn().mockResolvedValue(started),
    getClassifier: vi.fn().mockResolvedValue([]),
    answerAttempt: vi.fn().mockResolvedValue(attempt({ state: "answered", answeredAt: ANSWERED })),
    sendEvent: vi.fn().mockResolvedValue({}),
    submitAttempt: vi.fn().mockResolvedValue({
      attempt: attempt({
        state: "submitted",
        answeredAt: ANSWERED,
        completedAt: "2026-09-29T10:01:00+03:00",
      }),
      card: {},
      evaluationId: "att-100",
    }),
    getEvaluation: vi.fn().mockResolvedValue(EVALUATION),
    ...overrides,
  } as unknown as Mocked<Operator112Api>;
}

/** Хук после загрузки: попытка выдана, экран «ready». */
async function loaded(api: Mocked<Operator112Api>) {
  const hook = renderHook(() => useOperator112("asg-001", api));
  await waitFor(() => expect(hook.result.current.screen.status).toBe("ready"));
  return hook;
}

describe("вид экрана 112: журнал → входящий → карточка → разбор", () => {
  it("до выдачи попытки вид — журнал", () => {
    const api = makeApi(attempt(), { startAssignment: vi.fn(() => new Promise(() => undefined)) });
    const { result } = renderHook(() => useOperator112("asg-001", api));
    expect(result.current.view).toBe("journal");
  });

  it("вызов поступил на старте → входящее окно; заголовок «Поиск происшествий»", async () => {
    const { result } = await loaded(makeApi(attempt()));
    expect(result.current.view).toBe("incoming");
    expect(document.title).toBe("Поиск происшествий");
  });

  it("принятая попытка на старте (перезагрузка во время разговора) → карточка", async () => {
    const { result } = await loaded(makeApi(attempt({ state: "answered", answeredAt: ANSWERED })));
    expect(result.current.view).toBe("card");
    expect(document.title).toBe("Происшествие 4");
  });

  it("«×» на входящем окне: вид журнал, callHidden отправлен, попытка остаётся в очереди", async () => {
    const api = makeApi(attempt());
    const { result } = await loaded(api);
    act(() => result.current.hideCall());
    expect(result.current.view).toBe("journal");
    expect(api.sendEvent).toHaveBeenCalledWith("att-100", { type: "callHidden" });
    expect(result.current.attempt?.state).toBe("ringing");
  });

  it("клик по строке очереди в журнале → входящее окно снова", async () => {
    const { result } = await loaded(makeApi(attempt()));
    act(() => result.current.hideCall());
    act(() => result.current.showIncoming());
    expect(result.current.view).toBe("incoming");
  });

  it("«×» на принятой попытке ничего не делает: вид и событие не меняются", async () => {
    const api = makeApi(attempt({ state: "answered", answeredAt: ANSWERED }));
    const { result } = await loaded(api);
    act(() => result.current.hideCall());
    expect(result.current.view).toBe("card");
    expect(api.sendEvent).not.toHaveBeenCalled();
  });

  it("отказ callHidden не мешает переходу в журнал", async () => {
    const api = makeApi(attempt(), { sendEvent: vi.fn().mockRejectedValue(new Error("409")) });
    const { result } = await loaded(api);
    act(() => result.current.hideCall());
    expect(result.current.view).toBe("journal");
  });

  it("«Принять»: отвечает на вызов и открывает карточку; заголовок «Происшествие 4»", async () => {
    const api = makeApi(attempt());
    const { result } = await loaded(api);
    await act(async () => {
      await result.current.accept();
    });
    expect(api.answerAttempt).toHaveBeenCalledWith("att-100");
    expect(result.current.view).toBe("card");
    expect(result.current.attempt?.state).toBe("answered");
    expect(document.title).toBe("Происшествие 4");
  });

  it("неудачный «Принять» остаётся во входящем окне с текстом ошибки", async () => {
    const api = makeApi(attempt(), {
      answerAttempt: vi.fn().mockRejectedValue(new Error("Сервер недоступен")),
    });
    const { result } = await loaded(api);
    await act(async () => {
      await result.current.accept();
    });
    expect(result.current.view).toBe("incoming");
    expect(result.current.answerError).toBe("Сервер недоступен");
  });

  it("связи и история SMS возвращаются в карточку; состояние попытки то же (черновик не сбрасывается)", async () => {
    const { result } = await loaded(makeApi(attempt()));
    await act(async () => {
      await result.current.accept();
    });
    const before = result.current.attempt;
    act(() => result.current.openLinks());
    expect(result.current.view).toBe("links");
    act(() => result.current.backToCard());
    expect(result.current.view).toBe("card");
    act(() => result.current.openSmsHistory());
    expect(result.current.view).toBe("smsHistory");
    act(() => result.current.backToCard());
    expect(result.current.view).toBe("card");
    expect(result.current.attempt).toBe(before);
  });

  it("карточка-тренировка из журнала: открыть → practiceCard, закрыть → журнал; заголовок журнала", async () => {
    const { result } = await loaded(makeApi(attempt()));
    act(() => result.current.hideCall());
    act(() => result.current.openPractice());
    expect(result.current.view).toBe("practiceCard");
    expect(document.title).toBe("Поиск происшествий");
    act(() => result.current.closePractice());
    expect(result.current.view).toBe("journal");
  });

  it("передача карточки → разбор; заголовок остаётся «Происшествие 4»", async () => {
    const api = makeApi(attempt());
    const { result } = await loaded(api);
    await act(async () => {
      await result.current.accept();
    });
    await act(async () => {
      await result.current.submit(DRAFT, false);
    });
    expect(api.submitAttempt).toHaveBeenCalledWith("att-100", DRAFT);
    expect(result.current.view).toBe("result");
    expect(result.current.result?.evaluation.totalScore).toBe(85);
    expect(document.title).toBe("Происшествие 4");
  });

  it("истечение лимита экзамена → разбор с итогом сервера", async () => {
    const api = makeApi(attempt({ state: "answered", answeredAt: ANSWERED }), {
      getAssignment: vi
        .fn()
        .mockResolvedValueOnce(assignment())
        .mockResolvedValue(
          assignment({
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
        ),
    });
    const { result } = await loaded(api);
    let expiredNow = false;
    await act(async () => {
      expiredNow = await result.current.checkExpiry();
    });
    expect(expiredNow).toBe(true);
    expect(result.current.view).toBe("result");
    expect(result.current.expired).toEqual({ score: 0, passed: false });
  });

  it("следующий билет после разбора: новый вызов → входящее окно, итог сброшен", async () => {
    const api = makeApi(attempt(), {
      startAssignment: vi
        .fn()
        .mockResolvedValueOnce({ kind: "operator112", attempt: attempt() })
        .mockResolvedValueOnce({
          kind: "operator112",
          attempt: attempt({ id: "att-101", incidentNumber: 5 }),
        }),
    });
    const { result } = await loaded(api);
    await act(async () => {
      await result.current.accept();
    });
    await act(async () => {
      await result.current.submit(DRAFT, false);
    });
    await act(async () => {
      await result.current.next();
    });
    expect(result.current.view).toBe("incoming");
    expect(result.current.result).toBeNull();
    expect(result.current.attempt?.id).toBe("att-101");
  });
});

describe("operator112Title", () => {
  it("журнал, входящее и практика — «Поиск происшествий»; карточка и её окна — «Происшествие N»", () => {
    const current = attempt({ incidentNumber: 7 });
    expect(operator112Title("journal", current)).toBe("Поиск происшествий");
    expect(operator112Title("incoming", current)).toBe("Поиск происшествий");
    expect(operator112Title("practiceCard", current)).toBe("Поиск происшествий");
    expect(operator112Title("card", current)).toBe("Происшествие 7");
    expect(operator112Title("links", current)).toBe("Происшествие 7");
    expect(operator112Title("smsHistory", current)).toBe("Происшествие 7");
    expect(operator112Title("card", null)).toBe("Поиск происшествий");
  });
});
