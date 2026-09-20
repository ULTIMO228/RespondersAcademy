/*
 * Вкладка «Мониторинг нагрузки» на настоящих route handlers (T4.2-12…T4.2-14):
 * SVG-чарты по рядам мока, линии нормативов ТЗ §7, мок-отчёт об ошибках и смена периода статистики.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as logsRoute } from "../../../../app/api/mock/admin/system/logs/route";
import { GET as monitoringRoute } from "../../../../app/api/mock/admin/system/monitoring/route";
import { GET as servicesRoute } from "../../../../app/api/mock/admin/system/services/route";
import { GET as usageRoute } from "../../../../app/api/mock/admin/system/usage-stats/route";
import { resetMockStore } from "../../../../app/api/mock/_server/testing";
import { MonitoringTab } from "./MonitoringTab";

const requested: string[] = [];

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const path = url.pathname.replace("/api/mock", "");
  const request = new Request(url, init);
  requested.push(`${init?.method ?? "GET"} ${path}${url.search}`);
  if (path === "/admin/system/monitoring") return monitoringRoute();
  if (path === "/admin/system/usage-stats") return usageRoute(request);
  if (path === "/admin/system/services") return servicesRoute();
  if (path === "/admin/system/logs") return logsRoute(request);
  throw new Error(`Нет мок-маршрута для ${path}`);
}

async function renderMonitoring() {
  const view = render(<MonitoringTab />);
  await waitFor(() => expect(screen.queryByText("Загрузка рядов мониторинга…")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText("Загрузка статистики…")).not.toBeInTheDocument());
  return view;
}

beforeEach(() => {
  resetMockStore();
  requested.length = 0;
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("графики нагрузки против нормативов (T4.2-12)", () => {
  it("рендерит SVG-чарты по данным мока с линиями нормативов ТЗ §7", async () => {
    const { container } = await renderMonitoring();
    expect(container.querySelectorAll("svg[role='img']").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText("норматив: ≥ 20 одновременных сессий")).toBeInTheDocument();
    expect(screen.getByText("норматив: отклик ≤ 2 сек")).toBeInTheDocument();
    expect(requested).toContain("GET /admin/system/monitoring");
  });

  it("участки превышения нормативов подсвечены", async () => {
    await renderMonitoring();
    const exceeded = screen.getAllByText(/Превышение норматива: \d+ точек ряда/);
    expect(exceeded.length).toBe(2);
  });

  it("графики строятся без внешних библиотек — только inline-SVG", async () => {
    const { container } = await renderMonitoring();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelectorAll("polyline").length).toBeGreaterThan(0);
  });
});

describe("отчёт об ошибках и сбоях (T4.2-13)", () => {
  it("модалка содержит ERROR-события, аптайм сервисов и мок-индикацию времени", async () => {
    await renderMonitoring();
    fireEvent.click(screen.getByRole("button", { name: "Сформировать отчёт об ошибках и сбоях" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Ошибок уровня ERROR в журналах: 3/)).toBeInTheDocument();
    expect(within(dialog).getByText(/REGISTER timeout/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Веб-сервер: аптайм 12 д 06:00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/мок-индикация/)).toBeInTheDocument();
  });
});

describe("статистика использования системы (T4.2-14)", () => {
  it("смена периода перестраивает все три диаграммы", async () => {
    await renderMonitoring();
    expect(screen.getByText(/Входы по ролям: Неделя/)).toBeInTheDocument();
    expect(document.querySelector("[data-period='week']")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Период статистики"), { target: { value: "month" } });
    await waitFor(() => expect(screen.getByText(/Входы по ролям: Месяц/)).toBeInTheDocument());
    expect(document.querySelector("[data-period='month']")).not.toBeNull();
    expect(requested).toContain("GET /admin/system/usage-stats?period=month");
  });

  it("подписи ролей и периодов по-русски", async () => {
    await renderMonitoring();
    expect(screen.getByText("Обучающийся")).toBeInTheDocument();
    expect(screen.getByText("Преподаватель")).toBeInTheDocument();
    expect(screen.getByText("Администратор")).toBeInTheDocument();
    expect(screen.getByText("Активность пользователей по времени")).toBeInTheDocument();
  });
});
