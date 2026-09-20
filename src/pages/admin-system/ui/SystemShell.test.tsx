/*
 * Раздел «Система» поверх настоящих route handlers мок-API (T4.2-07…T4.2-11, T4.2-15…T4.2-21, T4.2-24):
 * fetch подменён диспетчером на app/api/mock/**. Playwright в проекте нет — сквозные сценарии
 * «плитка → подтверждение → действие» и «настройка → сохранение → чтение обратно» закрыты RTL.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as auditRoute } from "../../../../app/api/mock/admin/audit/route";
import { GET as logsRoute } from "../../../../app/api/mock/admin/system/logs/route";
import { GET as monitoringRoute } from "../../../../app/api/mock/admin/system/monitoring/route";
import { POST as actionRoute } from "../../../../app/api/mock/admin/system/services/[id]/action/route";
import { GET as servicesRoute } from "../../../../app/api/mock/admin/system/services/route";
import {
  GET as settingsRoute,
  PATCH as patchSettingsRoute,
} from "../../../../app/api/mock/admin/system/settings/route";
import { GET as usageRoute } from "../../../../app/api/mock/admin/system/usage-stats/route";
import { GET as sessionsRoute } from "../../../../app/api/mock/sessions/route";
import { POST as sessionStopRoute } from "../../../../app/api/mock/sessions/[id]/stop/route";
import { GET as usersRoute } from "../../../../app/api/mock/users/route";
import { resetMockStore } from "../../../../app/api/mock/_server/testing";
import { SystemShell } from "./SystemShell";

const ADMIN_ID = "u-001";
const RUNNING_SESSION = "ses-2026-09-17-demo";
const requested: string[] = [];

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost");
  const path = url.pathname.replace("/api/mock", "");
  const request = new Request(url, init);
  requested.push(`${init?.method ?? "GET"} ${path}${url.search}`);
  const action = /^\/admin\/system\/services\/([^/]+)\/action$/.exec(path);
  if (action) return actionRoute(request, params(action[1]));
  if (path === "/admin/system/services") return servicesRoute();
  if (path === "/admin/system/settings") {
    return init?.method === "PATCH" ? patchSettingsRoute(request) : settingsRoute();
  }
  if (path === "/admin/system/logs") return logsRoute(request);
  if (path === "/admin/system/monitoring") return monitoringRoute();
  if (path === "/admin/system/usage-stats") return usageRoute(request);
  if (path === "/admin/audit") return auditRoute(request);
  if (path === "/sessions") return sessionsRoute(request);
  if (path === "/users") return usersRoute(request);
  throw new Error(`Нет мок-маршрута для ${path}`);
}

/** Завершает демо-занятие: снимает блокировки действий, влияющих на учебный процесс (T4.2-24). */
async function finishRunningSession() {
  await sessionStopRoute(new Request("http://localhost", { method: "POST" }), params(RUNNING_SESSION));
}

async function renderShell() {
  const view = render(<SystemShell adminId={ADMIN_ID} />);
  await waitFor(() => expect(screen.queryByText("Загрузка состояния системы…")).not.toBeInTheDocument());
  return view;
}

function tile(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("article") as HTMLElement;
}

function openTab(title: string) {
  fireEvent.click(screen.getByRole("tab", { name: title }));
}

beforeEach(() => {
  resetMockStore();
  requested.length = 0;
  vi.stubGlobal("fetch", vi.fn(routeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("каркас раздела «Система» (T4.2-07)", () => {
  it("4 вкладки переключаются, каждая секция рендерится на данных мока", async () => {
    await renderShell();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByText("Контур изолирован")).toBeInTheDocument();
    openTab("Мониторинг нагрузки");
    expect(await screen.findByText("Статистика использования системы")).toBeInTheDocument();
    openTab("Настройки");
    expect(screen.getByRole("heading", { name: "Резервное копирование" })).toBeInTheDocument();
    openTab("Журналы и аудит");
    expect(screen.getByRole("heading", { name: "Системные журналы" })).toBeInTheDocument();
  });

  it("данные берутся только из мок-API (без прямых обращений к файлам моков)", async () => {
    await renderShell();
    expect(requested).toContain("GET /admin/system/services");
    expect(requested).toContain("GET /admin/system/settings");
    expect(requested.some((entry) => entry.startsWith("GET /sessions?state=running"))).toBe(true);
  });
});

describe("плитки и индикаторы (T4.2-08, T4.2-10, T4.2-11)", () => {
  it("три состояния сервисов, состояние продублировано текстом, аптайм отформатирован", async () => {
    await renderShell();
    const states = Array.from(document.querySelectorAll("article[data-state]")).map((node) =>
      node.getAttribute("data-state"),
    );
    expect(new Set(states)).toEqual(new Set(["running", "stopped", "degraded"]));
    expect(within(tile("Мок-SIP")).getByText("работает с ошибками")).toBeInTheDocument();
    expect(within(tile("Веб-сервер")).getByText("12 д 06:00")).toBeInTheDocument();
    expect(within(tile("ИИ-модуль (заглушка)")).getByText("—")).toBeInTheDocument();
  });

  it("«Целостность системы: OK» и баннер активного сбоя по данным мока", async () => {
    await renderShell();
    expect(screen.getByText("Целостность системы: OK")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Активный сбой");
    expect(screen.getByRole("alert")).toHaveTextContent("Мок-SIP");
  });

  it("лента оповещений показывает события ERROR", async () => {
    await renderShell();
    const feed = screen.getByRole("list", { name: "Лента критических событий" });
    expect(within(feed).getAllByText("Критично").length).toBeGreaterThan(0);
    expect(within(feed).getByText(/REGISTER timeout/)).toBeInTheDocument();
  });

  it("тумблер автовосстановления сохраняется в настройки и читается обратно", async () => {
    const view = await renderShell();
    fireEvent.click(screen.getByRole("switch", { name: "Автовосстановление сервисов после сбоев" }));
    await waitFor(() =>
      expect(requested.some((entry) => entry.startsWith("PATCH /admin/system/settings"))).toBe(true),
    );
    view.unmount();
    await renderShell();
    expect(screen.getByRole("switch", { name: "Автовосстановление сервисов после сбоев" })).not.toBeChecked();
  });
});

describe("действия над сервисами (T4.2-09, T4.2-24)", () => {
  it("некритичный сервис: одно подтверждение, состояние обновляется после ответа", async () => {
    await renderShell();
    fireEvent.click(within(tile("ИИ-модуль (заглушка)")).getByRole("button", { name: "Запустить" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Запустить сервис «ИИ-модуль (заглушка)»?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Запустить" }));
    await waitFor(() => expect(tile("ИИ-модуль (заглушка)").getAttribute("data-state")).toBe("running"));
  });

  it("отмена не вызывает мок-действие", async () => {
    await renderShell();
    fireEvent.click(within(tile("Мок-SIP")).getByRole("button", { name: "Остановить" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requested.some((entry) => entry.includes("/action"))).toBe(false);
  });

  it("критичный сервис: двойное подтверждение с чекбоксом «понимаю риск»", async () => {
    // Занятие мока идёт, поэтому сначала завершаем его — иначе остановка БД заблокирована.
    await finishRunningSession();
    await renderShell();
    const dbTile = tile("БД PostgreSQL");
    fireEvent.click(within(dbTile).getByRole("button", { name: "Остановить" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("шаг 1 из 2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Продолжить" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Повторное подтверждение");
    const stop = within(screen.getByRole("dialog")).getByRole("button", { name: "Остановить" });
    expect(stop).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Понимаю риск/ }));
    fireEvent.click(stop);
    await waitFor(() => expect(tile("БД PostgreSQL").getAttribute("data-state")).toBe("stopped"));
  });

  it("во время активного занятия остановка БД недоступна с пояснением", async () => {
    await renderShell();
    const dbTile = tile("БД PostgreSQL");
    expect(within(dbTile).getByRole("button", { name: "Остановить" })).toBeDisabled();
    expect(within(dbTile).getByRole("button", { name: "Перезапустить" })).toBeDisabled();
    expect(dbTile).toHaveTextContent("недоступно во время активного занятия");
    expect(within(tile("Мок-SIP")).getByRole("button", { name: "Остановить" })).toBeEnabled();
  });
});

describe("настройки (T4.2-15…T4.2-21)", () => {
  async function openSettings() {
    await renderShell();
    openTab("Настройки");
  }

  it("7 подсекций и пометки нормативов ТЗ", async () => {
    await openSettings();
    for (const title of [
      "Виртуальная IP-телефония",
      "База данных",
      "Безопасность и политики доступа",
      "Производительность",
      "Резервное копирование",
      "Журналирование",
      "Пакетное обновление",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/не реже 1 раза в сутки/)).toBeInTheDocument();
    expect(screen.getByText(/≥ 6 месяцев/)).toBeInTheDocument();
    expect(screen.getByText(/≥ 20 одновременных сессий/)).toBeInTheDocument();
    expect(screen.getByText("Изменение только через конфигурацию сервера.")).toBeInTheDocument();
  });

  it("телефония: realm сохраняется и читается обратно после перезагрузки", async () => {
    const view = await renderShell();
    openTab("Настройки");
    fireEvent.change(screen.getByLabelText("Realm"), { target: { value: "arm112.test" } });
    fireEvent.click(
      within(screen.getByText("Виртуальная IP-телефония").closest("section") as HTMLElement).getByRole(
        "button",
        { name: "Сохранить" },
      ),
    );
    expect(await screen.findByText("Сохранено в мок.")).toBeInTheDocument();
    view.unmount();
    await renderShell();
    openTab("Настройки");
    expect(screen.getByLabelText("Realm")).toHaveValue("arm112.test");
  });

  it("база данных — только чтение, без submit", async () => {
    await openSettings();
    expect(screen.getByLabelText("Хост")).toBeDisabled();
    expect(screen.getByLabelText("Имя БД")).toBeDisabled();
    const section = screen.getByText("База данных").closest("section") as HTMLElement;
    expect(within(section).queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  });

  it("производительность: лимит 10 — ошибка с текстом норматива, 20 — сохраняется", async () => {
    await openSettings();
    const limit = screen.getByLabelText("Лимит одновременных сессий");
    fireEvent.change(limit, { target: { value: "10" } });
    expect(screen.getByText(/Не менее 20 одновременных сессий/)).toBeInTheDocument();
    fireEvent.change(limit, { target: { value: "20" } });
    const section = screen.getByText("Производительность").closest("section") as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: "Сохранить" }));
    expect(await within(section).findByText("Сохранено в мок.")).toBeInTheDocument();
  });

  it("бэкап: 48 ч — ошибка валидации; «Выполнить сейчас» показывает прогресс", async () => {
    await finishRunningSession();
    await openSettings();
    fireEvent.change(screen.getByLabelText("Периодичность, ч"), { target: { value: "48" } });
    expect(screen.getAllByText(/не реже 1 раза в сутки/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Выполнить сейчас" }));
    expect(screen.getByRole("progressbar", { name: "Резервное копирование" })).toBeInTheDocument();
  });

  it("журналирование: 3 месяца — ошибка, 6 — сохраняется", async () => {
    await openSettings();
    const retention = screen.getByLabelText("Срок хранения журналов, мес.");
    fireEvent.change(retention, { target: { value: "3" } });
    expect(screen.getByText(/не менее 6 месяцев/i)).toBeInTheDocument();
    fireEvent.change(retention, { target: { value: "6" } });
    const section = screen.getByText("Журналирование").closest("section") as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: "Сохранить" }));
    expect(await within(section).findByText("Сохранено в мок.")).toBeInTheDocument();
  });

  it("безопасность: сохранение только после подтверждения прав", async () => {
    await openSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Требовать 2FA при входе" }));
    expect(requested.some((entry) => entry.startsWith("PATCH"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить настройки безопасности" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Подтверждение прав");
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() =>
      expect(requested.some((entry) => entry.startsWith("PATCH /admin/system/settings"))).toBe(true),
    );
  });

  it("пакетное обновление: заглушка без сетевой отправки файла", async () => {
    await finishRunningSession();
    await openSettings();
    const button = screen.getByRole("button", { name: "Загрузить пакет обновления" });
    expect(button).toBeDisabled();
    const file = new File(["update"], "arm112-2.1.tar.gz", { type: "application/gzip" });
    fireEvent.change(screen.getByLabelText(/Файл пакета/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Загрузить пакет обновления" }));
    expect(screen.getByRole("progressbar", { name: "Установка пакета" })).toBeInTheDocument();
    expect(requested.some((entry) => entry.includes("update"))).toBe(false);
  });
});
