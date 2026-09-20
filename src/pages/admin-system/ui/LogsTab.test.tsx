/*
 * Вкладка «Журналы и аудит» на настоящих route handlers (T4.2-22, T4.2-23): фильтры журнала аудита
 * по образцу экрана «аудит» ПОВ-112, пагинация и фильтр уровня системных журналов.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as auditRoute } from "../../../../app/api/mock/admin/audit/route";
import { GET as logsRoute } from "../../../../app/api/mock/admin/system/logs/route";
import { GET as servicesRoute } from "../../../../app/api/mock/admin/system/services/route";
import { GET as settingsRoute } from "../../../../app/api/mock/admin/system/settings/route";
import { GET as sessionsRoute } from "../../../../app/api/mock/sessions/route";
import { GET as usersRoute } from "../../../../app/api/mock/users/route";
import { resetMockStore } from "../../../../app/api/mock/_server/testing";
import { SystemShell } from "./SystemShell";

const ADMIN_ID = "u-001";
const requested: string[] = [];

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const path = url.pathname.replace("/api/mock", "");
  const request = new Request(url, init);
  requested.push(`${init?.method ?? "GET"} ${path}${url.search}`);
  if (path === "/admin/system/services") return servicesRoute();
  if (path === "/admin/system/settings") return settingsRoute();
  if (path === "/admin/system/logs") return logsRoute(request);
  if (path === "/admin/audit") return auditRoute(request);
  if (path === "/sessions") return sessionsRoute(request);
  if (path === "/users") return usersRoute(request);
  throw new Error(`Нет мок-маршрута для ${path}`);
}

async function renderLogsTab() {
  render(<SystemShell adminId={ADMIN_ID} />);
  await waitFor(() => expect(screen.queryByText("Загрузка состояния системы…")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("tab", { name: "Журналы и аудит" }));
  await waitFor(() => expect(screen.queryByText("Загрузка журнала…")).not.toBeInTheDocument());
}

function auditRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Журнал аудита" });
  return within(table).getAllByRole("row").slice(1);
}

beforeEach(() => {
  resetMockStore();
  requested.length = 0;
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("журнал аудита по образцу ПОВ-112 (T4.2-22)", () => {
  it("колонки и панель «Поиск события» дословно по референсу", async () => {
    await renderLogsTab();
    for (const title of ["Карточка", "Опер.", "ФИО оператора", "Дата", "Время", "Событие", "Описание"]) {
      expect(
        screen.getByRole("columnheader", { name: new RegExp(`^${title.replace(".", "\\.")}`) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "по оператору" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "по карточке" })).toBeChecked();
    expect(screen.getByLabelText("Тип события")).toBeInTheDocument();
    expect(screen.getAllByText(/Хранение ≥ 6 месяцев/).length).toBeGreaterThan(0);
  });

  it("строки: ФИО из реестра, дата и время раздельно в формате ru-RU 24 ч", async () => {
    await renderLogsTab();
    const first = auditRows()[0];
    expect(within(first).getByText(/^\d{2}\.\d{2}\.\d{4}$/)).toBeInTheDocument();
    expect(within(first).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getAllByText("Резервное копирование").length).toBeGreaterThan(0);
  });

  it("фильтр «Тип события» = События карточек + «Нарушения исправлены» отдаёт записи карточек", async () => {
    await renderLogsTab();
    fireEvent.change(screen.getByLabelText("Тип события"), { target: { value: "card" } });
    fireEvent.click(screen.getByRole("button", { name: "искать" }));
    await waitFor(() =>
      expect(requested.some((entry) => entry.includes("/admin/audit?type=card"))).toBe(true),
    );
    expect(await screen.findByText("Нарушения исправлены")).toBeInTheDocument();
    expect(screen.queryByText("Смена роли")).not.toBeInTheDocument();
  });

  it("поиск «по карточке» отдаёт только записи с карточкой", async () => {
    await renderLogsTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "по оператору" }));
    fireEvent.change(screen.getByPlaceholderText("Поиск события"), { target: { value: "c-014" } });
    fireEvent.click(screen.getByRole("button", { name: "искать" }));
    await waitFor(() => expect(requested.some((entry) => entry.includes("card=c-014"))).toBe(true));
    await waitFor(() => expect(auditRows().length).toBeGreaterThan(0));
    for (const row of auditRows()) expect(within(row).getByText("c-014")).toBeInTheDocument();
  });

  it("пагинация листает страницы журнала", async () => {
    await renderLogsTab();
    expect(screen.getByText("Страница: 1")).toBeInTheDocument();
    const firstPageIds = auditRows().map((row) => row.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    await waitFor(() => expect(screen.getByText("Страница: 2")).toBeInTheDocument());
    await waitFor(() => expect(requested.some((entry) => entry.includes("page=2"))).toBe(true));
    expect(auditRows().map((row) => row.textContent)).not.toEqual(firstPageIds);
  });
});

describe("системные журналы (T4.2-23)", () => {
  it("фильтр ERROR запрашивает уровень у мок-API и показывает только ошибки", async () => {
    await renderLogsTab();
    fireEvent.click(screen.getByRole("button", { name: "ERROR" }));
    await waitFor(() =>
      expect(requested.some((entry) => entry.includes("/admin/system/logs?level=ERROR"))).toBe(true),
    );
    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll("li[data-level]"));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.getAttribute("data-level") === "ERROR")).toBe(true);
    });
  });

  it("время в 24-часовом формате, уровень продублирован текстом", async () => {
    await renderLogsTab();
    const feed = screen.getByRole("list", { name: "Лента логов сервисов" });
    const first = within(feed).getAllByRole("listitem")[0];
    expect(within(first).getByText(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(first).getByText(/^(INFO|WARN|ERROR)$/)).toBeInTheDocument();
  });
});
