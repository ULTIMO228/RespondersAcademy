import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { Analytics, Recommendation, Stats } from "@/shared/api";

import type { StudentAnalyticsApi } from "../api/analyticsApi";
import { StudentAnalyticsScreen } from "./StudentAnalyticsScreen";

const stats = (count: number, score = 80, reaction = 0, processing = 0): Stats => ({
  count,
  averageScore: score,
  averageReactionMs: reaction,
  averageProcessingMs: processing,
  replays: 0,
  hintsShown: 0,
});

const ANALYTICS: Analytics = {
  byMode: { operator112: stats(3, 90, 24_000, 150_000), dds: stats(1, 70, 41_000, 200_000) },
  reactionMs: 28_000,
  topErrors: [
    { type: "addressMissing", count: 5 },
    { type: "timeExceeded", count: 2 },
  ],
  dynamics: { labels: ["2026-09-25", "2026-09-27", "2026-09-28"], values: [61, 78, 91] },
  byGroup: { Пожары: stats(2, 85, 26_000, 170_000) },
  byFormat: { training: stats(3, 88, 25_000, 160_000), exam: stats(1, 64, 33_000, 220_000) },
};

const RECOMMENDATION: Recommendation = {
  id: "rec-1",
  kind: "article",
  targetId: "kb-012",
  title: "Пожар в жилом доме",
  reason: { errorType: "addressMissing", count: 5, ruleId: "R22" },
  createdAt: "2026-09-29T10:00:00+03:00",
};

function makeApi(overrides: Partial<StudentAnalyticsApi> = {}): StudentAnalyticsApi {
  return {
    analytics: vi.fn(async () => ANALYTICS),
    recommendations: vi.fn(async () => [RECOMMENDATION]),
    accept: vi.fn(async (id: string) => ({ ...RECOMMENDATION, id, acceptedAt: "2026-09-29T12:00:00+03:00" })),
    ...overrides,
  };
}

describe("«Аналитика»", () => {
  it("динамика с таблицей-дублёром, время против нормативов 30 с и 3 мин, разрезы и ошибки", async () => {
    render(<StudentAnalyticsScreen api={makeApi()} />);
    expect(await screen.findByRole("img", { name: "Динамика баллов" })).toBeInTheDocument();
    const dynamicsTable = screen.getByRole("table", { name: "Динамика баллов" });
    expect(within(dynamicsTable).getByText("91")).toBeInTheDocument();
    expect(within(dynamicsTable).getByText("25.09")).toBeInTheDocument();

    const reaction = screen.getByRole("img", { name: "Средняя реакция по режимам, секунды" });
    expect(reaction.querySelector('[data-norm="30"]')).not.toBeNull();
    const processing = screen.getByRole("img", { name: "Среднее время отработки по режимам, секунды" });
    expect(processing.querySelector('[data-norm="180"]')).not.toBeNull();
    // у каждого графика есть таблица-дублёр
    expect(screen.getAllByRole("table", { name: /секунды|Динамика баллов/ })).toHaveLength(3);

    const breakdown = screen.getByRole("table", { name: "Разрезы по режиму, формату и группе" });
    expect(within(breakdown).getByText("Режим 112")).toBeInTheDocument();
    expect(within(breakdown).getByText("Группа: Пожары")).toBeInTheDocument();
    expect(within(breakdown).getByText("Экзамены")).toBeInTheDocument();

    const errors = screen.getByRole("table", { name: "Типичные ошибки" });
    expect(within(errors).getByText("Заполнение · addressMissing")).toBeInTheDocument();
    expect(within(errors).getByText("Тайминг · timeExceeded")).toBeInTheDocument();
  });

  it("«Изучить» принимает рекомендацию и ведёт к статье справочника (A5)", async () => {
    const api = makeApi();
    render(<StudentAnalyticsScreen api={api} />);
    const link = await screen.findByRole("link", { name: "Изучить: Пожар в жилом доме" });
    expect(link).toHaveAttribute("href", "/reference?article=kb-012");
    fireEvent.click(link);
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith("rec-1"));
    expect(await screen.findByText("Принята")).toBeInTheDocument();
  });

  it("уже принятая рекомендация повторно не принимается", async () => {
    const api = makeApi({
      recommendations: vi.fn(async () => [{ ...RECOMMENDATION, acceptedAt: "2026-09-28T10:00:00+03:00" }]),
    });
    render(<StudentAnalyticsScreen api={api} />);
    fireEvent.click(await screen.findByRole("link", { name: "Изучить: Пожар в жилом доме" }));
    expect(api.accept).not.toHaveBeenCalled();
    expect(screen.getByText("Принята")).toBeInTheDocument();
  });

  it("без попыток: пустое состояние вместо графиков; рекомендации не зависят от аналитики", async () => {
    const empty = { ...ANALYTICS, byMode: { operator112: stats(0), dds: stats(0) } };
    render(
      <StudentAnalyticsScreen
        api={makeApi({ analytics: vi.fn(async () => empty), recommendations: vi.fn(async () => []) })}
      />,
    );
    expect(await screen.findByText("Аналитики пока нет")).toBeInTheDocument();
    expect(await screen.findByText("Рекомендаций пока нет")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("сервер прислал только формат с попытками (нет ключа exam) — страница не падает", async () => {
    const partial = {
      ...ANALYTICS,
      byFormat: { training: stats(3, 88, 25_000, 160_000) },
    } as unknown as typeof ANALYTICS;
    render(<StudentAnalyticsScreen api={makeApi({ analytics: vi.fn(async () => partial) })} />);
    expect(await screen.findByText("Тренировки")).toBeInTheDocument();
    expect(screen.queryByText("Экзамены")).not.toBeInTheDocument();
  });

  it("пустой ряд динамики и пустые ошибки не ломают страницу", async () => {
    const api = makeApi({
      analytics: vi.fn(async () => ({ ...ANALYTICS, dynamics: { labels: [], values: [] }, topErrors: [] })),
    });
    render(<StudentAnalyticsScreen api={api} />);
    expect(await screen.findByText("Ряд пуст")).toBeInTheDocument();
    expect(screen.getByText("Типичных ошибок нет")).toBeInTheDocument();
  });

  it("ошибка аналитики не мешает рекомендациям; «нужен сервер» — отдельное состояние", async () => {
    const { unmount } = render(
      <StudentAnalyticsScreen
        api={makeApi({ analytics: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Сбой")) })}
      />,
    );
    expect(await screen.findByText("Не удалось загрузить аналитику")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Изучить: Пожар в жилом доме" })).toBeInTheDocument();
    unmount();
    const reject = () => Promise.reject(new ServerRequiredError());
    render(<StudentAnalyticsScreen api={makeApi({ analytics: reject, recommendations: reject })} />);
    await waitFor(() =>
      expect(screen.getAllByText("Раздел требует подключения к серверу тренажёра")).toHaveLength(2),
    );
  });
});
