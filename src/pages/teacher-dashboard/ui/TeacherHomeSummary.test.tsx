import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ServerRequiredError } from "@/shared/api";
import type { Assignment, AssignmentDetail, PublicUser, StudentProfile } from "@/shared/api";

import type { TeacherHomeApi } from "../api/homeApi";
import { TeacherHomeSummary } from "./TeacherHomeSummary";

const student = (id: string, fullName: string, group = "Г-1"): PublicUser => ({
  id,
  login: id,
  fullName,
  role: "student",
  armNumber: 1,
  isActive: true,
  group,
});
const teacher: PublicUser = {
  id: "u-2",
  login: "t",
  fullName: "Т",
  role: "teacher",
  armNumber: 1,
  isActive: true,
  assignedGroups: ["Г-1"],
};

const profile = (dds: number, op: number): StudentProfile => ({
  ratings: { dds: 1000, operator112: 1000 },
  strongerMode: null,
  typicalErrors: {
    dds: dds ? [{ type: "a", count: dds }] : [],
    operator112: op ? [{ type: "b", count: op }] : [],
  },
  recommendations: [],
});

const assignment = (over: Partial<Assignment>): Assignment => ({
  id: "asg-1",
  teacherId: "u-2",
  studentIds: ["u-5"],
  trainingMode: "operator112",
  format: "training",
  cardIds: ["c-1"],
  params: {},
  state: "active",
  createdAt: "2026-09-29T10:00:00+03:00",
  title: "Задание",
  ...over,
});

function makeApi(overrides: Partial<TeacherHomeApi> = {}): TeacherHomeApi {
  const profiles: Record<string, StudentProfile> = {
    "u-1": profile(1, 0),
    "u-2": profile(4, 3),
    "u-3": profile(2, 2),
    "u-4": profile(2, 2),
    "u-5": profile(0, 0),
  };
  return {
    listStudents: vi
      .fn()
      .mockResolvedValue([
        student("u-1", "Яковлев"),
        student("u-2", "Абрамов"),
        student("u-3", "Борисов"),
        student("u-4", "Александров"),
        student("u-5", "Без ошибок"),
        student("u-9", "Чужая группа", "Г-9"),
      ]),
    profile: vi.fn(async (id: string) => profiles[id]),
    listAssignments: vi
      .fn()
      .mockResolvedValue([
        assignment({ id: "asg-late", title: "Поздний срок", dueAt: "2999-01-01T00:00:00+03:00" }),
        assignment({ id: "asg-soon", title: "Скорый срок", dueAt: "2998-01-01T00:00:00+03:00" }),
        assignment({ id: "asg-none", title: "Без срока" }),
        assignment({ id: "asg-chain", title: "Цепочка", trainingMode: "chain" }),
      ]),
    assignmentDetail: vi.fn().mockResolvedValue({
      ...assignment({ id: "asg-chain", trainingMode: "chain" }),
      progress: [
        {
          studentId: "u-5",
          cardId: "c-1",
          attemptId: "a1",
          state: "submitted",
          chainReview: { scenarioId: "ais-7", version: 2, approval: "pending_review", validation: "passed" },
        },
        {
          studentId: "u-6",
          cardId: "c-2",
          attemptId: "a2",
          state: "submitted",
          chainReview: { scenarioId: "ais-8", version: 2, approval: "approved", validation: "passed" },
        },
      ],
    } as AssignmentDetail),
    ...overrides,
  };
}

const renderSummary = (api: TeacherHomeApi) =>
  render(
    <SessionProvider user={teacher}>
      <TeacherHomeSummary api={api} />
    </SessionProvider>,
  );

describe("сводка преподавателя", () => {
  it("зона риска: три обучающихся своей группы с наибольшим числом ошибок, ничья — по алфавиту", async () => {
    renderSummary(makeApi());
    await screen.findByText("Абрамов");
    const items = (await screen.findAllByRole("listitem")).map((item) => item.textContent ?? "");
    const risk = items.filter((text) => /ошибок: \d+/.test(text));
    expect(risk).toEqual(["Абрамовошибок: 7", "Александровошибок: 4", "Борисовошибок: 4"]);
    expect(screen.queryByText(/Чужая группа/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Без ошибок/)).not.toBeInTheDocument();
  });

  it("ошибка профиля одного обучающегося — частичный результат с пометкой", async () => {
    const api = makeApi({
      profile: vi.fn(async (id: string) => {
        if (id === "u-2") throw new Error("boom");
        return profile(id === "u-1" ? 5 : 0, 0);
      }),
    });
    renderSummary(api);
    expect(
      await screen.findByText("Профили 1 обучающихся не загрузились — список неполный."),
    ).toBeInTheDocument();
    expect(screen.getByText("Яковлев")).toBeInTheDocument();
  });

  it("ближайшие сроки — по возрастанию; без срока не попадают", async () => {
    renderSummary(makeApi());
    const soon = await screen.findByRole("link", { name: "Скорый срок" });
    const late = screen.getByRole("link", { name: "Поздний срок" });
    expect(soon.compareDocumentPosition(late) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Без срока" })).not.toBeInTheDocument();
  });

  it("задачи подтверждения: только входы ДДС в статусе «ожидает проверки», ссылка на сценарий", async () => {
    renderSummary(makeApi());
    const link = await screen.findByRole("link", { name: /Вход ДДС ais-7, версия 2/ });
    expect(link).toHaveAttribute("href", "/teacher/scenarios/ais-7");
    expect(screen.queryByRole("link", { name: /ais-8/ })).not.toBeInTheDocument();
  });

  it("без сервера каждый блок показывает «нужен сервер» независимо", async () => {
    const down = vi.fn().mockRejectedValue(new ServerRequiredError());
    renderSummary(makeApi({ listStudents: down, listAssignments: down }));
    const notices = await screen.findAllByText("Раздел требует подключения к серверу тренажёра");
    expect(notices).toHaveLength(3);
  });
});
