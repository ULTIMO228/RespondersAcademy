import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { PerformanceReport, PerformanceStats } from "@/shared/api";

import type { PerformanceApi } from "../api/performanceApi";
import { PerformanceScreen } from "./PerformanceScreen";

const stats = (over: Partial<PerformanceStats> = {}): PerformanceStats => ({
  students: 2,
  activeStudents: 2,
  attempts: 10,
  avgScore: 83.6,
  previousAvgScore: 80,
  delta: 3.6,
  reactionInNormShare: 0.75,
  processingInNormShare: 0.9,
  exams: 4,
  examsPassed: 3,
  weakStage: "Статусы реагирования",
  level: "ok",
  ...over,
});

const REPORT: PerformanceReport = {
  filters: { mode: "all", period: "1m" },
  generatedAt: "2026-10-19T20:00:00+03:00",
  thresholds: { minAttemptsStudent: 3, minAttemptsGroup: 5, riskScore: 60 },
  totals: stats({ students: 6, attempts: 30 }),
  groups: [
    { groupId: "Г-1", title: "Г-1", stats: stats() },
    {
      groupId: "Г-2",
      title: "Г-2",
      stats: stats({
        attempts: 2,
        avgScore: null,
        delta: null,
        reactionInNormShare: null,
        processingInNormShare: null,
        weakStage: null,
        level: "noData",
      }),
    },
  ],
  students: [
    {
      studentId: "u1",
      name: "Андреев Алексей",
      groupId: "Г-1",
      stats: stats({ avgScore: 54, level: "risk" }),
    },
    { studentId: "u2", name: "Белова Анна", groupId: null, stats: stats() },
  ],
  topErrors: [{ label: "Не проставлен статус «Принята»", attempts: 7 }],
};

const makeApi = (overrides: Partial<PerformanceApi> = {}): PerformanceApi => ({
  report: vi.fn().mockResolvedValue(REPORT),
  groups: vi.fn().mockResolvedValue([
    { groupId: "Г-1", title: "Г-1", studentCount: 2 },
    { groupId: "Г-2", title: "Г-2", studentCount: 1 },
  ]),
  ...overrides,
});

describe("страница «Успеваемость»", () => {
  it("итоговые показатели крупно: обучающиеся, попытки, средний балл с изменением, нормативы, экзамены", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    const totals = await screen.findByRole("region", { name: "Итого" });
    expect(within(totals).getByText("6")).toBeInTheDocument();
    expect(within(totals).getByText("30")).toBeInTheDocument();
    expect(within(totals).getByText("83,6")).toBeInTheDocument();
    expect(within(totals).getByText(/\+3,6/)).toBeInTheDocument();
    expect(within(totals).getByText("75%")).toBeInTheDocument();
    expect(within(totals).getByText("3 из 4")).toBeInTheDocument();
  });

  it("запрашивает сводку по умолчанию: все режимы, месяц, все группы", async () => {
    const api = makeApi();
    render(<PerformanceScreen api={api} />);
    await screen.findByRole("region", { name: "Итого" });
    expect(api.report).toHaveBeenCalledWith({ mode: "all", period: "1m" }, expect.anything());
  });

  it("группы: оценка значком и словом, «мало данных» без выдуманных чисел", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    const table = await screen.findByRole("table", { name: "Сравнение групп" });
    const row1 = within(table).getByRole("row", { name: /Г-1/ });
    expect(within(row1).getByText(/в норме/)).toBeInTheDocument();
    const row2 = within(table).getByRole("row", { name: /Г-2/ });
    expect(within(row2).getByText(/мало данных/)).toBeInTheDocument();
    expect(within(row2).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("обучающиеся: ФИО и зона риска словом; без группы — «Без группы»", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    await screen.findByRole("table", { name: "Сравнение групп" });
    fireEvent.click(screen.getByRole("button", { name: "Обучающиеся" }));
    const table = await screen.findByRole("table", { name: "Успеваемость обучающихся" });
    expect(within(table).getByText("Андреев Алексей")).toBeInTheDocument();
    expect(within(table).getByText(/зона риска/)).toBeInTheDocument();
    expect(within(table).getByText("Без группы")).toBeInTheDocument();
  });

  it("ошибки: самые частые формулировки", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    await screen.findByRole("table", { name: "Сравнение групп" });
    fireEvent.click(screen.getByRole("button", { name: "Ошибки" }));
    expect(await screen.findByText("Не проставлен статус «Принята»")).toBeInTheDocument();
  });

  it("смена режима и периода перезапрашивает сводку; группа попадает в запрос", async () => {
    const api = makeApi();
    render(<PerformanceScreen api={api} />);
    await screen.findByRole("region", { name: "Итого" });
    fireEvent.click(screen.getByRole("button", { name: "ДДС" }));
    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith({ mode: "dds", period: "1m" }, expect.anything()),
    );
    fireEvent.click(screen.getByRole("button", { name: "2 недели" }));
    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith({ mode: "dds", period: "2w" }, expect.anything()),
    );
    fireEvent.change(await screen.findByLabelText("Группа"), { target: { value: "Г-2" } });
    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith(
        { mode: "dds", period: "2w", groupId: "Г-2" },
        expect.anything(),
      ),
    );
  });

  it("свои даты: запрос уходит, только когда заданы обе даты", async () => {
    const api = makeApi();
    render(<PerformanceScreen api={api} />);
    await screen.findByRole("region", { name: "Итого" });
    fireEvent.click(screen.getByRole("button", { name: "Свои даты" }));
    const calls = (api.report as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.change(screen.getByLabelText("С даты"), { target: { value: "2026-10-01" } });
    expect((api.report as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText("По дату"), { target: { value: "2026-10-15" } });
    await waitFor(() =>
      expect(api.report).toHaveBeenLastCalledWith(
        { mode: "all", period: "range", from: "2026-10-01", to: "2026-10-15" },
        expect.anything(),
      ),
    );
  });

  it("«Скачать в Excel» и «Распечатать» — обычные ссылки с теми же фильтрами", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    await screen.findByRole("region", { name: "Итого" });
    const excel = screen.getByRole("link", { name: /Скачать в Excel/ });
    expect(excel).toHaveAttribute(
      "href",
      expect.stringContaining("/performance/export.xlsx?mode=all&period=1m"),
    );
    expect(excel).toHaveAttribute("download");
    const pdf = screen.getByRole("link", { name: /Распечатать/ });
    expect(pdf).toHaveAttribute(
      "href",
      expect.stringContaining("/performance/export.pdf?mode=all&period=1m"),
    );
    expect(pdf).toHaveAttribute("target", "_blank");
  });

  it("нет групп и обучающихся — понятное пустое состояние", async () => {
    const empty = {
      ...REPORT,
      groups: [],
      students: [],
      topErrors: [],
      totals: stats({ students: 0, attempts: 0, level: "noData", avgScore: null }),
    };
    render(<PerformanceScreen api={makeApi({ report: vi.fn().mockResolvedValue(empty) })} />);
    expect(await screen.findByText("Нет данных за выбранный период")).toBeInTheDocument();
  });

  it("403 и ошибка сервера показываются текстом с повтором; без бэкенда — «нужен сервер»", async () => {
    const denied = makeApi({
      report: vi
        .fn()
        .mockRejectedValue(new ApiError(403, "forbidden", "Нет доступа к группе / обучающемуся")),
    });
    const { unmount } = render(<PerformanceScreen api={denied} />);
    expect(await screen.findByText("Нет доступа к группе / обучающемуся")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    unmount();
    render(
      <PerformanceScreen api={makeApi({ report: vi.fn().mockRejectedValue(new ServerRequiredError()) })} />,
    );
    expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
  });
});

describe("подписи нормативов по режиму (T053, FR-011)", () => {
  it("режим 112: плитки и колонки называют ответ на вызов и отправку карточки", async () => {
    const report = { ...REPORT, filters: { mode: "operator112" as const, period: "1m" as const } };
    render(<PerformanceScreen api={makeApi({ report: vi.fn().mockResolvedValue(report) })} />);
    const totals = await screen.findByRole("region", { name: "Итого" });
    expect(within(totals).getByText(/ответ на вызов, норматив 30 с/)).toBeInTheDocument();
    expect(within(totals).getByText(/отправка карточки, норматив 3 мин/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Сравнение групп" });
    expect(within(table).getByText("Ответ на вызов в норме")).toBeInTheDocument();
  });

  it("режим ДДС: реакция на карточку и полная отработка", async () => {
    const report = { ...REPORT, filters: { mode: "dds" as const, period: "1m" as const } };
    render(<PerformanceScreen api={makeApi({ report: vi.fn().mockResolvedValue(report) })} />);
    const table = await screen.findByRole("table", { name: "Сравнение групп" });
    expect(within(table).getByText("Реакция на карточку в норме")).toBeInTheDocument();
    expect(within(table).queryByText("Ответ на вызов в норме")).not.toBeInTheDocument();
  });

  it("смешанный срез: не подменяет один норматив другим и просит выбрать режим", async () => {
    render(<PerformanceScreen api={makeApi()} />);
    const totals = await screen.findByRole("region", { name: "Итого" });
    expect(within(totals).getByText(/выберите режим/)).toBeInTheDocument();
  });
});
