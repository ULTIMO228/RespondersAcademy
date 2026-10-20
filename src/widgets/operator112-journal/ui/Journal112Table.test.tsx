import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Journal112Row } from "@/shared/api";

import { Journal112Table } from "./Journal112Table";

const row = (o: Partial<Journal112Row>): Journal112Row => ({
  cardId: "c1",
  number: "179968",
  createdAt: new Date(2019, 5, 26, 20, 15).toISOString(),
  operator: "",
  arm: "",
  whatHappened: "Природная стихия",
  injured: "",
  status: "Не оповещено",
  address: "Москва",
  description: "Тест",
  linked: true,
  chs: true,
  checked: true,
  isOwn: false,
  ...o,
});

describe("Journal112Table", () => {
  it("рисует заголовки, тумблеры, строки и пагинацию", () => {
    render(<Journal112Table rows={[row({})]} onOpenRow={vi.fn()} />);
    for (const t of [
      "Связи",
      "ЧС",
      "Опер.",
      "АРМ",
      "Номер",
      "Дата",
      "Время",
      "Что случилось",
      "Постр.",
      "Статус",
      "Адрес",
      "Проверена",
    ]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(t) })).toBeTruthy();
    }
    expect(screen.getByText(/Список происшествий/)).toBeTruthy();
    expect(screen.getByText(/уведомление/)).toBeTruthy();
    expect((screen.getByRole("switch", { name: "автообновление" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("switch", { name: "обращения в очереди" })).toBeTruthy();
    expect(screen.getByText("выберите что показывать")).toBeTruthy();
    expect(screen.getByText("Описание: Тест")).toBeTruthy();
    expect(screen.getByText("выберите группу")).toBeTruthy();
    expect(screen.getByText(/Страница: 1/)).toBeTruthy();
    expect(screen.getByText(/1–1 из 1/)).toBeTruthy();
    expect(screen.getByText("20:15")).toBeTruthy();
  });

  it("queued-строка выделена и открывается кликом", () => {
    const onOpen = vi.fn();
    const q = row({ cardId: "q", queued: true, whatHappened: "Ожидает" });
    render(<Journal112Table rows={[row({}), q]} onOpenRow={onOpen} />);
    const tr = screen.getByText("Ожидает").closest("tr")!;
    expect(tr.getAttribute("data-queued")).toBe("true");
    fireEvent.click(tr);
    expect(onOpen).toHaveBeenCalledWith(q);
  });
});
