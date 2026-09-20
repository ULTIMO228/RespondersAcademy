import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDeps } from "../lib/journalFakeApi.testing";
import { LIST_POLL_MS } from "../model/useCardsList";
import { advance, DEMO_NOW, renderJournal } from "./journalTestUtils.testing";

const COLUMNS = [
  "Связи",
  "ЧС",
  "Опер.",
  "АРМ",
  "Номер",
  "Дата",
  "Время",
  "Тип происшествия",
  "Постр.",
  "Адрес",
  "Статус службы",
];

function getRows() {
  return screen.getAllByRole("rowgroup");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(DEMO_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IncidentJournal — шапка (T2.2-02)", () => {
  it("живые дата и часы тикают каждую секунду; ФИО и АРМ — из сессии", async () => {
    await renderJournal();
    expect(screen.getByRole("heading", { level: 1, name: "Поиск происшествий" })).toBeInTheDocument();
    expect(screen.getByText("Четверг, 17 Сентябрь 2026")).toBeInTheDocument();
    const clock = document.querySelector("time") as HTMLTimeElement;
    expect(clock).toHaveTextContent("11:50:44");
    await advance(1000);
    expect(clock).toHaveTextContent("11:50:45");
    await advance(2000);
    expect(clock).toHaveTextContent("11:50:47");
    expect(clock).toHaveAttribute("dateTime", "2026-09-17T11:50:47+03:00");
    expect(screen.getByText(/оп\. 1 , Иванов С\. П\./)).toBeInTheDocument();
    expect(screen.getByText("АРМ 001", { exact: false })).toBeInTheDocument();
  });
});

describe("IncidentJournal — таблица и данные мок-слоя (T2.2-01, T2.2-04)", () => {
  it("11 заголовков в порядке референса; строки — из GET /cards (fixtures, 10 на странице)", async () => {
    const { deps } = await renderJournal();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(COLUMNS);
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ dataset: "fixtures", page: 1, perPage: 10 });
    expect(getRows()).toHaveLength(10);
    expect(screen.getByText("1-10 из 12")).toBeInTheDocument();
  });

  it("маркер статуса службы, красный бейдж ЧП/ЧС, тултип кода типа, индикатор СМС", async () => {
    await renderJournal();
    const tooltips = screen.getAllByRole("tooltip", { hidden: true }).map((tooltip) => tooltip.textContent);
    expect(tooltips).toContain("101");
    expect(screen.getAllByRole("button", { name: /ЧП — важное происшествие/ }).length).toBeGreaterThan(0);
    const markers = document.querySelectorAll(
      '[role="cell"] [data-tone], [role="cell"] img[alt="Добавлена"]',
    );
    expect(markers.length).toBeGreaterThanOrEqual(getRows().length);
    expect(screen.getByLabelText(/Новые СМС: \d/)).toBeInTheDocument();
  });
});

describe("IncidentJournal — лента: фильтр, автообновление, пагинация (T2.2-03, T2.2-08)", () => {
  it("три значения фильтра меняют параметр view и выдачу", async () => {
    const { deps } = await renderJournal();
    const select = screen.getByLabelText("выберите что показать");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["выберите что показать", "Все карточки", "Пустые карточки", "Новые СМС"]);
    fireEvent.change(select, { target: { value: "sms" } });
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ view: "sms", page: 1 });
    expect(getRows()).toHaveLength(1);
    fireEvent.change(select, { target: { value: "empty" } });
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ view: "empty" });
    expect(screen.getByText("Карточек нет")).toBeInTheDocument();
    expect(screen.getByText("0 из 0")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "all" } });
    await advance();
    expect(deps.api.calls.getCards.at(-1)?.view).toBeUndefined();
  });

  it("автообновление включено по умолчанию и опрашивает список; выкл. — плашка, опрос прекращается", async () => {
    const { deps } = await renderJournal();
    const toggle = screen.getByRole("switch", { name: "Автообновление" });
    expect(toggle).toBeChecked();
    const before = deps.api.calls.getCards.length;
    await advance(LIST_POLL_MS);
    expect(deps.api.calls.getCards.length).toBe(before + 1);
    fireEvent.click(toggle);
    expect(screen.getByText("Автообновление отключено — список может быть неактуален")).toBeInTheDocument();
    const stopped = deps.api.calls.getCards.length;
    await advance(LIST_POLL_MS * 3);
    expect(deps.api.calls.getCards.length).toBe(stopped);
  });

  it("пагинация: «1-10 из 12» → стр. 2 запрашивает срез page=2 → «11-12 из 12»; размер страницы связан", async () => {
    const { deps } = await renderJournal();
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ page: 2, perPage: 10 });
    expect(screen.getByText("11-12 из 12")).toBeInTheDocument();
    expect(getRows()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Записей на странице:"), { target: { value: "20" } });
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ page: 1, perPage: 20 });
    expect(screen.getByText("1-12 из 12")).toBeInTheDocument();
  });
});

describe("IncidentJournal — раскрытие, предпросмотр, горячие клавиши (T2.2-05, T2.2-16)", () => {
  it("«Описание» раскрыто и сворачивается; предпросмотр — службы и статусы, Esc закрывает, фокус возвращается", async () => {
    await renderJournal();
    const [firstRow] = getRows();
    expect(within(firstRow).getByText("Описание:")).toBeInTheDocument();
    fireEvent.click(within(firstRow).getByRole("button", { name: "Свернуть описание" }));
    expect(within(firstRow).queryByText("Описание:")).not.toBeInTheDocument();
    fireEvent.click(within(firstRow).getByRole("button", { name: "Развернуть описание" }));
    expect(within(firstRow).getByText("Описание:")).toBeInTheDocument();

    const previewButton = screen.getByRole("button", { name: "Предпросмотр карточки 36814859" });
    previewButton.focus();
    fireEvent.click(previewButton);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Происшествие 36814859")).toBeInTheDocument();
    expect(within(dialog).getByText("Оповещённые службы")).toBeInTheDocument();
    expect(within(dialog).getByText("Последние статусы")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Открыть карточку" })).toHaveAttribute(
      "href",
      "/arm/card/card-36814859",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(previewButton).toHaveFocus();
  });

  it("Insert не создаёт карточку — подсказка; внутри поля ввода хоткеи не срабатывают", async () => {
    const { deps } = await renderJournal();
    const requests = deps.api.calls.getCards.length;
    fireEvent.keyDown(document, { key: "Insert" });
    expect(screen.getByRole("status")).toHaveTextContent("Insert) доступно преподавателю");
    expect(deps.api.calls.createSession).toHaveLength(0);
    expect(deps.api.calls.getCards.length).toBe(requests);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/доступно преподавателю/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /расширенный по параметрам/ }));
    await advance();
    const input = screen.getByLabelText("Адрес");
    fireEvent.keyDown(input, { key: "Insert" });
    expect(screen.queryByText(/доступно преподавателю/)).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("form", { name: "Расширенный поиск" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("form", { name: "Расширенный поиск" })).not.toBeInTheDocument();
  });
});

describe("IncidentJournal — молния «важное» (T2.2-10)", () => {
  it("пометка строки, уведомление с «АРМ 001» и ФИО, повторный клик снимает; переживает автообновление", async () => {
    await renderJournal();
    const [firstRow] = getRows();
    const bolt = within(firstRow).getByRole("button", { name: "Важное происшествие (Alt + I)" });
    fireEvent.click(bolt);
    expect(bolt).toHaveAttribute("aria-pressed", "true");
    expect(firstRow.className).toContain("incident-row--important");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Уведомление главным специалистам: происшествие № 36814859 отмечено как важное — АРМ 001, оператор Иванов Сергей Петрович",
    );
    await advance(LIST_POLL_MS);
    expect(
      within(getRows()[0]).getByRole("button", { name: "Важное происшествие (Alt + I)" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(getRows()[0]).getByRole("button", { name: "Важное происшествие (Alt + I)" }));
    expect(screen.getByRole("status")).toHaveTextContent("Пометка «важное происшествие» снята");
  });
});

describe("IncidentJournal — ошибки и офлайн", () => {
  it("сеть недоступна — плашка офлайна; ошибка сервера — сообщение и «Повторить»", async () => {
    const deps = createTestDeps();
    const { ApiError } = await import("@/shared/api");
    deps.api.getCards = vi.fn(async () => {
      throw new ApiError(0, "networkError", "Нет соединения с сервером");
    });
    await renderJournal(deps);
    expect(screen.getByRole("alert")).toHaveTextContent("Нет соединения с сервером");
    deps.api.getCards = vi.fn(async () => {
      throw new ApiError(500, "internal", "Ошибка сервера. Повторите попытку позже");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Автообновление" }));
    });
    expect(screen.getByText(/Карточек нет|Не удалось загрузить/)).toBeInTheDocument();
  });
});
