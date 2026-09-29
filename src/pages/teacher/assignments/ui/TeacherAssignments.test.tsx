import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { Assignment, AssignmentDetail, PublicUser } from "@/shared/api";

import type { TeacherAssignmentsApi } from "../api/teacherAssignmentsApi";
import { TeacherAssignmentDetailScreen } from "./TeacherAssignmentDetailScreen";
import { TeacherAssignmentsScreen } from "./TeacherAssignmentsScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const ASSIGNMENT: Assignment = {
  id: "asg-001",
  teacherId: "u-002",
  studentIds: ["u-005", "u-006"],
  trainingMode: "operator112",
  format: "training",
  cardIds: ["c-010", "c-050"],
  params: { norms: { answerSec: 30, submitSec: 180 } },
  state: "active",
  createdAt: "2026-09-29T10:00:00+03:00",
  title: "Тренировка 112",
};
const EXAM: Assignment = {
  ...ASSIGNMENT,
  id: "asg-002",
  format: "exam",
  state: "finished",
  title: "Экзамен",
  params: { passThreshold: 70 },
};
const RANDOM: Assignment = {
  ...ASSIGNMENT,
  id: "asg-003",
  cardIds: [],
  randomRule: { groups: [], difficulty: [], count: 4 },
  title: "Случайные",
};

const STUDENTS = [
  { id: "u-005", fullName: "Иванов Иван" },
  { id: "u-006", fullName: "Петров Пётр" },
] as PublicUser[];

function makeApi(overrides: Partial<TeacherAssignmentsApi> = {}): TeacherAssignmentsApi {
  return {
    list: vi.fn().mockResolvedValue([ASSIGNMENT, EXAM, RANDOM]),
    detail: vi.fn().mockResolvedValue({ ...ASSIGNMENT, progress: [] } as AssignmentDetail),
    finish: vi.fn().mockResolvedValue({ ...ASSIGNMENT, state: "finished" }),
    listStudents: vi.fn().mockResolvedValue(STUDENTS),
    ...overrides,
  };
}

describe("список назначений преподавателя", () => {
  it("показывает задания с режимом, форматом и числом билетов; случайный набор — количеством", async () => {
    render(<TeacherAssignmentsScreen api={makeApi()} />);
    const table = await screen.findByRole("table", { name: "Назначения" });
    expect(within(table).getByRole("link", { name: "Тренировка 112" })).toHaveAttribute(
      "href",
      "/teacher/assignments/asg-001",
    );
    expect(within(table).getByText("случайно: 4")).toBeInTheDocument();
    expect(within(table).getAllByText("Экзамен")).toHaveLength(2);
  });

  it("фильтр «Активные» скрывает завершённые", async () => {
    render(<TeacherAssignmentsScreen api={makeApi()} />);
    await screen.findByRole("table", { name: "Назначения" });
    fireEvent.click(screen.getByRole("button", { name: "Активные" }));
    expect(screen.queryByRole("link", { name: "Экзамен" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тренировка 112" })).toBeInTheDocument();
  });

  it("пусто, «нужен сервер» и ошибка — отдельные состояния", async () => {
    const { unmount } = render(
      <TeacherAssignmentsScreen api={makeApi({ list: vi.fn().mockResolvedValue([]) })} />,
    );
    expect(await screen.findByText(/Назначений нет/)).toBeInTheDocument();
    unmount();
    const server = render(
      <TeacherAssignmentsScreen
        api={makeApi({ list: vi.fn().mockRejectedValue(new ServerRequiredError()) })}
      />,
    );
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
    server.unmount();
    render(
      <TeacherAssignmentsScreen
        api={makeApi({ list: vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Нет доступа")) })}
      />,
    );
    expect(await screen.findByText("Нет доступа")).toBeInTheDocument();
  });
});

describe("деталь назначения", () => {
  const chainDetail: AssignmentDetail = {
    ...ASSIGNMENT,
    trainingMode: "chain",
    progress: [
      {
        studentId: "u-005",
        cardId: "c-010",
        attemptId: "att-1",
        state: "submitted",
        chainReview: { scenarioId: "ais-001", version: 2, approval: "pending_review", validation: "passed" },
      },
      {
        studentId: "u-006",
        cardId: "c-050",
        attemptId: "att-2",
        state: "submitted",
        score: 88,
        passed: true,
      },
    ],
  };

  it("прогресс по обучающимся; для цепочки — ссылка на сценарий и статус подтверждения", async () => {
    render(
      <TeacherAssignmentDetailScreen
        assignmentId="asg-001"
        api={makeApi({ detail: vi.fn().mockResolvedValue(chainDetail) })}
      />,
    );
    const table = await screen.findByRole("table", { name: "Прогресс по обучающимся" });
    expect(within(table).getByText("Иванов Иван")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: /ais-001, версия 2/ })).toHaveAttribute(
      "href",
      "/teacher/scenarios/ais-001",
    );
    expect(within(table).getByText("ожидает подтверждения")).toBeInTheDocument();
    expect(within(table).getByText("88")).toBeInTheDocument();
    expect(within(table).getByText("Сдал")).toBeInTheDocument();
  });

  it("завершение требует подтверждения и вызывает finish; после — перечитывает задание", async () => {
    const api = makeApi();
    render(<TeacherAssignmentDetailScreen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Завершить задание" }));
    expect(api.finish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Да, завершить" }));
    await waitFor(() => expect(api.finish).toHaveBeenCalledWith("asg-001"));
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
  });

  it("403 при завершении показывается сообщением сервера", async () => {
    const api = makeApi({
      finish: vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Задание другого преподавателя")),
    });
    render(<TeacherAssignmentDetailScreen assignmentId="asg-001" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Завершить задание" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, завершить" }));
    expect(await screen.findByText("Задание другого преподавателя")).toBeInTheDocument();
  });

  it("завершённое задание кнопки завершения не имеет; чужое (403) — ошибка загрузки", async () => {
    const { unmount } = render(
      <TeacherAssignmentDetailScreen
        assignmentId="asg-002"
        api={makeApi({ detail: vi.fn().mockResolvedValue({ ...EXAM, progress: [] }) })}
      />,
    );
    await screen.findByRole("table", { name: "Прогресс по обучающимся" });
    expect(screen.queryByRole("button", { name: "Завершить задание" })).not.toBeInTheDocument();
    unmount();
    render(
      <TeacherAssignmentDetailScreen
        assignmentId="asg-9"
        api={makeApi({
          detail: vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Задание другого преподавателя")),
        })}
      />,
    );
    expect(await screen.findByText("Задание другого преподавателя")).toBeInTheDocument();
  });
});
