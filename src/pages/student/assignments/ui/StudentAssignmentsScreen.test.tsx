import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ApiError, ServerRequiredError } from "@/shared/api";
import type { Assignment, AssignmentDetail, AssignmentProgress, PublicUser } from "@/shared/api";

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

const studentWith = (specializations: PublicUser["specializations"]): PublicUser => ({
  id: "u-005",
  login: "ivanov",
  fullName: "Иванов Сергей Петрович",
  role: "student",
  armNumber: 1,
  isActive: true,
  specializations,
});

describe("StudentAssignmentsScreen: специализация обучающегося (спека 007)", () => {
  const DDS: Assignment = { ...TRAINING, id: "asg-010", trainingMode: "dds", title: "ДДС-тренировка" };
  const CHAIN: Assignment = { ...TRAINING, id: "asg-011", trainingMode: "chain", title: "Цепочка" };

  function renderFor(specializations: PublicUser["specializations"], items: Assignment[]) {
    return render(
      <SessionProvider user={studentWith(specializations)}>
        <StudentAssignmentsScreen api={makeApi(items)} />
      </SessionProvider>,
    );
  }

  it("ДДС-обучающийся не видит заданий режима 112", async () => {
    renderFor(["dds"], [TRAINING, DDS]);
    const own = within(await card("ДДС-тренировка"));
    expect(own.getByRole("button", { name: "Начать" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Режим 112/ })).toBeNull();
  });

  it("112-обучающийся видит только своё задание", async () => {
    renderFor(["operator112"], [TRAINING, DDS]);
    expect(within(await card(/Режим 112/)).getByRole("button", { name: "Начать" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "ДДС-тренировка" })).toBeNull();
  });

  it("старая цепочка видна только с обеими специализациями и открывается на чтение (режим выведен)", async () => {
    const { unmount } = renderFor(["dds"], [CHAIN]);
    expect(await screen.findByText(/Заданий пока нет/)).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Цепочка" })).toBeNull();
    unmount();
    renderFor(["operator112", "dds"], [CHAIN]);
    const chain = within(await card("Цепочка"));
    expect(chain.getByText(/доступно только для просмотра/)).toBeInTheDocument();
    expect(chain.queryByRole("button", { name: "Начать" })).toBeNull();
  });

  it("если все задания чужого режима — показывается пустое состояние без раскрытия чужих заданий", async () => {
    renderFor(["dds"], [TRAINING]);
    expect(await screen.findByText(/Заданий пока нет/)).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Режим 112/ })).toBeNull();
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

  it("старая цепочка (режим выведен): результаты видны, кнопки запуска нет", async () => {
    const chain: Assignment = {
      ...TRAINING,
      id: "asg-011",
      trainingMode: "chain",
      cardIds: ["c-010"],
      title: "Цепочка",
    };
    const progress = { "asg-011": [link("submitted", { cardId: "c-010", score: 72 })] };
    render(<StudentAssignmentsScreen api={makeApi([chain], progress)} />);
    const chainCard = within(await card("Цепочка"));
    expect(chainCard.getByText(/доступно только для просмотра/)).toBeInTheDocument();
    expect(chainCard.getByText("72")).toBeInTheDocument();
    expect(chainCard.queryByRole("button")).toBeNull();
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

  it("режим ДДС: start → переход на карточку", async () => {
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

  it("отказ профиля режима (spec/008, 403) показывается дословно, перехода нет", async () => {
    const dds: Assignment = { ...TRAINING, id: "asg-011", trainingMode: "dds", title: "ДДС" };
    const api = makeApi([dds]);
    api.start.mockRejectedValue(
      new ApiError(403, "forbidden", "Задание режима ДДС недоступно для учётной записи специалиста-112"),
    );
    render(<StudentAssignmentsScreen api={api} />);
    fireEvent.click(within(await card("ДДС")).getByRole("button", { name: "Начать" }));
    expect(
      await screen.findByText("Задание режима ДДС недоступно для учётной записи специалиста-112"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
