/*
 * Журнал отчётов поверх настоящего route handler мок-API (T3.4-02, T3.4-03):
 * fetch подменён диспетчером на app/api/mock/reports/journal. Playwright в проекте нет — сквозной
 * сценарий «фильтр → таблица» закрыт интеграционным тестом на реальных данных моков.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as journalRoute } from "../../../../app/api/mock/reports/journal/route";
import { resetMockStore } from "../../../../app/api/mock/_server/testing";
import { ReportsJournal } from "./ReportsJournal";

const TEACHER_ID = "u-002";
const requestedUrls: string[] = [];

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  requestedUrls.push(`${url.pathname}${url.search}`);
  return journalRoute(new Request(url));
}

async function renderJournal() {
  const view = render(<ReportsJournal teacherId={TEACHER_ID} />);
  await waitFor(() => expect(screen.queryByText("Загрузка журнала…")).not.toBeInTheDocument());
  return view;
}

beforeEach(() => {
  resetMockStore();
  requestedUrls.length = 0;
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Журнал отчётов /teacher/reports", () => {
  it("строки = занятия преподавателя из моков: дата, группа, средний балл, статус, ссылка на отчёт", async () => {
    await renderJournal();
    expect(requestedUrls[0]).toContain(`/api/mock/reports/journal?teacherId=${TEACHER_ID}`);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    const link = screen.getByRole("link", { name: "16.09.2026" });
    const finished = link.closest("tr") as HTMLElement;
    expect(finished).toHaveTextContent("ДДС-01");
    expect(within(finished).getByText("85")).toBeInTheDocument();
    expect(within(finished).getByText("отчёт сформирован")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/teacher/reports/ses-2026-09-16-01");
    expect(screen.getByText("черновик")).toBeInTheDocument();
  });

  it("фильтр «курсант» + период сужают журнал, сброс возвращает весь", async () => {
    await renderJournal();
    fireEvent.change(screen.getByLabelText("Курсант"), { target: { value: "u-005" } });
    fireEvent.change(screen.getByLabelText("Период с"), { target: { value: "2026-09-16" } });
    fireEvent.change(screen.getByLabelText("по"), { target: { value: "2026-09-16" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(requestedUrls.at(-1)).toContain("studentId=u-005");
    expect(requestedUrls.at(-1)).toContain("from=2026-09-16");
    expect(screen.queryByText("черновик")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "сбросить" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  });

  it("значения фильтров — из данных мока, без хардкода", async () => {
    await renderJournal();
    const groups = within(screen.getByLabelText("Группа")).getAllByRole("option");
    expect(groups.map((option) => option.textContent)).toEqual(["все", "ДДС-01"]);
    expect(within(screen.getByLabelText("Курсант")).getAllByRole("option").length).toBeGreaterThan(1);
  });
});
