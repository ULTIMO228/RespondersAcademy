/*
 * «Мой прогресс» поверх настоящих route handlers мок-API: fetch подменён диспетчером на app/api/mock/**,
 * cookie сессии — из document.cookie (как в браузере). Проверка изоляции: видны только свои попытки.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "@/entities/user";

import { GET as evaluationRoute } from "../../../../app/api/mock/attempts/[id]/evaluation/route";
import { POST as feedbackRoute } from "../../../../app/api/mock/reports/feedback/route";
import { GET as cardRoute } from "../../../../app/api/mock/cards/[id]/route";
import { GET as reportsRoute } from "../../../../app/api/mock/reports/route";
import { GET as scenariosRoute } from "../../../../app/api/mock/scenarios/route";
import { GET as sessionsRoute } from "../../../../app/api/mock/sessions/route";
import { defaultProgressApi } from "../api/progressApi";
import type { ProgressApi } from "../api/progressApi";
import { ProgressScreen } from "./ProgressScreen";

type RouteHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const ROUTE_TABLE: [RegExp, RouteHandler][] = [
  [/^\/reports$/, reportsRoute as RouteHandler],
  [/^\/sessions$/, sessionsRoute as RouteHandler],
  [/^\/scenarios$/, scenariosRoute as RouteHandler],
  [/^\/attempts\/([^/]+)\/evaluation$/, evaluationRoute as RouteHandler],
  [/^\/cards\/([^/]+)$/, cardRoute as RouteHandler],
];

const fetchedPaths: string[] = [];

/** Диспетчер fetch → route handler; signal не передаётся (jsdom AbortSignal ≠ undici). */
async function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const path = url.pathname.replace(/^\/api\/mock/, "");
  fetchedPaths.push(`${path}${url.search}`);
  for (const [pattern, handler] of ROUTE_TABLE) {
    const match = pattern.exec(path);
    if (!match) continue;
    const request = new Request(url, { headers: { cookie: document.cookie } });
    return handler(request, { params: Promise.resolve({ id: decodeURIComponent(match[1] ?? "") }) });
  }
  return new Response(JSON.stringify({ error: { code: "notFound", message: path } }), { status: 404 });
}

function signIn(userId: string) {
  sessionStore.set({
    userId,
    role: "student",
    token: `mock-${userId}`,
    twoFactorUsed: true,
    issuedAt: new Date().toISOString(),
  });
}

async function renderReady(userId: string, api?: ProgressApi) {
  signIn(userId);
  const generator = { generate: vi.fn(async () => new Blob(["%PDF-1.4"], { type: "application/pdf" })) };
  const saver = { save: vi.fn() };
  const view = render(
    <ProgressScreen fullName="Иванов Сергей Петрович" api={api} certificate={{ generator, saver }} />,
  );
  await waitFor(() => expect(screen.queryByText("Загрузка результатов…")).not.toBeInTheDocument());
  return { ...view, generator, saver };
}

beforeEach(() => {
  fetchedPaths.length = 0;
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.clear();
});

describe("ProgressScreen — курсант u-005 (демо-вход ivanov)", () => {
  it("сводка совпадает с ручным расчётом по sessions.json + reports.json", async () => {
    await renderReady("u-005");
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /против норматива 0:30: 0:18/ })).toBeInTheDocument();
    expect(
      screen.getByRole("timer", { name: /против норматива 3:00: 3:25, норматив превышен/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("100 %")).toBeInTheDocument();
    expect(screen.getByText("Период: 16.09.2026")).toBeInTheDocument();
    expect(fetchedPaths).toContain("/reports?studentId=u-005");
  });

  it("история — только свои попытки; раскрытие показывает баллы, комментарий ИИ", async () => {
    await renderReady("u-005");
    const toggles = screen.getAllByRole("button", { name: /Разбор попытки/ });
    expect(toggles).toHaveLength(2);
    expect(fetchedPaths).not.toContain("/attempts/att-03/evaluation");
    fireEvent.click(toggles[0]);
    const criteria = screen.getByRole("region", { name: "Баллы по критериям" });
    expect(within(criteria).getByText("Интегральный балл")).toBeInTheDocument();
    // aiComment попытки в разборе + aiComment отчёта в «Рекомендациях системы».
    expect(screen.getAllByText(/Нормативы соблюдены\. Реакция 14 с/)).toHaveLength(2);
    expect(screen.getByText(/Правка преподавателя не вносилась/)).toBeInTheDocument();
  });

  it("рекомендации с бейджем «ИИ»; сертификат скачивается генератором без сети", async () => {
    const { generator, saver } = await renderReady("u-005");
    expect(screen.getByText(/Рекомендуется переход на следующий уровень сложности/)).toBeInTheDocument();
    expect(screen.getAllByText("ИИ").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("этап 2 / опционально")).toBeInTheDocument();
    const callsBefore = fetchedPaths.length;
    fireEvent.click(screen.getByRole("button", { name: "Скачать сертификат (PDF)" }));
    await waitFor(() => expect(saver.save).toHaveBeenCalledTimes(1));
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: "Иванов Сергей Петрович", integralScore: 96, cardCount: 2 }),
    );
    expect(saver.save.mock.calls[0][1]).toMatch(/^sertifikat-arm112-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(fetchedPaths.length).toBe(callsBefore);
  });

  it("графики по ChartData отчёта: 2 точки динамики, 5 столбцов ошибок + табличный дубль", async () => {
    const { container } = await renderReady("u-005");
    const [lineChart, barChart] = container.querySelectorAll("svg");
    expect(lineChart.querySelectorAll("[data-point]")).toHaveLength(2);
    expect(barChart.querySelectorAll("[data-bar]")).toHaveLength(5);
    const table = screen.getByRole("table", { name: "Динамика балла по попыткам (карточка №)" });
    expect(within(table).getByText("98")).toBeInTheDocument();
    expect(within(table).getByText("95")).toBeInTheDocument();
  });
});

describe("ProgressScreen — курсант u-006 (ошибки и правка преподавателя)", () => {
  it("«Мои ошибки»: группы и счётчики из мок-оценки, грамматика с эталоном", async () => {
    const { container } = await renderReady("u-006");
    const counts = Object.fromEntries(
      [...container.querySelectorAll("[data-category]")].map((row) => [
        row.getAttribute("data-category"),
        row.lastElementChild?.textContent,
      ]),
    );
    expect(counts).toEqual({ timing: "2", filling: "0", grammar: "2", statusSequence: "0", missedCall: "1" });
    const grammar = screen.getByRole("list", { name: "Примеры: Грамматика" });
    expect(within(grammar).getByText("принято")).toBeInTheDocument();
    expect(within(grammar).getByText("пренято")).toBeInTheDocument();
  });

  it("правка преподавателя из GET /attempts/[id]/evaluation видна в разборе", async () => {
    const override = {
      score: 70,
      comment: "Учтена сложность вызова",
      at: "2026-09-16T11:00:00+03:00",
      by: "u-002",
    };
    const api: ProgressApi = {
      ...defaultProgressApi,
      getAttemptEvaluation: async (id, signal) => ({
        ...(await defaultProgressApi.getAttemptEvaluation(id, signal)),
        teacherOverride: override,
      }),
    };
    await renderReady("u-006", api);
    fireEvent.click(screen.getByRole("button", { name: /Разбор попытки/ }));
    expect(
      within(screen.getByTestId("teacher-override")).getByText("Учтена сложность вызова"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("70").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ProgressScreen — состояния", () => {
  it("курсант без попыток: пустые блоки, графики с нулями, сертификат недоступен", async () => {
    await renderReady("u-008");
    expect(screen.getByText("Попыток пока нет")).toBeInTheDocument();
    expect(screen.getByText("Рекомендаций пока нет")).toBeInTheDocument();
    expect(screen.getByText(/Динамика появится после первого отчёта/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать сертификат (PDF)" })).toBeDisabled();
  });

  it("ошибка сети → сообщение и «Повторить»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    signIn("u-005");
    render(<ProgressScreen fullName="Иванов Сергей Петрович" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет соединения с сервером");
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});

describe("ProgressScreen — обратная связь преподавателя (T3.4-10)", () => {
  it("комментарий, отправленный из отчёта, виден курсанту с подписью преподавателя", async () => {
    const sent = await feedbackRoute(
      new Request("http://localhost/api/mock/reports/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: "rep-2026-09-16-01-u-005",
          teacherId: "u-002",
          text: "Держите темп, следите за орфографией",
          recommendations: ["Повторить регламент первичной обработки"],
        }),
      }),
    );
    expect(sent.status).toBe(201);
    await renderReady("u-005");
    expect(screen.getByText("Держите темп, следите за орфографией")).toBeInTheDocument();
    expect(screen.getByText("Повторить регламент первичной обработки")).toBeInTheDocument();
    expect(screen.getAllByText(/Преподаватель Морозова Елена Сергеевна/).length).toBeGreaterThan(0);
  });
});
