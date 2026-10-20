import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { armCardFixtures, classifier } from "@/shared/api";

import type { LinkedCard } from "../model/types";
import { IncidentCardView } from "./IncidentCardView";

function getFixture(id: string) {
  const card = armCardFixtures.find((fixture) => fixture.id === id);
  if (!card) throw new Error(`Нет фикстуры ${id}`);
  return card;
}

function getEntries(code: string) {
  const group = classifier.find((entry) => entry.code === code)?.group;
  return classifier.filter((entry) => entry.group === group);
}

const fireCard = getFixture("card-36814845");
const linkedCards: LinkedCard[] = [
  { id: "card-36814859", number: 36814859, role: "подчинённая", finalType: "задымление: квартира" },
];

function renderCard(
  options: { isExceeded?: boolean; readOnly?: boolean; id?: string; showTimer?: boolean } = {},
) {
  const card = options.id ? getFixture(options.id) : fireCard;
  return render(
    <IncidentCardView
      card={card}
      classifierEntries={getEntries(card.what.classifierCode)}
      linkedCards={linkedCards}
      isExceeded={options.isExceeded}
      readOnly={options.readOnly}
      showTimer={options.showTimer}
      stateToggleHref="/arm/card/card-36814845?state=exceeded"
    />,
  );
}

describe("IncidentCardView — телефония и шапка (T0.2-07)", () => {
  it("норма: шапка, таймер 3:00 и реакция", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Происшествие 36814845" })).toBeInTheDocument();
    expect(screen.getByText("Сохр. 17.09.2026 в 11:12:43")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "false");
    expect(screen.getByText(/Реакция: 0:18/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "просмотр" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "дополнение" })).toBeInTheDocument();
  });

  it("спека 012 FR-001: showTimer={false} — шапка без таймера и «Реакция», кнопки на месте", () => {
    renderCard({ showTimer: false });
    expect(screen.getByRole("heading", { name: "Происшествие 36814845" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText(/Реакция:/)).toBeNull();
    expect(screen.getByRole("button", { name: "дополнение" })).toBeInTheDocument();
  });

  it("превышение: красный таймер и красная шапка", () => {
    const { container } = renderCard({ isExceeded: true });
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "true");
    const header = container.querySelector("[data-exceeded='true'].header--exceeded");
    expect(header).not.toBeNull();
  });

  it("статус линии по умолчанию «недоступен», клик переключает", () => {
    renderCard();
    const status = screen.getByRole("button", { name: "Статус телефонии: недоступен" });
    fireEvent.click(status);
    expect(screen.getByRole("button", { name: "Статус телефонии: не подключен" })).toBeInTheDocument();
  });

  it("маска телефона: АОН и шаблон пустого поля", () => {
    renderCard();
    expect(screen.getByLabelText("АОН")).toHaveValue("+7 (977) 567-56-76");
    expect(screen.getByLabelText("телефон на место")).toHaveAttribute("placeholder", "+7 (___) ___-__-__");
  });
});

describe("IncidentCardView — левая колонка (T0.2-08)", () => {
  it("заявитель, флаги, журнал", () => {
    renderCard();
    expect(screen.getByText("Крылова Татьяна")).toBeInTheDocument();
    expect(screen.getByText("Пострадавшие: нет")).toBeInTheDocument();
    expect(screen.getByText("Отказ от скорой: нет")).toBeInTheDocument();
    expect(screen.getByText("Заблокированные: нет")).toBeInTheDocument();
    const journal = screen.getByRole("region", { name: "Журнал событий / описание" });
    expect(within(journal).getByText("17.09.2026 11:13:19")).toBeInTheDocument();
    expect(within(journal).getByText("УМЦ О.п.")).toBeInTheDocument();
    expect(within(journal).getByText("Пожар в квартире")).toBeInTheDocument();
  });

  it("адрес разворачивается во все поля спеки и локальную карту", () => {
    renderCard({ id: "card-881412" });
    fireEvent.click(screen.getByRole("button", { name: /Развернуть адрес/ }));
    const labels = [
      "Страна:",
      "Субъект:",
      "Нас. пункт:",
      "Округ:",
      "Район:",
      "Улица:",
      "Дом:",
      "Корпус:",
      "Подъезд:",
      "Этаж:",
      "Описательный адрес:",
    ];
    labels.forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument());
    expect(screen.getByLabelText("Улица:")).toHaveValue("Чертановская улица");
    expect(screen.getByLabelText("Корпус:")).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Указать на карте" })).toBeInTheDocument();
    expect(screen.getByTestId("map-point")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Локальная карта/ }).querySelector("img")).toHaveAttribute(
      "src",
      "/mock-map-tile.svg",
    );
  });
});

describe("IncidentCardView — «Что случилось» (T0.2-09)", () => {
  it("свёрнутый вид и разворачивание чип-групп по клику", () => {
    renderCard();
    expect(screen.getByText("Происшествие 101")).toBeInTheDocument();
    expect(screen.getByText("жилой дом. квартира. открытое пламя.")).toBeInTheDocument();
    expect(screen.getByText("пожар: квартира;")).toBeInTheDocument();
    expect(screen.queryByText(/\[ВИС\] Класс\.:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Происшествие 101" }));
    const group = screen.getByRole("group", { name: "112-Признак.3" });
    expect(within(group).getByRole("button", { name: "открытое пламя" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("IncidentCardView — связи; без «Действия диспетчера» и отработок (T0.2-10, спека 012)", () => {
  it("связи с ролями; полей «Действие диспетчера», «Номер наряда» и блока отработок нет (памятка, стр. 23)", () => {
    renderCard({ id: "card-36814853" });
    expect(screen.queryByLabelText("Действие диспетчера")).toBeNull();
    expect(screen.queryByLabelText("Номер наряда")).toBeNull();
    expect(screen.queryByRole("region", { name: "Отработки" })).toBeNull();
  });

  it("блок «Связи» с ролями", () => {
    renderCard();
    const links = screen.getByRole("region", { name: "Связи" });
    expect(within(links).getByText("подчинённая")).toBeInTheDocument();
    expect(within(links).getByRole("link", { name: "Происшествие 36814859" })).toHaveAttribute(
      "href",
      "/arm/card/card-36814859",
    );
  });
});

describe("IncidentCardView — оверлеи записей и SMS (T0.2-12)", () => {
  it("«записи звонков» открывает модалку, Esc закрывает", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "записи звонков" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Записи разговоров");
    expect(screen.getByText("01:24")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("без АОН — «Записей не найдено»", () => {
    renderCard({ id: "card-36814856" });
    fireEvent.click(screen.getByRole("button", { name: "записи звонков" }));
    expect(screen.getByText("Записей не найдено")).toBeInTheDocument();
  });

  it("«список SMS» показывает переписку по АОН и форму отправки", async () => {
    renderCard({ id: "card-36814859" });
    fireEvent.click(screen.getByRole("button", { name: "список SMS" }));
    expect(screen.getByText(/Помогите мне! Дым в квартире/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Текст СМС"), { target: { value: "Помощь направлена" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить СМС" }));
    const history = screen.getByRole("list", { name: "История сообщений" });
    expect(await within(history).findByText("Помощь направлена")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("IncidentCardView — readOnly (преподаватель)", () => {
  it("контролы неактивны или скрыты", () => {
    renderCard({ readOnly: true });
    expect(screen.getByRole("button", { name: "Статус телефонии: недоступен" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "просмотр" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Происшествие 36814859" })).toBeNull();
  });
});
