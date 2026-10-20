import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ProblemReport } from "@/shared/api";

import type { ProblemReportsApi } from "../api/problemReportsApi";
import { ProblemReportsBlock } from "./ProblemReportsBlock";

const older: ProblemReport = {
  id: "pr-001",
  studentId: "s-1",
  studentName: "Петров П. П.",
  groupId: "ГР-1",
  text: "Старое сообщение",
  hasAttachment: false,
  createdAt: "2026-10-19T10:00:00+03:00",
};
const newer: ProblemReport = {
  id: "pr-002",
  studentId: "s-2",
  studentName: "Сидорова А. А.",
  groupId: "ГР-1",
  incidentNumber: 132919,
  attemptId: "att-9",
  text: "Не сохраняется карточка",
  hasAttachment: true,
  createdAt: "2026-10-20T09:30:00+03:00",
};

function makeApi(overrides: Partial<ProblemReportsApi> = {}): ProblemReportsApi {
  return {
    list: vi.fn(async () => [older, newer]),
    markRead: vi.fn(async (id: string) => ({
      ...(id === "pr-002" ? newer : older),
      readAt: "2026-10-20T10:00:00+03:00",
    })),
    attachmentUrl: (id: string) => `/api/v1/teacher/problem-reports/${id}/attachment`,
    ...overrides,
  };
}

/** Строка списка по имени отправителя — кнопки у двух непрочитанных сообщений различаются только строкой. */
function rowOf(sender: string): HTMLElement {
  const row = screen.getAllByRole("listitem").find((item) => item.textContent?.includes(sender));
  if (!row) throw new Error(`нет строки «${sender}»`);
  return row;
}

describe("блок «Сообщения о проблемах» на главной преподавателя", () => {
  it("новые сверху; у непрочитанного — «Новое» и кнопка отметки; происшествие и попытка видны", async () => {
    render(<ProblemReportsBlock api={makeApi()} />);
    const list = await screen.findByRole("list", { name: "Сообщения обучающихся" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Сидорова А. А.");
    expect(items[1]).toHaveTextContent("Петров П. П.");
    expect(items[0]).toHaveTextContent("Происшествие 132919 · попытка att-9");
    expect(items[0]).toHaveTextContent("Новое");
    expect(within(items[0]).getByRole("button", { name: "Отметить прочитанным" })).toBeEnabled();
  });

  it("вложение открывается по ссылке same-origin в новой вкладке; без вложения ссылки нет", async () => {
    render(<ProblemReportsBlock api={makeApi()} />);
    const link = await screen.findByRole("link", { name: "Открыть вложение" });
    expect(link).toHaveAttribute("href", "/api/v1/teacher/problem-reports/pr-002/attachment");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("link", { name: "Открыть вложение" })).toHaveLength(1);
  });

  it("отметка прочтения обновляет строку на месте: «Новое» уходит, появляется «Прочитано»", async () => {
    const api = makeApi();
    render(<ProblemReportsBlock api={api} />);
    await screen.findByRole("list", { name: "Сообщения обучающихся" });
    fireEvent.click(within(rowOf("Сидорова А. А.")).getByRole("button", { name: "Отметить прочитанным" }));
    await waitFor(() => expect(within(rowOf("Сидорова А. А.")).getByText(/Прочитано/)).toBeInTheDocument());
    expect(api.markRead).toHaveBeenCalledWith("pr-002");
    expect(screen.getAllByRole("button", { name: "Отметить прочитанным" })).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("Новое");
  });

  it("ошибка отметки — сообщение рядом со списком, строка остаётся непрочитанной", async () => {
    const api = makeApi({
      markRead: vi.fn(async () => {
        throw new ApiError(404, "notFound", "Сообщение «pr-002» не найдено");
      }),
    });
    render(<ProblemReportsBlock api={api} />);
    await screen.findByRole("list", { name: "Сообщения обучающихся" });
    fireEvent.click(within(rowOf("Сидорова А. А.")).getByRole("button", { name: "Отметить прочитанным" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сообщение «pr-002» не найдено");
    expect(screen.getAllByRole("button", { name: "Отметить прочитанным" })).toHaveLength(2);
  });

  it("пустой список — понятное пустое состояние без кнопок", async () => {
    render(<ProblemReportsBlock api={makeApi({ list: vi.fn(async () => []) })} />);
    expect(await screen.findByText("Сообщений нет")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("загрузка — скелетон; сбой — ошибка с «Повторить», которая перезапрашивает список", async () => {
    const list = vi
      .fn<ProblemReportsApi["list"]>()
      .mockRejectedValueOnce(new Error("Сервер недоступен"))
      .mockResolvedValueOnce([newer]);
    render(<ProblemReportsBlock api={makeApi({ list })} />);
    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Не сохраняется карточка")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("без бэкенда блок показывает «нужен сервер», а не ломает страницу", async () => {
    render(
      <ProblemReportsBlock
        api={makeApi({ list: vi.fn(async () => Promise.reject(new ServerRequiredError())) })}
      />,
    );
    expect(await screen.findByText(/Раздел требует подключения к серверу/)).toBeInTheDocument();
  });

  it("до ответа показывается загрузка", () => {
    render(
      <ProblemReportsBlock
        api={makeApi({ list: vi.fn(() => new Promise<ProblemReport[]>(() => undefined)) })}
      />,
    );
    expect(screen.getByRole("status", { name: "Загрузка…" })).toBeInTheDocument();
  });
});
