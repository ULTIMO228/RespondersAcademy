import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ApiError } from "@/shared/api";
import type { ErrorMapResponse, PublicUser, StudentProfile, StudentStats } from "@/shared/api";

import type { TeacherStudentsApi } from "../api/teacherStudentsApi";
import { TeacherStudentScreen } from "./TeacherStudentScreen";
import { TeacherStudentsScreen, groupStudents } from "./TeacherStudentsScreen";

const student = (id: string, fullName: string, group: string): PublicUser => ({
  id,
  login: id,
  fullName,
  role: "student",
  armNumber: 1,
  isActive: true,
  group,
});
const STUDENTS = [
  student("u-6", "Петров", "Г-2"),
  student("u-5", "Иванов", "Г-1"),
  student("u-7", "Сидоров", "Г-1"),
];
const teacher: PublicUser = {
  id: "u-2",
  login: "t",
  fullName: "Т",
  role: "teacher",
  armNumber: 1,
  isActive: true,
  assignedGroups: ["Г-1"],
};

const PROFILE: StudentProfile = {
  ratings: { dds: 1040, operator112: 990 },
  strongerMode: "dds",
  typicalErrors: { dds: [{ type: "address", count: 3 }], operator112: [] },
  recommendations: [
    {
      id: "r1",
      kind: "article",
      targetId: "kb-1",
      title: "Повторить статью",
      reason: { errorType: "address", count: 3, ruleId: "x" },
      createdAt: "2026-09-29",
    },
  ],
};

const makeApi = (overrides: Partial<TeacherStudentsApi> = {}): TeacherStudentsApi => ({
  listStudents: vi.fn().mockResolvedValue(STUDENTS),
  profile: vi.fn().mockResolvedValue(PROFILE),
  setSpecializations: vi.fn().mockResolvedValue(student("u-5", "Иванов", "Г-1")),
  ...overrides,
});

describe("groupStudents", () => {
  it("ограничивает закреплёнными группами и сортирует по алфавиту", () => {
    expect(
      groupStudents(STUDENTS, ["Г-1"]).map(([group, members]) => [group, members.map((m) => m.id)]),
    ).toEqual([["Г-1", ["u-5", "u-7"]]]);
  });

  it("без закреплённых групп групп нет", () => {
    expect(groupStudents(STUDENTS)).toEqual([]);
    expect(groupStudents(STUDENTS, [])).toEqual([]);
  });
});

describe("страница «Обучающиеся»", () => {
  it("показывает только обучающихся закреплённых групп со ссылками на профиль и группу", async () => {
    render(
      <SessionProvider user={teacher}>
        <TeacherStudentsScreen api={makeApi()} />
      </SessionProvider>,
    );
    expect(await screen.findByRole("link", { name: "Иванов" })).toHaveAttribute(
      "href",
      "/teacher/students/u-5",
    );
    expect(screen.queryByText("Петров")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аналитика группы" })).toHaveAttribute(
      "href",
      expect.stringContaining("/teacher/groups/"),
    );
  });

  it("позволяет изменить специализацию обучающегося своей группы", async () => {
    const api = makeApi();
    render(
      <SessionProvider user={teacher}>
        <TeacherStudentsScreen api={api} />
      </SessionProvider>,
    );
    const fieldset = await screen.findByRole("group", { name: "Специализация: Иванов" });
    fireEvent.click(within(fieldset).getByLabelText("Специалист 112"));
    fireEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(api.setSpecializations).toHaveBeenCalledWith("u-5", ["operator112", "dds"]);
    expect(await screen.findByRole("status")).toHaveTextContent("Специализация сохранена");
  });

  it("группы не закреплены за обучающимися — пустое состояние", async () => {
    render(
      <SessionProvider user={{ ...teacher, assignedGroups: ["Г-9"] }}>
        <TeacherStudentsScreen api={makeApi()} />
      </SessionProvider>,
    );
    expect(await screen.findByText("Обучающихся нет")).toBeInTheDocument();
  });

  it("группы не закреплены вовсе — «Нет закреплённых групп», а не все обучающиеся", async () => {
    render(
      <SessionProvider user={{ ...teacher, assignedGroups: [] }}>
        <TeacherStudentsScreen api={makeApi()} />
      </SessionProvider>,
    );
    expect(await screen.findByText("Нет закреплённых групп")).toBeInTheDocument();
    expect(screen.queryByText("Иванов")).not.toBeInTheDocument();
    expect(screen.queryByText("Петров")).not.toBeInTheDocument();
  });
});

describe("профиль обучающегося", () => {
  it("рейтинги, сильный режим, типичные ошибки и рекомендации", async () => {
    render(<TeacherStudentScreen studentId="u-5" api={makeApi()} />);
    expect(await screen.findByRole("heading", { name: "Иванов" })).toBeInTheDocument();
    expect(screen.getByText("сильный режим")).toBeInTheDocument();
    expect(screen.getByText("Сильный режим: Режим ДДС.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Типичные ошибки, Режим ДДС" });
    expect(within(table).getByText("address")).toBeInTheDocument();
    expect(screen.getByText("Ошибок в этом режиме пока нет.")).toBeInTheDocument();
    expect(screen.getByText("Повторить статью")).toBeInTheDocument();
  });

  it("ссылка «Карта ошибок» ведёт на карту этого обучающегося", async () => {
    render(<TeacherStudentScreen studentId="u-5" api={makeApi()} />);
    expect(await screen.findByRole("link", { name: "Карта ошибок" })).toHaveAttribute(
      "href",
      "/teacher/error-map/students/u-5",
    );
  });

  it("без истории — пустые состояния; 403/404 профиля — ошибка", async () => {
    const empty: StudentProfile = {
      ratings: { dds: 1000, operator112: 1000 },
      strongerMode: null,
      typicalErrors: { dds: [], operator112: [] },
      recommendations: [],
    };
    const { unmount } = render(
      <TeacherStudentScreen studentId="u-5" api={makeApi({ profile: vi.fn().mockResolvedValue(empty) })} />,
    );
    expect(await screen.findByText(/Рекомендаций нет/)).toBeInTheDocument();
    expect(screen.getByText(/сильный режим не выделен/)).toBeInTheDocument();
    unmount();
    render(
      <TeacherStudentScreen
        studentId="u-x"
        api={makeApi({
          profile: vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Обучающийся не найден")),
        })}
      />,
    );
    expect(await screen.findByText("Обучающийся не найден")).toBeInTheDocument();
  });
});

describe("полная статистика (спека 006)", () => {
  const summary = (attempts: number) => ({
    attempts,
    averageScore: attempts ? 75 : null,
    averageReactionMs: attempts ? 42_000 : null,
    averageProcessingMs: attempts ? 120_000 : null,
    withinNormsShare: attempts ? 0.5 : null,
  });
  const STATS: StudentStats = {
    studentId: "u-5",
    fullName: "Иванов",
    groupId: "Г-1",
    period: "all",
    mode: "all",
    norms: { reactionMs: 30_000, processingMs: 180_000 },
    summary: summary(2),
    byMode: { dds: summary(2), operator112: summary(0) },
    dynamics: [
      {
        attemptId: "a-1",
        at: "2026-10-01T10:00:00+03:00",
        mode: "dds",
        score: 70,
        reactionMs: 40_000,
        processingMs: 120_000,
      },
      {
        attemptId: "a-2",
        at: "2026-10-02T10:00:00+03:00",
        mode: "dds",
        score: 80,
        reactionMs: 44_000,
        processingMs: 120_000,
      },
    ],
    attempts: [
      {
        attemptId: "a-2",
        at: "2026-10-02T10:00:00+03:00",
        mode: "dds",
        score: 80,
        reactionMs: 44_000,
        processingMs: 120_000,
        sessionId: "ses-1",
        format: "training",
        title: "Пожар на балконе",
        passed: null,
      },
    ],
  };
  const MAP: ErrorMapResponse = {
    scope: { kind: "student", groupId: "Г-1", studentId: "u-5", title: "Иванов" },
    mode: "dds",
    period: "all",
    attempts: 6,
    stages: [
      { id: "address", order: 1, title: "Адрес" },
      { id: "statuses", order: 2, title: "Статусы" },
    ],
    levels: [
      {
        stageId: "address",
        attempts: 6,
        attemptsWithError: 3,
        share: 0.5,
        level: "often",
        affectedStudents: 1,
      },
      {
        stageId: "statuses",
        attempts: 6,
        attemptsWithError: 0,
        share: 0,
        level: "rare",
        affectedStudents: 0,
      },
    ],
    headline: { kind: "problems", stageIds: ["address"], text: "—" },
    generatedAt: "2026-10-02T10:00:00+03:00",
  };
  const full = () =>
    makeApi({
      stats: vi.fn().mockResolvedValue(STATS),
      errorMap: vi
        .fn()
        .mockImplementation((_id: string, mode: string) =>
          Promise.resolve(mode === "dds" ? MAP : { ...MAP, mode, levels: [] }),
        ),
    });

  it("скорость, слабые этапы и попытки со ссылкой на отчёт", async () => {
    render(<TeacherStudentScreen studentId="u-5" api={full()} />);
    expect((await screen.findAllByText("Средняя реакция")).length).toBe(2);
    expect(screen.getByText("Попыток в этом режиме нет.")).toBeInTheDocument();
    expect(screen.getByText(/часто: 50 % попыток с ошибкой/)).toBeInTheDocument();
    expect(screen.queryByText(/Статусы ·/)).not.toBeInTheDocument();
    expect(screen.getByText("Пожар на балконе")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Отчёт занятия" })).toHaveAttribute(
      "href",
      "/teacher/reports/ses-1",
    );
  });

  it("«Назад к рейтингу» только для адреса рейтинга; «Назначить тренировку» с учеником", async () => {
    const { unmount } = render(
      <TeacherStudentScreen studentId="u-5" from="/teacher/rating?groupId=Г-1&sort=attempts" api={full()} />,
    );
    expect(await screen.findByRole("link", { name: "Назад к рейтингу" })).toHaveAttribute(
      "href",
      "/teacher/rating?groupId=Г-1&sort=attempts",
    );
    expect(screen.getByRole("link", { name: "Назначить тренировку" }).getAttribute("href")).toContain("u-5");
    unmount();
    render(<TeacherStudentScreen studentId="u-5" from="https://evil.example" api={full()} />);
    expect(await screen.findByRole("link", { name: "К списку" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Назад к рейтингу" })).not.toBeInTheDocument();
  });
});
