import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Journal112Row } from "@/shared/api";

import { LinksView } from "./LinksView";
import { MatchWindow } from "./MatchWindow";

const row = (cardId: string, number: string): Journal112Row => ({
  cardId,
  number,
  createdAt: "2018-07-27T11:00:00",
  operator: "1000",
  arm: "123",
  whatHappened: "ДТП",
  injured: "Нет",
  status: "Зарегистрирована",
  address: "Москва (ЦАО, Красносельский район)",
  description: "авария на перекрёстке",
  linked: false,
  chs: false,
  checked: true,
  isOwn: false,
});

describe("MatchWindow «Есть карточка с заявителем по этому номеру»", () => {
  it("показывает заголовок, найденную карточку и обе кнопки; действия вызывают обратные вызовы", () => {
    const onLink = vi.fn();
    const onContinue = vi.fn();
    render(<MatchWindow matches={[row("c-1", "165561")]} onLink={onLink} onContinue={onContinue} />);
    expect(screen.getByText("Есть карточка с заявителем по этому номеру:")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Найденные карточки" });
    expect(within(table).getByText("165561")).toBeInTheDocument();
    expect(within(table).getByText("11:00")).toBeInTheDocument();
    expect(within(table).getByText("27.07.18")).toBeInTheDocument();
    expect(within(table).getByText(/Описание: авария/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "привязать карточку 165561" }));
    expect(onLink).toHaveBeenCalledWith("c-1");
    fireEvent.click(screen.getByRole("button", { name: "закрыть и продолжить заполнение новой" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("без совпадений окно не показывается", () => {
    render(<MatchWindow matches={[]} onLink={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("LinksView «Показ связей»", () => {
  const cards = [
    { row: row("c-1", "165561"), primary: true },
    { row: row("c-2", "165562"), primary: false },
  ];

  it("главная синяя без кнопок, у подчинённой «отвязать» и «сделать главной»; полоса с числом карточек", () => {
    const onUnlink = vi.fn();
    const onMakePrimary = vi.fn();
    const onBack = vi.fn();
    render(<LinksView cards={cards} onUnlink={onUnlink} onMakePrimary={onMakePrimary} onBack={onBack} />);
    const rows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-card-id"));
    expect(rows[0]).toHaveAttribute("data-primary", "true");
    expect(rows[1]).toHaveAttribute("data-primary", "false");
    expect(within(rows[0]).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "отвязать карточку 165562" }));
    expect(onUnlink).toHaveBeenCalledWith("c-2");
    fireEvent.click(screen.getByRole("button", { name: "сделать главной карточку 165562" }));
    expect(onMakePrimary).toHaveBeenCalledWith("c-2");
    expect(screen.getByText("Показ связей: карточек 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← вернуться в карточку" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("текущая карточка — подчинённая строка в конце, «отвязать» снимает её связи; счётчик учитывает её (ИНСТРУКЦИЯ_65)", () => {
    const onUnlinkCurrent = vi.fn();
    const current = { ...cards[1].row, cardId: "c-new", number: "165563" };
    render(
      <LinksView
        cards={cards}
        current={{ row: current, onUnlink: onUnlinkCurrent }}
        onUnlink={vi.fn()}
        onMakePrimary={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-card-id"));
    expect(rows.at(-1)).toHaveAttribute("data-card-id", "c-new");
    expect(screen.getByText("Показ связей: карточек 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "отвязать карточку 165563" }));
    expect(onUnlinkCurrent).toHaveBeenCalledOnce();
  });
});
