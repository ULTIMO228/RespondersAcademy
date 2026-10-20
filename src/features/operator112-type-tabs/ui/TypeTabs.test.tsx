import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TEST_ENTRIES } from "../model/fixtures";
import { useTypeTabs } from "../model/useTypeTabs";
import type { FirstTabValue, TypeTabsApi } from "../model/useTypeTabs";
import { TypeTabs } from "./TypeTabs";

function makeApi() {
  return {
    sendEvent: vi.fn().mockResolvedValue({ id: "ev", type: "signSelected", at: "t", payload: {} }),
  } satisfies TypeTabsApi;
}

function Harness({
  api,
  initialSigns,
  onFirstTabChange,
  onIncidents,
}: {
  api: TypeTabsApi;
  initialSigns?: string[];
  onFirstTabChange?: (value: FirstTabValue) => void;
  onIncidents?: (incidents: ReturnType<typeof useTypeTabs>["incidents"]) => void;
}) {
  const state = useTypeTabs({
    attemptId: "att-1",
    entries: TEST_ENTRIES,
    api,
    initialSigns,
    onFirstTabChange,
  });
  onIncidents?.(state.incidents);
  return <TypeTabs state={state} entries={TEST_ENTRIES} />;
}

async function addType(query: string, group: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  fireEvent.mouseDown(await screen.findByRole("button", { name: group }));
}

describe("TypeTabs: тип происшествия и вкладки", () => {
  it("до выбора — подпись, быстрые типы и «Значимые типы происшествий:»; тип без группы неактивен", () => {
    render(<Harness api={makeApi()} />);
    expect(screen.getByRole("combobox", { name: "Введите тип происшествия" })).toHaveAttribute(
      "placeholder",
      "что случилось?",
    );
    expect(screen.getByText("Значимые типы происшествий:")).toBeInTheDocument();
    for (const label of ["ДТП", "104", "Человек в опасности", "Консультация"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Служебные типы без группы в классификаторе не показываются (нет серых неактивных кнопок).
    for (const label of ["Ошибочно набран номер", "Тестовый вызов", "Справка-101"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("выбор типа: вкладка, поле «добавить тип происшествия», событие typeAdded; быстрые типы исчезают", async () => {
    const api = makeApi();
    render(<Harness api={api} />);
    await addType("пожар", "пожар в жилом доме");
    expect(screen.getByRole("tab", { name: /пожар в жилом доме/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "добавить тип происшествия" })).toBeInTheDocument();
    expect(screen.queryByText("Значимые типы происшествий:")).toBeNull();
    expect(api.sendEvent).toHaveBeenCalledWith("att-1", {
      type: "typeAdded",
      payload: { finalType: "пожар в жилом доме", classifierCode: "" },
    });
  });

  it("первая вкладка: чип синий, повторный клик снимает; шлёт signSelected и сообщает о смене", async () => {
    const api = makeApi();
    const onFirst = vi.fn();
    render(<Harness api={api} onFirstTabChange={onFirst} />);
    await addType("пожар", "пожар в жилом доме");
    fireEvent.click(await screen.findByRole("button", { name: "жилой дом" }));
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith("att-1", {
        type: "signSelected",
        payload: { signs: ["жилой дом"], tabs: [{ group: "пожар в жилом доме", signs: ["жилой дом"] }] },
      }),
    );
    await waitFor(() =>
      expect(onFirst).toHaveBeenCalledWith(expect.objectContaining({ signs: ["жилой дом"] })),
    );
    fireEvent.click(screen.getByRole("button", { name: "жилой дом" }));
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenLastCalledWith("att-1", {
        type: "signSelected",
        payload: { signs: [], tabs: [{ group: "пожар в жилом доме", signs: [] }] },
      }),
    );
  });

  it("вторая вкладка имеет свой выбор и шлёт signSelected со всеми вкладками; incidents — по порядку вкладок", async () => {
    const api = makeApi();
    const onIncidents = vi.fn();
    render(<Harness api={api} onIncidents={onIncidents} />);
    await addType("пожар", "пожар в жилом доме");
    fireEvent.click(await screen.findByRole("button", { name: "жилой дом" }));
    await addType("улице", "пожар на улице");
    expect(screen.getByRole("tab", { name: /пожар на улице/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "жилой дом", pressed: true })).toBeNull();
    api.sendEvent.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "на улице" }));
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith("att-1", {
        type: "signSelected",
        payload: {
          signs: ["жилой дом"],
          tabs: [
            { group: "пожар в жилом доме", signs: ["жилой дом"] },
            { group: "пожар на улице", signs: ["на улице"] },
          ],
        },
      }),
    );
    const incidents = onIncidents.mock.lastCall![0];
    expect(incidents).toHaveLength(2);
    expect(incidents[0].signs).toEqual(["жилой дом"]);
    expect(incidents[1].signs).toEqual(["на улице"]);
    fireEvent.click(screen.getByRole("tab", { name: /пожар в жилом доме/ }));
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "true");
  });

  it("«×» удаляет вкладку и шлёт typeRemoved {index}; удаление первой пересчитывает по следующей", async () => {
    const api = makeApi();
    const onFirst = vi.fn();
    render(<Harness api={api} onFirstTabChange={onFirst} />);
    await addType("пожар", "пожар в жилом доме");
    await addType("улице", "пожар на улице");
    fireEvent.click(screen.getByRole("button", { name: "Удалить тип «пожар в жилом доме»" }));
    expect(screen.queryByRole("tab", { name: /пожар в жилом доме/ })).toBeNull();
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith("att-1", { type: "typeRemoved", payload: { index: 0 } }),
    );
    await waitFor(() => expect(onFirst).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Удалить тип «пожар на улице»" }));
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Значимые типы происшествий:")).toBeInTheDocument();
  });

  it("ошибка записи события показывается, не прячется", async () => {
    const api = makeApi();
    api.sendEvent.mockRejectedValue(new Error("Сервер недоступен"));
    render(<Harness api={api} />);
    await addType("пожар", "пожар в жилом доме");
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер недоступен");
  });
});
