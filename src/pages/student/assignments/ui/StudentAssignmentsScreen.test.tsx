import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { Assignment, AssignmentDetail, AssignmentProgress } from "@/shared/api";

import type { StudentAssignmentsApi } from "../api/assignmentsApi";
import { StudentAssignmentsScreen } from "./StudentAssignmentsScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const TRAINING: Assignment = {
  id: "asg-001",
  teacherId: "u-002",
  studentIds: ["u-005"],
  trainingMode: "operator112",
  format: "training",
  cardIds: ["c-010", "c-050"],
  params: { norms: { answerSec: 30, submitSec: 180 }, hints: { enabled: true, idleSec: 20 } },
  state: "active",
  createdAt: "2026-09-29T10:00:00+03:00",
  title: "Режим 112: приём вызова и карточка (тренировка)",
};

const EXAM: Assignment = {
  ...TRAINING,
  id: "asg-002",
  format: "exam",
  cardIds: ["c-071", "c-090"],
  params: { passThreshold: 70, timeLimitSec: 600, hints: { enabled: false } },
  title: "Режим 112: экзамен",
};

const link = (
  state: AssignmentProgress["state"],
  extra: Partial<AssignmentProgress> = {},
): AssignmentProgress => ({
  studentId: "u-005",
  cardId: "c-071",
  state,
  attemptId: `att-${state}-${extra.cardId ?? "x"}`,
  ...extra,
});

function makeApi(items: Assignment[], progress: Record<string, AssignmentProgress[]> = {}) {
  const api = {
    list: vi.fn().mockResolvedValue(items),
    detail: vi.fn(async (id: string): Promise<AssignmentDetail> => ({
      ...(items.find((item) => item.id === id) as Assignment),
      progress: progress[id] ?? [],
    })),
    start: vi.fn(),
  };
  return api as unknown as Mocked<StudentAssignmentsApi>;
}

const card = (title: RegExp | string) => screen.findByRole("article", { name: title });

beforeEach(() => push.mockClear());

describe("StudentAssignmentsScreen: список заданий", () => {
  it("сид: тренировка и экзамен с условиями (билеты, порог, лимит, подсказки, правила экзамена)", async () => {
    render(<StudentAssignmentsScreen api={makeApi([TRAINING, EXAM])} />);
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка заданий");
    const training = within(await card(/тренировка/));
    expect(training.getByText("Тренировка")).toBeInTheDocument();
    expect(training.getByText("Подсказки").nextSibling).toHaveTextContent("есть");
    expect(training.getByRole("button", { name: "Начать" })).toBeInTheDocument();
    const exam = within(await card(/экзамен/));
    expect(exam.getByText("Порог сдачи").nextSibling).toHaveTextContent("70");
    expect(exam.getByText("Лимит на билет").nextSibling).toHaveTextContent("10 мин");
    expect(exam.getByText("Подсказки").nextSibling).toHaveTextContent("нет");
    expect(exam.getByText(/Билет выдаётся один раз/)).toBeInTheDocument();
    expect(exam.getByRole("button", { name: "Начать экзамен" })).toBeInTheDocument();
  });

  it("обучающийся не завершает задание: кнопки «Завершить» нет", async () => {
    render(<StudentAssignmentsScreen api={makeApi([TRAINING, EXAM])} />);
    await card(/тренировка/);
    expect(screen.queryByRole("button", { name: /Завершить/ })).toBeNull();
  });

  it("смешанный список (режим ДДС и цепочка) отображается без ошибок", async () => {
    const dds: Assignment = { ...TRAINING, id: "asg-010", trainingMode: "dds", title: "ДДС" };
    const chain: Assignment = { ...TRAINING, id: "asg-011", trainingMode: "chain", title: "Цепочка" };
    render(<StudentAssignmentsScreen api={makeApi([TRAINING, dds, chain])} />);
    expect(await card("ДДС")).toHaveTextContent("Режим ДДС");
    expect(await card("Цепочка")).toHaveTextContent("Цепочка 112 → ДДС");
  });

  it("пустой список — понятное сообщение", async () => {
    render(<StudentAssignmentsScreen api={makeApi([])} />);
    expect(await screen.findByText(/Заданий пока нет/)).toBeInTheDocument();
  });

  it("ошибка загрузки — сообщение и «Повторить»; повтор загружает список", async () => {
    const api = makeApi([TRAINING]);
    api.list.mockRejectedValueOnce(new ApiError(500, "internal", "Ошибка сервера. Повторите попытку позже"));
    render(<StudentAssignmentsScreen api={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ошибка сервера");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await card(/тренировка/)).toBeInTheDocument();
  });

  it("без бэкенда — «Раздел требует подключения к серверу тренажёра»", async () => {
    const api = makeApi([]);
    api.list.mockRejectedValue(new ServerRequiredError());
    render(<StudentAssignmentsScreen api={api} />);
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });

  it("деталь одного задания не загрузилась — карточка остаётся с пометкой, остальные живы", async () => {
    const api = makeApi([TRAINING, EXAM]);
    api.detail.mockImplementation(async (id: string) => {
      if (id === "asg-001") throw new ApiError(500, "internal", "сбой");
      return { ...EXAM, progress: [] };
    });
    render(<StudentAssignmentsScreen api={api} />);
    expect(await card(/тренировка/)).toHaveTextContent("Прогресс по заданию не загрузился");
    expect(await card(/экзамен/)).not.toHaveTextContent("не загрузился");
  });
});

describe("StudentAssignmentsScreen: прогресс и итоги", () => {
  it("закрыты часть билетов: итог, «Следующий билет»; экзамен — сдан/не сдан", async () => {
    const progress = {
      "asg-002": [
        link("submitted", { cardId: "c-071", score: 82, passed: true }),
        link("notCompleted", { cardId: "c-090", score: 0, passed: false }),
      ],
    };
    render(<StudentAssignmentsScreen api={makeApi([EXAM], progress)} />);
    const exam = within(await card(/экзамен/));
    expect(exam.getByText("Выполнено 2 из 2 · средний балл 41")).toBeInTheDocument();
    expect(exam.getByText("сдан")).toBeInTheDocument();
    expect(exam.getByText("не сдан")).toBeInTheDocument();
    expect(exam.getByText("оценка 0, истёк лимит времени")).toBeInTheDocument();
    expect(exam.getByText("Выполнено")).toBeInTheDocument();
    expect(exam.queryByRole("button")).toBeNull();
  });

  it("после лимита экзамена «Обновить» показывает итог сервера: не выполнено, оценка 0", async () => {
    const api = makeApi([EXAM], { "asg-002": [link("answered", { cardId: "c-071" })] });
    render(<StudentAssignmentsScreen api={api} />);
    const before = within(await card(/экзамен/));
    expect(before.getByRole("button", { name: "Продолжить" })).toBeInTheDocument();
    api.detail.mockResolvedValue({
      ...EXAM,
      progress: [link("notCompleted", { cardId: "c-071", score: 0, passed: false })],
    });
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    const after = within(await screen.findByRole("article", { name: /экзамен/ }));
    expect(await after.findByText("оценка 0, истёк лимит времени")).toBeInTheDocument();
    expect(after.getByText("не сдан")).toBeInTheDocument();
    expect(after.getByRole("button", { name: "Следующий билет" })).toBeInTheDocument();
  });

  it("завершённое преподавателем задание — без кнопки запуска", async () => {
    render(<StudentAssignmentsScreen api={makeApi([{ ...TRAINING, state: "finished" }])} />);
    const finished = within(await card(/тренировка/));
    expect(finished.getByText("Завершено")).toBeInTheDocument();
    expect(finished.queryByRole("button")).toBeNull();
  });

  it("цепочка: этап ДДС ждёт подтверждения преподавателя", async () => {
    const chain: Assignment = {
      ...TRAINING,
      id: "asg-011",
      trainingMode: "chain",
      cardIds: ["c-010"],
      title: "Цепочка",
    };
    const progress = {
      "asg-011": [
        link("submitted", {
          cardId: "c-010",
          chainReview: {
            scenarioId: "ais-001",
            version: 2,
            approval: "pending_review",
            validation: "passed",
          },
        }),
      ],
    };
    render(<StudentAssignmentsScreen api={makeApi([chain], progress)} />);
    expect(await card("Цепочка")).toHaveTextContent(
      "Этап ДДС ожидает проверки и подтверждения преподавателем",
    );
  });
});

describe("StudentAssignmentsScreen: запуск", () => {
  it("режим 112: переход на рабочее место с assignmentId без вызова start (его делает страница)", async () => {
    const api = makeApi([TRAINING]);
    render(<StudentAssignmentsScreen api={api} />);
    fireEvent.click(within(await card(/тренировка/)).getByRole("button", { name: "Начать" }));
    await Promise.resolve();
    expect(push).toHaveBeenCalledWith("/arm/operator112?assignmentId=asg-001");
    expect(api.start).not.toHaveBeenCalled();
  });

  it("цепочка: start здесь; 409 остаётся сообщением на карточке; успех этапа A — на рабочее место", async () => {
    const chain: Assignment = { ...TRAINING, id: "asg-011", trainingMode: "chain", title: "Цепочка" };
    const api = makeApi([chain]);
    api.start.mockRejectedValueOnce(
      new ApiError(409, "conflict", "Вход ДДС ожидает проверки и подтверждения преподавателем"),
    );
    render(<StudentAssignmentsScreen api={api} />);
    const chainCard = within(await card("Цепочка"));
    fireEvent.click(chainCard.getByRole("button", { name: "Начать" }));
    expect(await chainCard.findByRole("alert")).toHaveTextContent(
      "Вход ДДС ожидает проверки и подтверждения преподавателем",
    );
    expect(push).not.toHaveBeenCalled();
    api.start.mockResolvedValueOnce({ kind: "operator112", attempt: {} as never });
    fireEvent.click(chainCard.getByRole("button", { name: "Начать" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/arm/operator112?assignmentId=asg-011"));
  });

  it("режим ДДС и этап B цепочки: start → переход на карточку", async () => {
    const dds: Assignment = { ...TRAINING, id: "asg-010", trainingMode: "dds", title: "ДДС" };
    const api = makeApi([dds]);
    api.start.mockResolvedValue({
      kind: "dds",
      sessionId: "ses-1",
      attempt: { cardId: "c-028" } as never,
      created: true,
    });
    render(<StudentAssignmentsScreen api={api} />);
    fireEvent.click(within(await card("ДДС")).getByRole("button", { name: "Начать" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/arm/card/c-028"));
  });
});
