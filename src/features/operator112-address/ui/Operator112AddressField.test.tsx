import { act, fireEvent, render, screen } from "@testing-library/react";
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

const type = (text: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
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
    expect(screen.getAllByRole("option")).toHaveLength(2);
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
    expect(screen.getByTestId("address-source")).toHaveTextContent("из справочника");
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
    const input = screen.getByRole("combobox");
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
    expect(screen.getByRole("combobox")).toBeEnabled();
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
    fireEvent.change(screen.getByLabelText("Дом"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Описательный адрес"), { target: { value: "у библиотеки" } });
    expect(latest.house).toBe("11");
    expect(screen.getByRole("alert")).toHaveTextContent("Заполните адресный блок");
  });
});
