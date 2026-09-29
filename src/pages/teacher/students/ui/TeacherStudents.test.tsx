import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ApiError } from "@/shared/api";
import type { PublicUser, StudentProfile } from "@/shared/api";

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
  ...overrides,
});

describe("groupStudents", () => {
  it("ограничивает закреплёнными группами и сортирует по алфавиту", () => {
    expect(
      groupStudents(STUDENTS, ["Г-1"]).map(([group, members]) => [group, members.map((m) => m.id)]),
    ).toEqual([["Г-1", ["u-5", "u-7"]]]);
    expect(groupStudents(STUDENTS).map(([group]) => group)).toEqual(["Г-1", "Г-2"]);
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

  it("группы не закреплены за обучающимися — пустое состояние", async () => {
    render(
      <SessionProvider user={{ ...teacher, assignedGroups: ["Г-9"] }}>
        <TeacherStudentsScreen api={makeApi()} />
      </SessionProvider>,
    );
    expect(await screen.findByText("Обучающихся нет")).toBeInTheDocument();
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
