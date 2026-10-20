import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { StudentRatingResponse, StudentRatingRow } from "@/shared/api";

import type { RatingApi } from "../api/ratingApi";
import { TeacherRatingScreen } from "./TeacherRatingScreen";

const replace = vi.fn();
const push = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(search),
}));

function row(id: string, fullName: string, patch: Partial<StudentRatingRow> = {}): StudentRatingRow {
  return {
    studentId: id,
    fullName,
    groupId: "Г-1",
    attempts: 4,
    averageScore: 70,
    averageReactionMs: 20_000,
    averageProcessingMs: 120_000,
    withinNormsShare: 0.75,
    ratingOperator112: 1010,
    ratingDds: 990,
    enoughData: true,
    ...patch,
  };
}

const DATA: StudentRatingResponse = {
  groups: [
    { groupId: "Г-1", studentCount: 3 },
    { groupId: "Г-2", studentCount: 2 },
  ],
  groupId: "Г-1",
  period: "all",
  mode: "all",
  norms: { reactionMs: 30_000, processingMs: 180_000 },
  minAttempts: 3,
  rows: [
    row("s-1", "Иванов", { averageScore: 60, averageReactionMs: 41_000 }),
    row("s-2", "Петров", { averageScore: 90 }),
    row("s-3", "Сидоров", { attempts: 1, enoughData: false, averageScore: 99 }),
  ],
};

const api = (overrides: Partial<RatingApi> = {}): RatingApi => ({
  rating: vi.fn().mockResolvedValue(DATA),
  ...overrides,
});

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("TeacherRatingScreen", () => {
  beforeEach(() => {
    search = "";
    replace.mockReset();
    push.mockReset();
  });

  it("сортирует по среднему баллу, даёт места и метку «мало данных»", async () => {
    render(<TeacherRatingScreen api={api()} />);
    await screen.findByText("Петров");
    const rows = bodyRows();
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Петров");
    expect(rows[1]).toHaveTextContent("Иванов");
    expect(rows[2]).toHaveTextContent("Сидоров");
    expect(rows[2]).toHaveTextContent("мало данных");
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveTextContent("—");
  });

  it("выделяет реакцию хуже норматива подписью, а не только цветом", async () => {
    render(<TeacherRatingScreen api={api()} />);
    await screen.findByText("Иванов");
    expect(screen.getByText("— хуже норматива")).toBeInTheDocument();
  });

  it("сортировка по заголовку меняет адрес, текущий столбец помечен aria-sort", async () => {
    render(<TeacherRatingScreen api={api()} />);
    await screen.findByText("Петров");
    expect(screen.getByRole("columnheader", { name: /Средний балл/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    fireEvent.click(screen.getByRole("button", { name: /Реакция/ }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("sort=averageReactionMs"));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("dir=asc"));
  });

  it("ссылка на профиль несёт адрес рейтинга для возврата", async () => {
    search = "groupId=Г-1&mode=dds&period=all&sort=attempts&dir=desc";
    render(<TeacherRatingScreen api={api()} />);
    const link = await screen.findByRole("link", { name: "Петров" });
    const from = new URL(link.getAttribute("href") ?? "", "http://test").searchParams.get("from");
    expect(from).toBe("/teacher/rating?groupId=%D0%93-1&mode=dds&period=all&sort=attempts&dir=desc");
  });

  it("без закреплённых групп — пояснение", async () => {
    render(
      <TeacherRatingScreen
        api={api({ rating: vi.fn().mockResolvedValue({ ...DATA, groups: [], groupId: null, rows: [] }) })}
      />,
    );
    expect(await screen.findByText("Нет закреплённых групп")).toBeInTheDocument();
  });

  it("отказ сервера показывается текстом ошибки", async () => {
    const rating = vi
      .fn()
      .mockRejectedValue(new ApiError(403, "forbidden", "Нет доступа к группе / обучающемуся"));
    render(<TeacherRatingScreen api={api({ rating })} />);
    expect(await screen.findByText(/Нет доступа к группе/)).toBeInTheDocument();
  });
});
