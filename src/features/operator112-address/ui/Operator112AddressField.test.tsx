import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { CardDraftAddress, Street } from "@/shared/api";

import { EMPTY_ADDRESS } from "../model/address";
import { SUGGEST_DEBOUNCE_MS } from "../model/useStreetSuggest";
import type { StreetSearch } from "../model/useStreetSuggest";
import { Operator112AddressField } from "./Operator112AddressField";

const GRINA: Street = { id: 7, name: "улица Грина", type: "улица", okrug: "ЮАО", raion: "Чертаново Южное" };
const GRIBOEDOVA: Street = { id: 8, name: "Грибоедова переулок", type: "переулок" };

let latest: CardDraftAddress = EMPTY_ADDRESS;

function Harness({ search, error }: { search: StreetSearch; error?: string }) {
  const [value, setValue] = useState(EMPTY_ADDRESS);
  latest = value;
  return <Operator112AddressField value={value} onChange={setValue} search={search} error={error} />;
}

const type = (text: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "Улица:" }), { target: { value: text } });
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS + 10);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Operator112AddressField", () => {
  it("меньше 3 символов — запрос не отправляется; от 3 — подсказки справочника", async () => {
    const search = vi.fn<StreetSearch>().mockResolvedValue([GRINA, GRIBOEDOVA]);
    render(<Harness search={search} />);
    type("Гр");
    await settle();
    expect(search).not.toHaveBeenCalled();
    type("Гри");
    await settle();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("Гри");
    expect(
      within(screen.getByRole("listbox", { name: "Улицы справочника" })).getAllByRole("option"),
    ).toHaveLength(2);
  });

  it("быстрый набор даёт один запрос по последнему тексту (задержка ввода)", async () => {
    const search = vi.fn<StreetSearch>().mockResolvedValue([GRINA]);
    render(<Harness search={search} />);
    for (const text of ["Гри", "Грин", "Грина"]) {
      type(text);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }
    await settle();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("Грина");
  });

  it("выбор подсказки фиксирует источник «из справочника», округ и район", async () => {
    render(<Harness search={vi.fn<StreetSearch>().mockResolvedValue([GRINA])} />);
    type("Грин");
    await settle();
    fireEvent.mouseDown(screen.getByRole("button", { name: /улица Грина/ }));
    expect(latest).toMatchObject({
      street: "улица Грина",
      okrug: "ЮАО",
      raion: "Чертаново Южное",
      source: "directory",
    });
    expect(screen.getByRole("group", { name: "Адрес" })).toHaveAttribute("data-source", "directory");
    expect(screen.getByTestId("address-formal")).toHaveTextContent("Москва, улица Грина");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ручной ввод — источник «вручную»; правка после выбора возвращает manual", async () => {
    render(<Harness search={vi.fn<StreetSearch>().mockResolvedValue([GRINA])} />);
    type("Грин");
    expect(latest.source).toBe("manual");
    await settle();
    fireEvent.mouseDown(screen.getByRole("button", { name: /улица Грина/ }));
    type("улица Гриновская");
    expect(latest.source).toBe("manual");
  });

  it("клавиатура: стрелки и Enter выбирают подсказку", async () => {
    render(<Harness search={vi.fn<StreetSearch>().mockResolvedValue([GRINA, GRIBOEDOVA])} />);
    type("Гри");
    await settle();
    const input = screen.getByRole("combobox", { name: "Улица:" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(latest.street).toBe("Грибоедова переулок");
    expect(latest.source).toBe("directory");
  });

  it("нет совпадений — подсказка про ручной ввод; ввод не блокируется", async () => {
    render(<Harness search={vi.fn<StreetSearch>().mockResolvedValue([])} />);
    type("Абракадабра");
    await settle();
    expect(screen.getByText(/можно ввести вручную/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Улица:" })).toBeEnabled();
  });

  it("400 сервера: сообщение выводится у поля, набор продолжается", async () => {
    const search = vi
      .fn<StreetSearch>()
      .mockRejectedValue(new ApiError(400, "validationFailed", "Параметр «q» — не менее 3 символов"));
    render(<Harness search={search} />);
    type("Грин");
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Параметр «q» — не менее 3 символов");
    type("Грина");
    expect(latest.street).toBe("Грина");
  });

  it("дом и описательный адрес пересчитывают formal; ошибка передачи показывается у блока", () => {
    render(<Harness search={vi.fn<StreetSearch>()} error="Заполните адресный блок" />);
    fireEvent.change(screen.getByLabelText("Дом/Вл.:"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Описательный адрес:"), { target: { value: "у библиотеки" } });
    expect(latest.house).toBe("11");
    expect(screen.getByRole("alert")).toHaveTextContent("Заполните адресный блок");
  });

  it("«очистить адрес» и «×» строки адреса очищают все поля; расширенные поля неактивны до этапа B", () => {
    render(<Harness search={vi.fn<StreetSearch>()} />);
    type("улица Грина");
    fireEvent.change(screen.getByLabelText("Дом/Вл.:"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "очистить адрес" }));
    expect(latest).toEqual(EMPTY_ADDRESS);
    type("Ленина");
    fireEvent.click(screen.getByRole("button", { name: "Очистить строку адреса" }));
    expect(latest).toEqual(EMPTY_ADDRESS);
    expect(screen.getByLabelText("Субъект:")).toHaveValue("Москва");
  });

  it("умолчания Россия / Москва / Москва; «очистить адрес» возвращает их после правки", () => {
    render(<Harness search={vi.fn<StreetSearch>()} />);
    expect(screen.getByLabelText("Страна:")).toHaveValue("Россия");
    expect(screen.getByLabelText("Субъект:")).toHaveValue("Москва");
    expect(screen.getByLabelText("Населенный пункт:")).toHaveValue("Москва");
    fireEvent.change(screen.getByLabelText("Субъект:"), { target: { value: "Тверская область" } });
    fireEvent.change(screen.getByLabelText("Страна:"), { target: { value: "Беларусь" } });
    fireEvent.change(screen.getByLabelText("Квартира/офис:"), { target: { value: "12" } });
    expect(latest.subject).toBe("Тверская область");
    fireEvent.click(screen.getByRole("button", { name: "очистить адрес" }));
    expect(latest).toEqual(EMPTY_ADDRESS);
    expect(screen.getByLabelText("Страна:")).toHaveValue("Россия");
    expect(screen.getByLabelText("Квартира/офис:")).toHaveValue("");
  });

  it("все расширенные поля активны и пишутся в адрес", () => {
    render(<Harness search={vi.fn<StreetSearch>()} />);
    const fields: [string, keyof CardDraftAddress][] = [
      ["Объект:", "object"],
      ["Корпус:", "korpus"],
      ["Стр/соор:", "building"],
      ["Квартира/офис:", "flat"],
      ["Подъезд:", "entrance"],
      ["Этаж:", "floor"],
      ["Код:", "code"],
    ];
    for (const [label, key] of fields) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: `v-${key}` } });
      expect(latest[key]).toBe(`v-${key}`);
    }
  });

  it("другой субъект — ручной ввод: справочник не запрашивается, источник manual", async () => {
    const search = vi.fn<StreetSearch>().mockResolvedValue([GRINA]);
    render(<Harness search={search} />);
    fireEvent.change(screen.getByLabelText("Субъект:"), { target: { value: "Тверская область" } });
    type("улица Ленина");
    await settle();
    expect(search).not.toHaveBeenCalled();
    expect(latest.source).toBe("manual");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("округ сужает подсказки справочника", async () => {
    render(
      <Harness search={vi.fn<StreetSearch>().mockResolvedValue([GRINA, { ...GRIBOEDOVA, okrug: "ЦАО" }])} />,
    );
    fireEvent.change(screen.getByLabelText("Округ:"), { target: { value: "ЦАО" } });
    type("Гри");
    await settle();
    expect(
      within(screen.getByRole("listbox", { name: "Улицы справочника" })).getAllByRole("option"),
    ).toHaveLength(1);
  });

  it("кнопка карты открывает окно «С112 — карта»; выбор точки пишет lat/lon в адрес", () => {
    render(<Harness search={vi.fn<StreetSearch>()} />);
    fireEvent.click(screen.getByRole("button", { name: "Указать на карте" }));
    const surface = screen.getByTestId("map-surface");
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Указать на карте" }));
    fireEvent.click(surface, { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(latest.lat).toBe(55.7558);
    expect(latest.lon).toBe(37.6173);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
