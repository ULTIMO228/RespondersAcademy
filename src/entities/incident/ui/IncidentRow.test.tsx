import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncidentListItem } from "../model/types";
import { IncidentRow } from "./IncidentRow";

const BASE_ITEM: IncidentListItem = {
  id: "card-36814845",
  href: "/arm/card/card-36814845",
  number: 36814845,
  createdAt: "2026-09-17T11:12:43+03:00",
  operatorNumber: "0",
  armNumber: "4",
  typeName: "пожар: квартира",
  typeCode: "101",
  victims: "Нет",
  address: "Москва, (ТАО, Вороновское), Троицкий административный округ",
  serviceStatus: { code: "added", title: "Добавлена", tone: "new" },
  emergencyMark: null,
  smsCount: 0,
  description: { meta: "17.09.2026 11:13:19 УМЦ О.п. -", text: "Пожар в квартире" },
  links: [],
  isImportant: false,
  isEmpty: false,
  state: "normal",
  issuedAt: null,
  reactionTimer: null,
  preview: { applicant: "", phone: "", cardStatus: "", services: [], recentStatuses: [] },
};

function renderRow(item: IncidentListItem, isExpanded = true) {
  const actions = {
    onToggleExpand: vi.fn(),
    onToggleLinks: vi.fn(),
    onToggleImportant: vi.fn(),
    onPreview: vi.fn(),
    onOpen: vi.fn(),
    onReminder: vi.fn(),
  };
  render(
    <IncidentRow item={item} isExpanded={isExpanded} isLinksOpen isImportant={false} actions={actions} />,
  );
  return actions;
}

describe("IncidentRow", () => {
  it("рендерит ячейки строки, «Описание» и тултип кода типа", () => {
    renderRow(BASE_ITEM);
    expect(screen.getByRole("link", { name: "36814845" })).toHaveAttribute("href", "/arm/card/card-36814845");
    expect(screen.getByText("17.09.26")).toBeInTheDocument();
    expect(screen.getByText("Описание:")).toBeInTheDocument();
    expect(screen.getByText("Пожар в квартире")).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("101");
  });

  it("строка-нарушение имеет маркер нарушения и красный таймер", () => {
    renderRow({ ...BASE_ITEM, state: "violation", reactionTimer: "0:00" });
    expect(screen.getByRole("img", { name: /Нарушение/ })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "true");
    expect(screen.getByRole("rowgroup")).toHaveAttribute("data-state", "violation");
  });

  it("новая карточка — таймер 0:30 без превышения", () => {
    renderRow({ ...BASE_ITEM, state: "new", reactionTimer: "0:30" });
    expect(screen.getByRole("timer")).toHaveTextContent("0:30");
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "false");
  });

  it("цепочка связей: роли и ссылка на связанную карточку; иконки вызывают действия", () => {
    const actions = renderRow({
      ...BASE_ITEM,
      links: [
        {
          id: "card-36814845",
          number: 36814845,
          role: "главная",
          href: "/arm/card/card-36814845",
          isCurrent: true,
        },
        {
          id: "card-36814859",
          number: 36814859,
          role: "подчинённая",
          href: "/arm/card/card-36814859",
          isCurrent: false,
        },
      ],
    });
    expect(screen.getByText("главная")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "№ 36814859" })).toHaveAttribute(
      "href",
      "/arm/card/card-36814859",
    );
    fireEvent.click(screen.getByRole("button", { name: /Предпросмотр карточки/ }));
    expect(actions.onPreview).toHaveBeenCalledWith("card-36814845");
    fireEvent.click(screen.getByRole("button", { name: /Свернуть описание/ }));
    expect(actions.onToggleExpand).toHaveBeenCalledWith("card-36814845");
  });

  it("переход в карточку (номер/тип) фиксирует открытие; будильник и молния вызывают действия", () => {
    const actions = renderRow(BASE_ITEM);
    const number = screen.getByRole("link", { name: "36814845" });
    number.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(number);
    expect(actions.onOpen).toHaveBeenCalledWith("card-36814845");
    fireEvent.click(screen.getByRole("button", { name: "Напоминание" }));
    expect(actions.onReminder).toHaveBeenCalledWith("card-36814845");
    fireEvent.click(screen.getByRole("button", { name: "Важное происшествие (Alt + I)" }));
    expect(actions.onToggleImportant).toHaveBeenCalledWith("card-36814845");
  });

  it("счётчик связей не включает саму карточку; read-only подсказка о механике привязки", () => {
    renderRow({
      ...BASE_ITEM,
      links: [
        { id: "c-003", number: 3, role: "главная", href: "/arm/card/c-003", isCurrent: false },
        {
          id: "card-36814845",
          number: 36814845,
          role: "подчинённая",
          href: "/arm/card/card-36814845",
          isCurrent: true,
        },
      ],
    });
    expect(screen.getByRole("button", { name: /Связи: 1/ })).toHaveTextContent("1");
    expect(screen.getByText(/Связи только для просмотра/)).toBeInTheDocument();
  });

  it("иконочные кнопки строки имеют русские доступные имена (T5.2-08)", () => {
    renderRow(BASE_ITEM);
    const preview = screen.getByRole("button", { name: "Предпросмотр карточки 36814845" });
    expect(preview).toBeInTheDocument();
    // Все кнопки строки — с именем: иконка без подписи недопустима.
    const nameless = screen
      .getAllByRole("button")
      .filter((node) => !(node.getAttribute("aria-label") ?? node.textContent ?? "").trim());
    expect(nameless).toEqual([]);
  });

  it("длинные адрес, тип и описание не теряются: полный текст в подсказке (T5.2-07)", () => {
    const address =
      "Москва, Троицкий административный округ, поселение Вороновское, деревня Львово, " +
      "садовое товарищество «Энергетик-2», улица Центральная, дом 128, корпус 3, строение 1";
    const typeName = "дорожно-транспортное происшествие с пострадавшими, требуется эвакуация";
    const text = "Горит балкон на девятом этаже, в квартире остались люди, лестница перекрыта";
    renderRow({
      ...BASE_ITEM,
      address,
      typeName,
      description: { meta: BASE_ITEM.description!.meta, text },
    });
    expect(screen.getByText(address)).toHaveAttribute("title", address);
    expect(screen.getByText(text)).toHaveAttribute("title", text);
    expect(screen.getByRole("link", { name: typeName })).toHaveAttribute(
      "title",
      `${typeName} (${BASE_ITEM.typeCode})`,
    );
    expect(screen.getByRole("link", { name: "36814845" })).toHaveAttribute(
      "title",
      "Открыть карточку 36814845",
    );
  });
});
