import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotificationListResponse } from "@/shared/api";

import { TEST_ENTRIES, TEST_LIST } from "../model/fixtures";
import { useQuestionnaire } from "../model/useQuestionnaire";
import type { QuestionnaireApi, QuestionnaireValue } from "../model/useQuestionnaire";
import { Operator112ServicesBar } from "./Operator112ServicesBar";
import { Operator112WhatHappened } from "./Operator112WhatHappened";

function makeApi(list: NotificationListResponse = TEST_LIST): QuestionnaireApi & {
  sendEvent: ReturnType<typeof vi.fn>;
  getList: ReturnType<typeof vi.fn>;
} {
  return {
    sendEvent: vi.fn().mockResolvedValue({ id: "ev-1", type: "signSelected", at: "t", payload: {} }),
    getList: vi.fn().mockResolvedValue(list),
  };
}

type HarnessProps = {
  api: QuestionnaireApi;
  disabled?: boolean;
  initialSigns?: string[];
  onChange?: (value: QuestionnaireValue, list: NotificationListResponse | null) => void;
  onSave?: () => void;
};

/** Карточка в миниатюре: «что случилось?» и панель служб на одном состоянии опросной карты, как на экране 112. */
function Harness({ api, disabled = false, initialSigns, onChange, onSave = vi.fn() }: HarnessProps) {
  const q = useQuestionnaire({
    attemptId: "att-1",
    entries: TEST_ENTRIES,
    initialSigns,
    disabled,
    api,
    onChange,
  });
  return (
    <>
      <Operator112WhatHappened questionnaire={q} entries={TEST_ENTRIES} disabled={disabled} />
      <Operator112ServicesBar questionnaire={q} disabled={disabled} onSave={onSave} />
    </>
  );
}

async function pickPath(query: string, group: string, ...signs: string[]) {
  fireEvent.change(screen.getByRole("combobox", { name: "Введите тип происшествия" }), {
    target: { value: query },
  });
  fireEvent.mouseDown(await screen.findByRole("button", { name: group }));
  for (const sign of signs) fireEvent.click(await screen.findByRole("button", { name: sign }));
}

const tiles = async () => within(await screen.findByRole("list", { name: "Список оповещения" }));

describe("«что случилось?»: тип происшествия и опросная карта", () => {
  it("до выбора — подпись, быстрые типы и «Значимые типы происшествий:»; без группы в ЕКП тип неактивен", () => {
    render(<Harness api={makeApi()} />);
    expect(screen.getByRole("combobox", { name: "Введите тип происшествия" })).toHaveAttribute(
      "placeholder",
      "что случилось?",
    );
    expect(screen.getByText("Значимые типы происшествий:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ДТП" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Тестовый вызов" })).toBeDisabled();
  });

  it("подсказки по слову → вкладка типа с чипами; повторный клик снимает признак; «×» вкладки удаляет тип", async () => {
    const api = makeApi();
    render(<Harness api={api} />);
    await pickPath("пожар", "пожар в жилом доме");
    expect(screen.getByRole("tab", { name: /пожар в жилом доме/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "добавить тип происшествия" })).toBeInTheDocument();
    expect(screen.queryByText("Значимые типы происшествий:")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "жилой дом" }));
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "жилой дом" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Удалить тип «пожар в жилом доме»" }));
    expect(await screen.findByText("Значимые типы происшествий:")).toBeInTheDocument();
  });

  it("клавиатура: стрелка и Enter выбирают тип", async () => {
    render(<Harness api={makeApi()} />);
    const input = screen.getByRole("combobox", { name: "Введите тип происшествия" });
    fireEvent.change(input, { target: { value: "пожар" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("tab", { name: /пожар на улице/ })).toBeInTheDocument();
  });

  it("каждый выбор шлёт signSelected с полным списком признаков; плитки служб — из списка оповещения", async () => {
    const api = makeApi();
    const onChange = vi.fn();
    render(<Harness api={api} onChange={onChange} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом", "балкон", "открытое пламя");
    await waitFor(() => expect(api.getList).toHaveBeenCalled());
    const sent = api.sendEvent.mock.calls.map(([, event]) => event.payload.signs);
    expect(sent).toEqual([
      [],
      ["жилой дом"],
      ["жилой дом", "балкон"],
      ["жилой дом", "балкон", "открытое пламя"],
    ]);
    expect(await (await tiles()).findByText("Служба 101")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить службу Служба 101 (МЧС)" })).toBeDisabled();
    expect(screen.getByTestId("final-type")).toHaveTextContent("пожар: балкон");
    const last = onChange.mock.calls.at(-1)!;
    expect(last[0]).toMatchObject({
      classifierCode: "1050201",
      finalType: "пожар: балкон",
      signs: ["жилой дом", "балкон", "открытое пламя"],
    });
    expect(last[1]).toEqual(TEST_LIST);
  });

  it("итоговый тип в шапке вкладки — только при однозначном выборе", async () => {
    render(<Harness api={makeApi()} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом", "балкон");
    expect(screen.getByTestId("final-type")).toHaveTextContent("");
    fireEvent.click(await screen.findByRole("button", { name: "дым" }));
    expect(await screen.findByText("пожар: балкон (дым)")).toBeInTheDocument();
  });

  it("сеть упала на пересчёте: сообщение и «Повторить» без потери выбранных признаков", async () => {
    const api = makeApi();
    api.getList.mockRejectedValueOnce(new Error("Нет соединения с сервером"));
    render(<Harness api={api} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом");
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет соединения с сервером");
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await (await tiles()).findByText("Служба 101")).toBeInTheDocument();
  });

  it("409 сервера на событии: сообщение сервера, выбор остаётся, список не запрашивается", async () => {
    const api = makeApi();
    api.sendEvent.mockRejectedValue(new Error("Карточка уже отправлена"));
    render(<Harness api={api} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом");
    expect(await screen.findByRole("alert")).toHaveTextContent("Карточка уже отправлена");
    expect(api.getList).not.toHaveBeenCalled();
  });

  it("снятие последнего признака убирает плитки служб", async () => {
    render(<Harness api={makeApi()} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом");
    await (await tiles()).findByText("Служба 101");
    fireEvent.click(screen.getByRole("button", { name: "жилой дом" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Список оповещения" })).toBeNull());
  });

  it("после перезагрузки выбор восстанавливается из событий и список запрашивается один раз", async () => {
    const api = makeApi();
    render(<Harness api={api} initialSigns={["на улице", "мусор"]} />);
    await (await tiles()).findByText("Служба 101");
    expect(screen.getByRole("tab", { name: /пожар на улице/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "мусор" })).toHaveAttribute("aria-pressed", "true");
    expect(api.getList).toHaveBeenCalledTimes(1);
    expect(api.sendEvent).not.toHaveBeenCalled();
  });

  it("disabled (вызов не принят): ввод, «+» и «сохранить» недоступны, запросов нет", () => {
    const api = makeApi();
    render(<Harness api={api} disabled />);
    expect(screen.getByRole("combobox", { name: "Введите тип происшествия" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Добавить службы" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "сохранить" })).toBeDisabled();
    expect(api.sendEvent).not.toHaveBeenCalled();
  });
});

describe("«Добавьте службы» и панель «Службы:»", () => {
  it("условная служба добавляется: выбор синим, «Сохранить и закрыть» → serviceAdded и пересчёт", async () => {
    const api = makeApi();
    render(<Harness api={api} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом", "балкон", "открытое пламя");
    await (await tiles()).findByText("Служба 101");
    api.getList.mockResolvedValueOnce({
      ...TEST_LIST,
      services: [
        ...TEST_LIST.services,
        { serviceId: "svc-103", addedBy: "manual", title: "СМП (Служба 103)" },
      ],
      conditional: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить службы" }));
    const window = screen.getByRole("dialog", { name: "Добавьте службы" });
    expect(within(window).getByRole("button", { name: "Служба 101 (МЧС)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const smp = within(window).getByRole("button", { name: "СМП (Служба 103)" });
    expect(smp).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(smp);
    expect(smp).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(window).getByRole("button", { name: "Сохранить и закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith("att-1", {
        type: "serviceAdded",
        payload: { serviceId: "svc-103" },
      }),
    );
    expect(await (await tiles()).findByText("СМП")).toBeInTheDocument();
  });

  it("поиск фильтрует список; «×» закрывает окно без изменений", async () => {
    const api = makeApi();
    render(<Harness api={api} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом");
    await (await tiles()).findByText("Служба 101");
    fireEvent.click(screen.getByRole("button", { name: "Добавить службы" }));
    const window = screen.getByRole("dialog", { name: "Добавьте службы" });
    fireEvent.change(within(window).getByRole("textbox", { name: "Поиск службы" }), {
      target: { value: "смп" },
    });
    expect(within(window).queryByRole("button", { name: "Служба 101 (МЧС)" })).toBeNull();
    fireEvent.click(within(window).getByRole("button", { name: "СМП (Служба 103)" }));
    fireEvent.click(within(window).getByRole("button", { name: "Закрыть (Esc)" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.sendEvent).not.toHaveBeenCalledWith(
      "att-1",
      expect.objectContaining({ type: "serviceAdded" }),
    );
  });

  it("«⇕» разворачивает панель, «сохранить» вызывает передачу, значки без сценария неактивны", async () => {
    const onSave = vi.fn();
    render(<Harness api={makeApi()} onSave={onSave} />);
    await pickPath("жилом", "пожар в жилом доме", "жилой дом");
    await (await tiles()).findByText("Служба 101");
    fireEvent.click(screen.getByRole("button", { name: "Развернуть список служб" }));
    expect(screen.getByRole("button", { name: "Свернуть список служб" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Связи" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
