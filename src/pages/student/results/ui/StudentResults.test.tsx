import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { HistoryItem, PageResponse } from "@/shared/api";
import type { ReviewModel } from "@/widgets/attempt-review";

import type { StudentResultsApi } from "../api/resultsApi";
import { StudentResultDetailScreen } from "./StudentResultDetailScreen";
import { StudentResultsScreen } from "./StudentResultsScreen";

const ITEMS: HistoryItem[] = [
  {
    attemptId: "att-1",
    mode: "operator112",
    format: "training",
    cardId: "c-010",
    title: "Пожар в жилом доме",
    score: 92,
    at: "2026-09-28T10:00:00+03:00",
  },
  {
    attemptId: "att-2",
    mode: "operator112",
    format: "exam",
    cardId: "c-020",
    title: "Экзамен, билет 2",
    score: 64,
    passed: false,
    at: "2026-09-27T10:00:00+03:00",
  },
  {
    attemptId: "att-3",
    mode: "dds",
    format: "training",
    cardId: "c-030",
    title: "ДТП",
    score: 88,
    at: "2026-09-25T10:00:00+03:00",
  },
];

function page(
  items: HistoryItem[],
  overrides: Partial<PageResponse<HistoryItem>> = {},
): PageResponse<HistoryItem> {
  return { items, total: items.length, page: 1, perPage: 10, ...overrides };
}

const REVIEW: ReviewModel = {
  totalScore: 85,
  axes: { timeScore: 90, correctnessScore: 80, grammarScore: 100, semanticScore: 70 },
  errors: [{ type: "addressMissing", message: "Не указан номер дома", severity: "major" }],
  fieldDiff: [{ field: "address", entered: "Москва", expected: "Москва, 14", ok: false }],
  aiComment: "Уточняйте адрес",
  assessorVersion: "operator112-v3",
  passed: false,
  reviewPending: false,
};

function makeApi(overrides: Partial<StudentResultsApi> = {}): StudentResultsApi {
  return {
    history: vi.fn(async () => page(ITEMS)),
    findAttempt: vi.fn(async () => ITEMS[1]),
    review: vi.fn(async () => REVIEW),
    ...overrides,
  };
}

describe("«Результаты»: список", () => {
  it("таблица попыток со ссылками на разбор с учётом режима", async () => {
    render(<StudentResultsScreen api={makeApi()} />);
    const table = await screen.findByRole("table", { name: "История попыток" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("link", { name: "Разбор: Пожар в жилом доме" })).toHaveAttribute(
      "href",
      "/student/results/att-1?mode=operator112",
    );
    expect(within(table).getByRole("link", { name: "Разбор: ДТП" })).toHaveAttribute(
      "href",
      "/student/results/att-3?mode=dds",
    );
    expect(within(table).getByText("Не сдан")).toBeInTheDocument();
    expect(within(table).getAllByText("Без вердикта")).toHaveLength(2);
  });

  it("фильтры режима и формата уходят в запрос и сбрасывают страницу на первую", async () => {
    const api = makeApi({ history: vi.fn(async () => page(ITEMS, { total: 25 })) });
    render(<StudentResultsScreen api={api} />);
    await screen.findByRole("table", { name: "История попыток" });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() =>
      expect(api.history).toHaveBeenLastCalledWith(
        { mode: undefined, format: undefined, page: 3, perPage: 10 },
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText("Режим"), { target: { value: "dds" } });
    await waitFor(() =>
      expect(api.history).toHaveBeenLastCalledWith(
        { mode: "dds", format: undefined, page: 1, perPage: 10 },
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText("Формат"), { target: { value: "exam" } });
    await waitFor(() =>
      expect(api.history).toHaveBeenLastCalledWith(
        { mode: "dds", format: "exam", page: 1, perPage: 10 },
        expect.anything(),
      ),
    );
  });

  it("пустая история: приглашение к заданиям; пустой результат фильтра: подсказка снять фильтры", async () => {
    const empty = makeApi({ history: vi.fn(async () => page([])) });
    const { unmount } = render(<StudentResultsScreen api={empty} />);
    expect(await screen.findByText("Пока нет результатов")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К заданиям" })).toHaveAttribute("href", "/student/assignments");
    unmount();
    render(<StudentResultsScreen api={empty} />);
    await screen.findByText("Пока нет результатов");
    fireEvent.change(screen.getByLabelText("Режим"), { target: { value: "dds" } });
    expect(await screen.findByText("По выбранным фильтрам ничего нет")).toBeInTheDocument();
  });

  it("ошибка и «нужен сервер» показываются вместо таблицы", async () => {
    const { unmount } = render(
      <StudentResultsScreen
        api={makeApi({ history: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Сбой")) })}
      />,
    );
    expect(await screen.findByText("Не удалось загрузить результаты")).toBeInTheDocument();
    unmount();
    render(
      <StudentResultsScreen
        api={makeApi({ history: vi.fn().mockRejectedValue(new ServerRequiredError()) })}
      />,
    );
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });
});

describe("«Результаты»: разбор попытки", () => {
  it("составляющие оценки, ошибки, сличение, комментарий ИИ с бейджем и пометкой приоритета преподавателя", async () => {
    const api = makeApi();
    render(<StudentResultDetailScreen attemptId="att-2" mode="operator112" api={api} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Разбор: Экзамен, билет 2");
    expect(api.review).toHaveBeenCalledWith("operator112", "att-2", expect.anything());
    expect(screen.getByText("Корректность")).toBeInTheDocument();
    expect(screen.getByText("80 / 100")).toBeInTheDocument();
    expect(screen.getByText("Не указан номер дома")).toBeInTheDocument();
    const diff = screen.getByRole("table", { name: "Сравнение с эталоном" });
    expect(within(diff).getByText("Москва, 14")).toBeInTheDocument();
    const ai = screen.getByRole("region", { name: "Комментарий ИИ" });
    expect(within(ai).getByText("Уточняйте адрес")).toBeInTheDocument();
    expect(within(ai).getByText("ИИ")).toBeInTheDocument();
    expect(within(ai).getByText(/приоритет выше оценки ИИ/)).toBeInTheDocument();
    expect(screen.getByText("Не сдан")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Ко всем результатам" })).toHaveAttribute(
      "href",
      "/student/results",
    );
  });

  it("попытка ДДС: без сличения; решение преподавателя выше оценки ИИ", async () => {
    const api = makeApi({
      review: vi.fn(async () => ({
        ...REVIEW,
        fieldDiff: null,
        passed: undefined,
        teacherOverride: {
          score: 90,
          comment: "Хорошая работа",
          by: "Морозова Е. С.",
          at: "2026-09-29T10:00:00+03:00",
        },
      })),
    });
    render(<StudentResultDetailScreen attemptId="att-3" mode="dds" api={api} />);
    await screen.findByRole("region", { name: "Решение преподавателя" });
    expect(screen.getByText("Хорошая работа")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Сравнение с эталоном" })).toBeNull();
    expect(api.review).toHaveBeenCalledWith("dds", "att-3", expect.anything());
  });

  it("список ошибок пуст — так и сказано", async () => {
    render(
      <StudentResultDetailScreen
        attemptId="att-1"
        mode="operator112"
        api={makeApi({ review: vi.fn(async () => ({ ...REVIEW, errors: [] })) })}
      />,
    );
    expect(await screen.findByText("Ошибок нет")).toBeInTheDocument();
  });

  it("оценки ещё нет (404): пояснение, а не ошибка страницы", async () => {
    const api = makeApi({
      review: vi.fn().mockRejectedValue(new ApiError(404, "evaluationPending", "Оценка ещё не готова")),
    });
    render(<StudentResultDetailScreen attemptId="att-9" mode="operator112" api={api} />);
    expect(await screen.findByText("Оценки пока нет")).toBeInTheDocument();
  });

  it("сбой сервера — ошибка с «Повторить»; «нужен сервер» — отдельное состояние", async () => {
    const failing = makeApi({
      review: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Сбой оценщика")),
    });
    const { unmount } = render(
      <StudentResultDetailScreen attemptId="att-2" mode="operator112" api={failing} />,
    );
    expect(await screen.findByText("Не удалось загрузить разбор")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    unmount();
    const noServer = makeApi({ review: vi.fn().mockRejectedValue(new ServerRequiredError()) });
    render(<StudentResultDetailScreen attemptId="att-2" mode="operator112" api={noServer} />);
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });

  it("попытки нет в истории: заголовок по идентификатору", async () => {
    render(
      <StudentResultDetailScreen
        attemptId="att-x"
        mode="dds"
        api={makeApi({ findAttempt: vi.fn(async () => null) })}
      />,
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Разбор: Попытка att-x");
  });
});
