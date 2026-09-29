import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { toView } from "@/entities/assignment";
import { SessionProvider } from "@/entities/user";
import { ApiError, ServerRequiredError } from "@/shared/api";
import type {
  Analytics,
  Assignment,
  AssignmentDetail,
  HistoryItem,
  PublicUser,
  Recommendation,
  Stats,
} from "@/shared/api";

import type { StudentHomeApi } from "../api/homeApi";
import { StudentHomeScreen } from "./StudentHomeScreen";

const USER: PublicUser = {
  id: "u-005",
  login: "ivanov",
  fullName: "Иванов Сергей Петрович",
  role: "student",
  armNumber: 1,
  isActive: true,
};
const NOW = Date.parse("2026-09-29T12:00:00+03:00");

const stats = (count: number, score: number, reactionMs: number, processingMs: number): Stats => ({
  count,
  averageScore: score,
  averageReactionMs: reactionMs,
  averageProcessingMs: processingMs,
  replays: 0,
  hintsShown: 0,
});

const ANALYTICS: Analytics = {
  byMode: { dds: stats(1, 70, 40_000, 300_000), operator112: stats(3, 90, 20_000, 200_000) },
  reactionMs: 25_000,
  topErrors: [],
  dynamics: { labels: ["2026-09-25"], values: [70] },
  byGroup: {},
  byFormat: { training: stats(3, 90, 20_000, 160_000), exam: stats(1, 70, 40_000, 200_000) },
};

const EMPTY_ANALYTICS: Analytics = {
  ...ANALYTICS,
  byMode: { dds: stats(0, 0, 0, 0), operator112: stats(0, 0, 0, 0) },
};

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "asg-001",
    teacherId: "u-002",
    studentIds: ["u-005"],
    trainingMode: "operator112",
    format: "exam",
    cardIds: ["c-071", "c-090"],
    params: { passThreshold: 70, timeLimitSec: 600 },
    state: "active",
    createdAt: "2026-09-20T10:00:00+03:00",
    title: "Экзамен по режиму 112",
    dueAt: "2026-09-30T18:00:00+03:00",
    ...overrides,
  };
}

const HISTORY: HistoryItem[] = [
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
    mode: "dds",
    format: "exam",
    cardId: "c-020",
    title: "ДТП",
    score: 64,
    passed: false,
    at: "2026-09-27T10:00:00+03:00",
  },
];

const RECOMMENDATION: Recommendation = {
  id: "rec-1",
  kind: "article",
  targetId: "kb-012",
  title: "Пожар в жилом доме",
  reason: { errorType: "addressMissing", count: 5, ruleId: "R22" },
  createdAt: "2026-09-29T10:00:00+03:00",
};

function makeApi(overrides: Partial<StudentHomeApi> = {}): StudentHomeApi {
  return {
    assignments: vi.fn(async () => [toView(assignment(), null)]),
    analytics: vi.fn(async () => ANALYTICS),
    recommendations: vi.fn(async () => [RECOMMENDATION]),
    history: vi.fn(async () => ({ items: HISTORY, total: 2 })),
    ...overrides,
  };
}

function renderHome(api: StudentHomeApi) {
  return render(
    <SessionProvider user={USER}>
      <StudentHomeScreen api={api} nowMs={NOW} />
    </SessionProvider>,
  );
}

describe("главная обучающегося", () => {
  it("приветствие по имени-отчеству и все блоки с данными", async () => {
    renderHome(makeApi());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Здравствуйте, Сергей Петрович");
    const stats = await screen.findByRole("region", { name: "Мои показатели" });
    expect(within(stats).getByText("85")).toBeInTheDocument();
    expect(within(stats).getByText("3:45")).toBeInTheDocument();
    expect(within(stats).getByText("Реакция")).toBeInTheDocument();
    expect(within(stats).getByText("норматив 30 с")).toBeInTheDocument();
    expect(within(stats).getByText("выше: норматив 3 мин")).toBeInTheDocument();
    const lead = await screen.findByRole("region", { name: "Ближайшее задание" });
    expect(within(lead).getByText("Экзамен по режиму 112")).toBeInTheDocument();
    expect(within(lead).getByRole("link", { name: "Начать задание" })).toHaveAttribute(
      "href",
      "/arm/operator112?assignmentId=asg-001",
    );
    expect(within(lead).getByText("Осталось дней: 2")).toBeInTheDocument();
    expect(within(lead).getByText("70 баллов")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Изучить: Пожар в жилом доме" })).toHaveAttribute(
      "href",
      "/reference?article=kb-012",
    );
    expect(screen.getByText(/приоритет итоговой оценки — за преподавателем/)).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Последние результаты" });
    expect(within(table).getAllByRole("link", { name: "Разбор" })[0]).toHaveAttribute(
      "href",
      "/student/results/att-1?mode=operator112",
    );
    expect(within(table).getByText("Не сдан")).toBeInTheDocument();
  });

  it("реакция в норме (≤ 30 с) — без пометки «выше»; «ближайшее» — с наименьшим сроком", async () => {
    const api = makeApi({
      analytics: vi.fn(async () => ({
        ...ANALYTICS,
        byMode: { dds: stats(0, 0, 0, 0), operator112: stats(2, 80, 24_000, 150_000) },
      })),
      assignments: vi.fn(async () => [
        toView(assignment({ id: "asg-later", title: "Позже", dueAt: "2026-10-10T18:00:00+03:00" }), null),
        toView(assignment({ id: "asg-soon", title: "Скорее", dueAt: "2026-09-30T18:00:00+03:00" }), null),
      ]),
    });
    renderHome(api);
    const lead = await screen.findByRole("region", { name: "Ближайшее задание" });
    expect(await within(lead).findByText("Скорее")).toBeInTheDocument();
    expect(within(lead).queryByText("Позже")).toBeNull();
    const kpi = await screen.findByRole("region", { name: "Мои показатели" });
    expect(within(kpi).queryByText(/выше:/)).toBeNull();
  });

  it("новый пользователь: пустые состояния с действием, страница не падает", async () => {
    renderHome(
      makeApi({
        assignments: vi.fn(async () => []),
        analytics: vi.fn(async () => EMPTY_ANALYTICS),
        recommendations: vi.fn(async () => []),
        history: vi.fn(async () => ({ items: [], total: 0 })),
      }),
    );
    expect(await screen.findByText("Показателей пока нет")).toBeInTheDocument();
    expect(await screen.findByText("Активных заданий нет")).toBeInTheDocument();
    expect(await screen.findByText("Рекомендаций пока нет")).toBeInTheDocument();
    expect(await screen.findByText("Пока нет результатов")).toBeInTheDocument();
  });

  it("ошибка одного блока не роняет остальные; «Повторить» перезапрашивает только его", async () => {
    const recommendations = vi
      .fn<StudentHomeApi["recommendations"]>()
      .mockRejectedValueOnce(new ApiError(500, "internal", "Сервер ответил ошибкой"))
      .mockResolvedValue([RECOMMENDATION]);
    const api = makeApi({ recommendations });
    renderHome(api);
    expect(await screen.findByText("Не удалось загрузить рекомендации")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Мои показатели" })).toBeInTheDocument();
    expect(await screen.findByText("Экзамен по режиму 112")).toBeInTheDocument();
    screen.getByRole("button", { name: "Повторить" }).click();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Изучить: Пожар в жилом доме" })).toBeInTheDocument(),
    );
    expect(recommendations).toHaveBeenCalledTimes(2);
    expect(api.analytics).toHaveBeenCalledTimes(1);
  });

  it("без бэкенда все блоки показывают «требуется сервер»", async () => {
    const reject = () => Promise.reject(new ServerRequiredError());
    renderHome(makeApi({ assignments: reject, analytics: reject, recommendations: reject, history: reject }));
    await waitFor(() =>
      expect(screen.getAllByText("Раздел требует подключения к серверу тренажёра")).toHaveLength(4),
    );
  });

  it("открытая попытка другого задания показана отдельно с кнопкой «Продолжить»", async () => {
    const open = assignment({ id: "asg-open", title: "Открытое", dueAt: "2026-10-30T18:00:00+03:00" });
    const detail: AssignmentDetail = {
      ...open,
      progress: [{ studentId: "u-005", cardId: "c-071", state: "answered", attemptId: "att-open" }],
    };
    renderHome(
      makeApi({
        assignments: vi.fn(async () => [toView(assignment({ id: "asg-a" }), null), toView(open, detail)]),
      }),
    );
    expect(await screen.findByText(/У вас открыта попытка: Открытое/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Продолжить" })).toHaveAttribute(
      "href",
      "/arm/operator112?assignmentId=asg-open",
    );
  });

  it("задание другого режима запускается со страницы заданий (там показываются причины отказа)", async () => {
    renderHome(
      makeApi({ assignments: vi.fn(async () => [toView(assignment({ trainingMode: "chain" }), null)]) }),
    );
    const lead = await screen.findByRole("region", { name: "Ближайшее задание" });
    expect(await within(lead).findByRole("link", { name: "Начать задание" })).toHaveAttribute(
      "href",
      "/student/assignments",
    );
  });
});
