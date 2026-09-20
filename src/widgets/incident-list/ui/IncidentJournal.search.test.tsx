import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { advance, DEMO_NOW, renderJournal } from "./journalTestUtils.testing";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(DEMO_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

async function openAdvancedSearch() {
  fireEvent.click(screen.getByRole("button", { name: /расширенный по параметрам/ }));
  await advance();
  return screen.getByRole("form", { name: "Расширенный поиск" });
}

function type(form: HTMLElement, label: string, value: string) {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
}

describe("Расширенный поиск: фильтрация выдачи (T2.2-13)", () => {
  it("«найти» — новый запрос GET /cards с 8 обязательными полями (AND) на полном датасете", async () => {
    const { deps } = await renderJournal();
    const form = await openAdvancedSearch();
    type(form, "Тип происшествия", "пожар");
    type(form, "Адрес", "Вавилова");
    type(form, "По округу", "ЮАО, ЦАО");
    fireEvent.click(within(form).getByRole("button", { name: "Зарегистрирована" }));
    type(form, "с", "2026-09-17T11:00");
    type(form, "по", "2026-09-17T12:00");
    type(form, "По описанию", "дым");
    type(form, "Заявитель (ФИО/АОН)", "8916");
    type(form, "Номер карточки", "368");
    fireEvent.click(within(form).getByRole("button", { name: "Служба 101" }));
    fireEvent.click(within(form).getByRole("button", { name: "найти" }));
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({
      dataset: "all",
      page: 1,
      incidentType: "пожар",
      address: "Вавилова",
      okrug: ["ЮАО", "ЦАО"],
      cardStatus: ["registered"],
      createdFrom: "2026-09-17T11:00:00+03:00",
      createdTo: "2026-09-17T12:00:00+03:00",
      description: "дым",
      applicant: "8916",
      cardNumber: "368",
      service: ["svc-101"],
    });
    expect(screen.queryByRole("form", { name: "Расширенный поиск" })).not.toBeInTheDocument();
  });

  it("пустая выдача — «Карточек нет», не ошибка; «сбросить» очищает форму и выдачу", async () => {
    const { deps } = await renderJournal();
    let form = await openAdvancedSearch();
    type(form, "Номер карточки", "000000");
    fireEvent.click(within(form).getByRole("button", { name: "найти" }));
    await advance();
    expect(screen.getByText("Карточек нет")).toBeInTheDocument();
    expect(screen.getByText("0 из 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "сбросить" }));
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ dataset: "fixtures" });
    expect(deps.api.calls.getCards.at(-1)?.cardNumber).toBeUndefined();
    expect(screen.getByText("1-10 из 12")).toBeInTheDocument();
    form = await openAdvancedSearch();
    expect(within(form).getByLabelText("Номер карточки")).toHaveValue("");
  });

  it("пагинация не сбрасывает применённые фильтры", async () => {
    const { deps } = await renderJournal();
    const form = await openAdvancedSearch();
    type(form, "Тип происшествия", "а");
    fireEvent.click(within(form).getByRole("button", { name: "найти" }));
    await advance();
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    await advance();
    expect(deps.api.calls.getCards.at(-1)).toMatchObject({ page: 2, incidentType: "а", dataset: "all" });
  });
});

describe("Связи в списке (T2.2-09)", () => {
  it("счётчик связанных карточек, цепочка с ролями, переход в связанную карточку", async () => {
    await renderJournal();
    const form = await openAdvancedSearch();
    type(form, "Номер карточки", "47");
    fireEvent.click(within(form).getByRole("button", { name: "найти" }));
    await advance();
    await advance();
    const row = screen.getByRole("link", { name: "47" }).closest('[role="rowgroup"]') as HTMLElement;
    const linksButton = within(row).getByRole("button", { name: /Связи: 1/ });
    expect(linksButton).toHaveTextContent("1");
    fireEvent.click(linksButton);
    const chain = within(row).getByRole("list", { name: "Цепочка связей" });
    expect(within(chain).getByText("главная")).toBeInTheDocument();
    expect(within(chain).getByText("подчинённая")).toBeInTheDocument();
    expect(within(chain).getByRole("link", { name: "№ 3" })).toHaveAttribute("href", "/arm/card/c-003");
    expect(within(chain).getByText("№ 47 (эта карточка)")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Совпадение/ })).not.toBeInTheDocument();
  });
});
