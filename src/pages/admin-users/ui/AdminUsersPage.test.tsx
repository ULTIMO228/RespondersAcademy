/*
 * RTL-тесты `/admin/users` (T4.1-05…T4.1-10). Playwright в проекте не установлен, поэтому вместо e2e —
 * интеграционные тесты экрана поверх РЕАЛЬНЫХ route handlers мок-слоя: fetch клиента `@/shared/api`
 * подменён диспетчером на те же `app/api/mock/admin/users/**`, что работают в браузере.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleMatrix } from "@/entities/user";

import { PATCH as patchUserRoute } from "../../../../app/api/mock/admin/users/[id]/route";
import { POST as blockRoute } from "../../../../app/api/mock/admin/users/[id]/block/route";
import { POST as resetPasswordRoute } from "../../../../app/api/mock/admin/users/[id]/reset-password/route";
import { POST as unblockRoute } from "../../../../app/api/mock/admin/users/[id]/unblock/route";
import { GET as usersRoute, POST as createUserRoute } from "../../../../app/api/mock/admin/users/route";
import { listAuditLog, resetMockStore } from "../../../../app/api/mock/_server/testing";
import { RolesMatrixInfo } from "./RolesMatrixInfo";
import { UsersRegistry } from "./UsersRegistry";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/users",
  useSearchParams: () => searchParams,
}));

const ADMIN_ID = "u-001";
const USER_COUNT = 24;
const USER_ID_SEGMENT = /\/admin\/users\/([^/?]+)/;

/** URL-ы, ушедшие в мок-API (проверка фильтров и дебаунса). */
const requestedUrls: string[] = [];

async function routeRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = String(input);
  requestedUrls.push(path);
  const request = new Request(`http://localhost${path}`, init);
  const id = USER_ID_SEGMENT.exec(path)?.[1] ?? "";
  const context = { params: Promise.resolve({ id }) };
  if (path.endsWith("/block")) return blockRoute(request, context);
  if (path.endsWith("/unblock")) return unblockRoute(request, context);
  if (path.endsWith("/reset-password")) return resetPasswordRoute(request, context);
  if (init?.method === "PATCH") return patchUserRoute(request, context);
  if (init?.method === "POST") return createUserRoute(request);
  return usersRoute(request);
}

function renderRegistry() {
  return render(<UsersRegistry adminId={ADMIN_ID} />);
}

async function waitRows(count: number) {
  await waitFor(() => expect(document.querySelectorAll("tbody tr[data-user-id]")).toHaveLength(count));
}

function row(userId: string): HTMLElement {
  const element = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (!element) throw new Error(`строка ${userId} не найдена`);
  return element as HTMLElement;
}

beforeEach(() => {
  resetMockStore();
  requestedUrls.length = 0;
  replace.mockClear();
  searchParams = new URLSearchParams();
  vi.stubGlobal("fetch", routeRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Таблица реестра (T4.1-05)", () => {
  it("рендерит 24 пользователя мока; у u-010 — «заблокирована», у активных — «активна»", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    expect(row("u-010").querySelector('[data-state="blocked"]')).toHaveTextContent("заблокирована");
    expect(row("u-005").querySelector('[data-state="active"]')).toHaveTextContent("активна");
  });

  it("колонка «создана» не выводится (зафиксированное расхождение №4)", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["ФИО", "Логин", "Роль", "№ АРМ", "Группа", "Служба", "Состояние", "Действия"]);
  });

  it("бейджи ролей — ровно три значения", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    const badges = new Set(
      [...document.querySelectorAll("tbody tr[data-user-id] td:nth-child(3)")].map(
        (cell) => cell.textContent,
      ),
    );
    expect([...badges].sort()).toEqual(["Администратор", "Обучающийся", "Преподаватель"]);
  });

  it("пароли не попадают в разметку реестра", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    expect(document.body.innerHTML).not.toMatch(/student112|teacher112|admin112/);
  });
});

describe("Фильтры и поиск (T4.1-06)", () => {
  it("фильтр состояния уходит в запрос и сужает список", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.change(screen.getByLabelText("Состояние"), { target: { value: "blocked" } });
    await waitRows(1);
    expect(requestedUrls.some((url) => url.includes("state=blocked"))).toBe(true);
  });

  it("поиск с дебаунсом: сразу запроса нет, после паузы — есть", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    const before = requestedUrls.length;
    fireEvent.change(screen.getByLabelText("Поиск по ФИО / логину"), { target: { value: "egorov" } });
    expect(requestedUrls.length).toBe(before);
    await waitFor(() => expect(requestedUrls.some((url) => url.includes("q=egorov"))).toBe(true));
    await waitRows(1);
    expect(row("u-010")).toBeInTheDocument();
  });

  it("фильтры пишутся в query адресной строки (шаринг ссылки)", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.change(screen.getByLabelText("Роль"), { target: { value: "teacher" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/users?role=teacher", { scroll: false }));
  });

  it("начальные фильтры читаются из query адресной строки", async () => {
    searchParams = new URLSearchParams("role=student&state=blocked");
    renderRegistry();
    await waitRows(1);
    expect((screen.getByLabelText("Роль") as HTMLSelectElement).value).toBe("student");
    expect((screen.getByLabelText("Состояние") as HTMLSelectElement).value).toBe("blocked");
  });
});

describe("Создание учётной записи (T4.1-07)", () => {
  async function openCreate() {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.click(screen.getByRole("button", { name: "Создать учётную запись" }));
    return screen.getByRole("dialog");
  }

  it("состав полей меняется по роли; № АРМ обязателен для всех ролей", async () => {
    const dialog = await openCreate();
    const roleSelect = within(dialog).getByLabelText("Роль");
    expect(within(roleSelect).getAllByRole("option")).toHaveLength(3);
    expect(within(dialog).getByLabelText("Номер АРМ")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Группа")).toBeInTheDocument();
    fireEvent.change(roleSelect, { target: { value: "teacher" } });
    expect(within(dialog).getByText("Закреплённые группы")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Номер АРМ")).toBeInTheDocument();
    fireEvent.change(roleSelect, { target: { value: "admin" } });
    expect(within(dialog).queryByLabelText("Группа")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Номер АРМ")).toBeInTheDocument();
  });

  it("пустая форма → ru-сообщения валидации, запрос не уходит", async () => {
    const dialog = await openCreate();
    const before = requestedUrls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(within(dialog).getByText("Укажите ФИО")).toBeInTheDocument();
    expect(within(dialog).getByText("Укажите логин")).toBeInTheDocument();
    expect(within(dialog).getByText("Номер АРМ — целое число больше нуля")).toBeInTheDocument();
    expect(requestedUrls.length).toBe(before);
  });

  it("создаёт обучающегося с АРМ 25 → появился в таблице, запись в аудите", async () => {
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("ФИО"), { target: { value: "Новиков Артём Петрович" } });
    fireEvent.change(within(dialog).getByLabelText("Логин"), { target: { value: "novikov" } });
    fireEvent.change(within(dialog).getByLabelText("Временный пароль"), { target: { value: "temp-2026" } });
    fireEvent.change(within(dialog).getByLabelText("Номер АРМ"), { target: { value: "25" } });
    fireEvent.change(within(dialog).getByLabelText("Группа"), { target: { value: "ДДС-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    await waitRows(USER_COUNT + 1);
    expect(listAuditLog()[0]).toMatchObject({ userId: ADMIN_ID, action: "user.create" });
  });

  it("занятый логин → сообщение «Логин уже занят» в форме", async () => {
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Логин"), { target: { value: "admin" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(within(dialog).getByText("Логин уже занят")).toBeInTheDocument();
  });
});

describe("Редактирование и смена роли (T4.1-08)", () => {
  async function openRowDialog(userId: string, button: string) {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.click(within(row(userId)).getByRole("button", { name: button }));
    return screen.getByRole("dialog");
  }

  it("в модалке редактирования нет поля роли (смена роли — отдельное действие)", async () => {
    const dialog = await openRowDialog("u-005", "Изменить");
    expect(dialog).toHaveTextContent("Изменение учётной записи");
    expect(within(dialog).queryByLabelText("Роль")).not.toBeInTheDocument();
    expect((within(dialog).getByLabelText("ФИО") as HTMLInputElement).value).toBe("Иванов Сергей Петрович");
  });

  it("правка ФИО сохраняется и пишется в аудит как user.update", async () => {
    const dialog = await openRowDialog("u-005", "Изменить");
    fireEvent.change(within(dialog).getByLabelText("ФИО"), { target: { value: "Иванов Сергей П." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(listAuditLog()[0]).toMatchObject({ action: "user.update" }));
  });

  it("смена роли требует подтверждения и пишет отдельное событие аудита", async () => {
    const dialog = await openRowDialog("u-005", "Роль");
    expect(within(dialog).getByRole("button", { name: "Сменить роль" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Роль"), { target: { value: "teacher" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сменить роль" }));
    await waitFor(() => expect(listAuditLog().some((e) => e.action === "user.roleChange")).toBe(true));
    expect(listAuditLog().find((e) => e.action === "user.roleChange")?.details).toContain(
      "«Обучающийся» → «Преподаватель»",
    );
  });
});

describe("Блокировка и сброс пароля (T4.1-09)", () => {
  it("подпись кнопки зависит от состояния учётной записи", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    expect(within(row("u-005")).getByRole("button", { name: "Заблокировать" })).toBeInTheDocument();
    expect(within(row("u-010")).getByRole("button", { name: "Разблокировать" })).toBeInTheDocument();
  });

  it("блокировка идёт через подтверждение; состояние в таблице меняется сразу", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.click(within(row("u-005")).getByRole("button", { name: "Заблокировать" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("будет заблокирована");
    fireEvent.click(within(dialog).getByRole("button", { name: "Заблокировать" }));
    await waitFor(() => expect(row("u-005").querySelector('[data-state="blocked"]')).not.toBeNull());
    expect(listAuditLog()[0]).toMatchObject({ userId: ADMIN_ID, action: "user.block" });
  });

  it("сброс пароля показывает администратору временный пароль", async () => {
    renderRegistry();
    await waitRows(USER_COUNT);
    fireEvent.click(within(row("u-005")).getByRole("button", { name: "Сброс пароля" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Сбросить" }));
    await waitFor(() => expect(dialog).toHaveTextContent(/arm112-\d{4}/));
    expect(listAuditLog()[0]).toMatchObject({ action: "user.passwordReset" });
  });
});

describe("Плашка-матрица прав (T4.1-10)", () => {
  it("рендерится, три роли, формулировки 02-roles.md, без интерактива", () => {
    render(<RolesMatrixInfo />);
    expect(screen.getByText("Права доступа: что может роль")).toBeInTheDocument();
    for (const title of ["Обучающийся", "Преподаватель", "Администратор"]) {
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/видеть материалы и результаты других обучающихся/)).toBeInTheDocument();
    expect(screen.getByText(/блокировать и разблокировать учётные записи/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("матрица доступа к разделам показывает 3 роли", () => {
    render(<RoleMatrix />);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Раздел", "Обучающийся", "Преподаватель", "Администратор"]);
  });
});
