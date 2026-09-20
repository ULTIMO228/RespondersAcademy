/*
 * Отчёт о занятии поверх настоящих route handlers мок-API (T3.4-04…T3.4-17): fetch подменён
 * диспетчером на app/api/mock/**, cookie преподавателя — из document.cookie (как в браузере).
 * Playwright в проекте нет: сквозной путь «отчёт → правка оценки → аудит → экспорт» закрыт здесь.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "@/entities/user";

import { listAuditLog, resetMockStore } from "../../../../app/api/mock/_server/testing";
import * as evaluation from "../../../../app/api/mock/attempts/[id]/evaluation/route";
import * as card from "../../../../app/api/mock/cards/[id]/route";
import * as reference from "../../../../app/api/mock/reference/route";
import * as feedback from "../../../../app/api/mock/reports/feedback/route";
import * as journal from "../../../../app/api/mock/reports/journal/route";
import * as reports from "../../../../app/api/mock/reports/route";
import * as sessions from "../../../../app/api/mock/sessions/route";
import { ReportSessionScreen } from "./ReportSessionScreen";

const SESSION_ID = "ses-2026-09-16-01";
const TEACHER = { id: "u-002", fullName: "Морозова Елена Сергеевна" };
/** ТЗ §7: отчёт формируется не дольше 30 секунд. */
const BUILD_NORM_SEC = 30;

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const ROUTE_TABLE: [RegExp, Handler][] = [
  [/^\/reports\/journal$/, journal.GET as Handler],
  [/^\/reports\/feedback$/, feedback.POST as Handler],
  [/^\/reports$/, reports.GET as Handler],
  [/^\/sessions$/, sessions.GET as Handler],
  [/^\/reference$/, reference.GET as Handler],
  [
    /^\/attempts\/([^/]+)\/evaluation$/,
    ((request, context) =>
      request.method === "POST"
        ? (evaluation.POST as Handler)(request, context)
        : (evaluation.GET as Handler)(request, context)) as Handler,
  ],
  [/^\/cards\/([^/]+)$/, card.GET as Handler],
];

/** Диспетчер fetch → route handler; signal не передаётся (jsdom AbortSignal ≠ undici). */
async function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const path = url.pathname.replace(/^\/api\/mock/, "");
  for (const [pattern, handler] of ROUTE_TABLE) {
    const match = pattern.exec(path);
    if (!match) continue;
    const request = new Request(url, {
      method: init?.method ?? "GET",
      headers: { cookie: document.cookie, ...(init?.headers as Record<string, string>) },
      body: init?.body as BodyInit | undefined,
    });
    return handler(request, { params: Promise.resolve({ id: decodeURIComponent(match[1] ?? "") }) });
  }
  return new Response(JSON.stringify({ error: { code: "notFound", message: path } }), { status: 404 });
}

function signInTeacher() {
  sessionStore.set({
    userId: TEACHER.id,
    role: "teacher",
    token: `mock-${TEACHER.id}`,
    twoFactorUsed: true,
    issuedAt: new Date().toISOString(),
  });
}

async function renderReport() {
  const saver = { save: vi.fn((file: Blob, fileName: string) => [file, fileName]) };
  const printer = { print: vi.fn() };
  const view = render(
    <ReportSessionScreen sessionId={SESSION_ID} teacher={TEACHER} saver={saver} printer={printer} />,
  );
  await waitFor(() => expect(screen.queryByText("Формирование отчёта…")).not.toBeInTheDocument());
  return { ...view, saver, printer };
}

/** Panel рисует <section> без aria-label: блок находим по его заголовку. */
function panelByTitle(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
}

function summaryTable(): HTMLElement {
  return screen.getByRole("table", { name: "Сводная таблица по курсантам" });
}

beforeEach(() => {
  resetMockStore();
  localStorage.clear();
  signInTeacher();
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.clear();
});

describe("Шапка, сводная таблица и детализация (T3.4-04…07)", () => {
  it("шапка: дата, преподаватель, режим и честная индикация «сформирован за N сек» (N ≤ 30)", async () => {
    const { container } = await renderReport();
    expect(
      screen.getByRole("heading", { name: /Отчёт о практическом занятии 16.09.2026/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(TEACHER.fullName)).toBeInTheDocument();
    expect(screen.getByText("самостоятельная")).toBeInTheDocument();
    const built = container.querySelector("[data-build-sec]") as HTMLElement;
    expect(Number(built.getAttribute("data-build-sec"))).toBeLessThanOrEqual(BUILD_NORM_SEC);
    expect(built).toHaveTextContent(/Отчёт сформирован за \d+ сек/);
    expect(screen.getByRole("button", { name: "Скачать CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать PDF" })).toBeInTheDocument();
  });

  it("сводная таблица совпадает с reports.json, превышение норматива подсвечено", async () => {
    await renderReport();
    const petrova = within(summaryTable()).getByText("Петрова Анна Дмитриевна").closest("tr") as HTMLElement;
    expect(petrova).toHaveTextContent("48+18 с");
    expect(petrova).toHaveTextContent("310+130 с");
    expect(petrova).toHaveTextContent("66");
    const ivanov = within(summaryTable()).getByText("Иванов Сергей Петрович").closest("tr") as HTMLElement;
    expect(ivanov).toHaveTextContent("18−12 с");
    expect(within(ivanov).getAllByRole("cell")[2]).toHaveTextContent("2");
  });

  it("грамматика построчно, severity-фильтр и блок «Вызовы» с транскриптом", async () => {
    const { container } = await renderReport();
    const grammarRow = screen.getByText("Сообщение пренято").closest("tr") as HTMLElement;
    expect(grammarRow).toHaveTextContent("Действие диспетчера");
    expect(grammarRow).toHaveTextContent("Сообщение принято");
    expect(grammarRow).toHaveTextContent("орфография");
    expect(container.querySelectorAll("[data-severity-filter]")).toHaveLength(3);
    fireEvent.click(container.querySelector("[data-severity-filter='critical']") as HTMLElement);
    const severities = [...container.querySelectorAll("[data-severity]")].map((row) =>
      row.getAttribute("data-severity"),
    );
    expect(new Set(severities)).toEqual(new Set(["critical"]));
    const call = container.querySelector("[data-call='302']") as HTMLElement;
    expect(call).toHaveTextContent("0:35");
    expect(call).toHaveTextContent("Запах газа в квартире");
  });
});

describe("Веса критериев и правка оценки (T3.4-08, T3.4-09)", () => {
  it("изменение весов пересчитывает балл попытки, сумма ≠ 100 % помечается ошибкой", async () => {
    const { container } = await renderReport();
    const scoreOf = (attemptId: string) =>
      Number(
        (container.querySelector(`[aria-label='Попытка ${attemptId}'] [data-attempt-score]`) as HTMLElement)
          .dataset.attemptScore,
      );
    const before = scoreOf("att-03");
    fireEvent.change(container.querySelector("[data-weight='grammarScore']") as HTMLElement, {
      target: { value: "50" },
    });
    expect(screen.getByText(/Сумма весов/)).toHaveTextContent("Сумма весов: 130 %");
    expect(scoreOf("att-03")).toBe(before);
    fireEvent.change(container.querySelector("[data-weight='timeScore']") as HTMLElement, {
      target: { value: "0" },
    });
    await waitFor(() => expect(scoreOf("att-03")).not.toBe(before));
    expect(screen.getByText(/Сумма весов/)).toHaveTextContent("Сумма весов: 100 %");
  });

  it("правка оценки требует комментарий, пересчитывает итог и пишет аудит «было/стало»", async () => {
    const { container } = await renderReport();
    const panel = screen.getByRole("region", { name: "Оценка преподавателя" });
    fireEvent.click(within(panel).getByRole("button", { name: "Сохранить оценку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Укажите комментарий");
    fireEvent.change(within(panel).getByLabelText("Балл преподавателя (0–100)"), {
      target: { value: "70" },
    });
    fireEvent.change(within(panel).getByLabelText(/Комментарий преподавателя/), {
      target: { value: "Звонок 302 засчитан частично" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Сохранить оценку" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Журнал аудита оценок")).toHaveTextContent("было 98 → стало 70"),
    );
    expect(screen.getByLabelText("Журнал аудита оценок")).toHaveTextContent(TEACHER.fullName);
    const ivanov = within(summaryTable()).getByText("Иванов Сергей Петрович").closest("tr") as HTMLElement;
    // (70 + 95) / 2 = 82 — итог отчёта пересчитан мок-слоем.
    await waitFor(() => expect(within(ivanov).getByText("82")).toBeInTheDocument());
    expect(listAuditLog()[0].action).toBe("evaluation.override");
    expect(container.querySelector("[data-final-score]")).toHaveTextContent("70");
  });
});

describe("Обратная связь, инсайты, графики и экспорт (T3.4-10…T3.4-17)", () => {
  it("пустой комментарий не отправляется; отправленный виден с подписью преподавателя", async () => {
    await renderReport();
    const panel = panelByTitle("5. Обратная связь курсанту");
    fireEvent.change(within(panel).getByLabelText("Комментарий к результату"), { target: { value: " " } });
    fireEvent.click(within(panel).getByRole("button", { name: "Отправить курсанту" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("не может быть пустым");
    fireEvent.change(within(panel).getByLabelText("Комментарий к результату"), {
      target: { value: "Держите темп, следите за орфографией" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Отправить курсанту" }));
    await waitFor(() =>
      expect(within(panel).getByRole("status")).toHaveTextContent("Отправлено в «Прогресс» курсанта"),
    );
  });

  it("инсайты ИИ по группе и графики byStage/dynamics с нормативами 30/180", async () => {
    const { container } = await renderReport();
    const insights = panelByTitle("6. Инсайты ИИ по группе");
    expect(within(insights).getAllByText("ИИ").length).toBeGreaterThan(1);
    const byStage = container.querySelector("[data-block='byStage']") as HTMLElement;
    expect(byStage.querySelector("[data-norm='30']")).not.toBeNull();
    expect(byStage.querySelector("[data-norm='180']")).not.toBeNull();
    const dynamics = container.querySelector("[data-block='dynamics']") as HTMLElement;
    expect(dynamics.querySelectorAll("[data-bar]")).toHaveLength(3);
  });

  it("CSV собирается из строк сводной таблицы, PDF — системная печать", async () => {
    const { saver, printer } = await renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Скачать CSV" }));
    expect(saver.save).toHaveBeenCalledTimes(1);
    const [blob, fileName] = saver.save.mock.calls[0];
    expect(fileName).toBe("otchet-ses-2026-09-16-01-2026-09-16.csv");
    // Blob.text() по спеке срезает BOM при декодировании — проверяем сами байты файла.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("ФИО;№ АРМ;Карточек отработано");
    expect(csv).toContain("Петрова Анна Дмитриевна;8;1;48;+18 с;310;+130 с;2;66");
    fireEvent.click(screen.getByRole("button", { name: "Скачать PDF" }));
    expect(printer.print).toHaveBeenCalledTimes(1);
  });
});

describe("Print-вёрстка отчёта (T3.4-17)", () => {
  it("на одной странице есть все обязательные блоки ТЗ §10, интерактив помечен скрываемым в печати", async () => {
    const { container } = await renderReport();
    for (const title of [
      "2. Сводная таблица по курсантам",
      "3. Детализация по попыткам",
      "4. Оценка: ИИ vs преподаватель",
      "5. Обратная связь курсанту",
      "6. Инсайты ИИ по группе",
      "7. Графики и диаграммы",
    ]) {
      expect(panelByTitle(title)).toBeInTheDocument();
    }
    // Действия, замечания, тайминги, грамматика и вызовы — в одном документе, без раскрытия по клику.
    expect(container.querySelectorAll(".report__stages").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".report__issues").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-call]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    // Блоки, скрытые правилами @media print: фильтр severity, форма весов и кнопки экспорта.
    for (const selector of [".report__filter", ".report__weights", ".export"]) {
      expect(container.querySelector(selector)).not.toBeNull();
    }
  });
});
