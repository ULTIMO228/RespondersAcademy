import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotificationListResponse } from "@/shared/api";

import { TEST_ENTRIES, TEST_LIST } from "../model/fixtures";
import type { QuestionnaireApi } from "../model/useQuestionnaire";
import { Operator112Questionnaire } from "./Operator112Questionnaire";

function makeApi(list: NotificationListResponse = TEST_LIST): QuestionnaireApi & {
  sendEvent: ReturnType<typeof vi.fn>;
  getList: ReturnType<typeof vi.fn>;
} {
  return {
    sendEvent: vi.fn().mockResolvedValue({ id: "ev-1", type: "signSelected", at: "t", payload: {} }),
    getList: vi.fn().mockResolvedValue(list),
  };
}

async function pickPath(group: string, ...signs: string[]) {
  fireEvent.change(screen.getByLabelText("Происшествие"), { target: { value: group } });
  for (const sign of signs) fireEvent.click(await screen.findByRole("button", { name: sign }));
}

describe("Operator112Questionnaire: выбор признаков и пересчёт оповещения", () => {
  it("каждый выбор шлёт signSelected с полным списком признаков и запрашивает список оповещения", async () => {
    const api = makeApi();
    const onChange = vi.fn();
    render(
      <Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} onChange={onChange} />,
    );
    await pickPath("пожар в жилом доме", "жилой дом", "балкон", "открытое пламя");
    await waitFor(() => expect(api.getList).toHaveBeenCalled());
    const sent = api.sendEvent.mock.calls.map(([, event]) => event.payload.signs);
    expect(sent).toEqual([
      [],
      ["жилой дом"],
      ["жилой дом", "балкон"],
      ["жилой дом", "балкон", "открытое пламя"],
    ]);
    expect(api.sendEvent.mock.calls[3][0]).toBe("att-1");
    expect(await screen.findByText("Служба 101 (МЧС)")).toBeInTheDocument();
    expect(screen.getByText("условие: признак НД не выбран")).toBeInTheDocument();
    const last = onChange.mock.calls.at(-1)!;
    expect(last[0]).toMatchObject({
      classifierCode: "1050201",
      finalType: "пожар: балкон",
      signs: ["жилой дом", "балкон", "открытое пламя"],
    });
    expect(last[1]).toEqual(TEST_LIST);
  });

  it("итоговый тип показывается только при однозначном выборе", async () => {
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={makeApi()} />);
    await pickPath("пожар в жилом доме", "жилой дом", "балкон");
    expect(screen.getByText("не определён")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "дым" }));
    expect(await screen.findByText("пожар: балкон (дым)")).toBeInTheDocument();
  });

  it("условная служба добавляется вручную: событие serviceAdded и пересчёт списка", async () => {
    const api = makeApi();
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} />);
    await pickPath("пожар в жилом доме", "жилой дом", "балкон", "открытое пламя");
    const withManual: NotificationListResponse = {
      ...TEST_LIST,
      services: [
        ...TEST_LIST.services,
        { serviceId: "svc-103", addedBy: "manual", title: "СМП (Служба 103)" },
      ],
      conditional: [],
    };
    api.getList.mockResolvedValueOnce(withManual);
    fireEvent.click(await screen.findByRole("button", { name: "Добавить службу СМП (Служба 103)" }));
    await waitFor(() =>
      expect(api.sendEvent).toHaveBeenCalledWith("att-1", {
        type: "serviceAdded",
        payload: { serviceId: "svc-103" },
      }),
    );
    expect(await screen.findByText("вручную")).toBeInTheDocument();
    expect(screen.queryByText("Условные службы — добавить вручную")).toBeNull();
  });

  it("добавленная вручную служба исчезает из условных, даже если сервер продолжает её отдавать", async () => {
    const api = makeApi();
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} />);
    await pickPath("пожар в жилом доме", "жилой дом", "балкон", "открытое пламя");
    api.getList.mockResolvedValueOnce({
      ...TEST_LIST,
      services: [
        ...TEST_LIST.services,
        { serviceId: "svc-103", addedBy: "manual", title: "СМП (Служба 103)", mode: "manual" },
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Добавить службу СМП (Служба 103)" }));
    expect(await screen.findByText("вручную")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить службу СМП (Служба 103)" })).toBeNull();
  });

  it("сеть упала на пересчёте: сообщение и «Повторить» без потери выбранных признаков", async () => {
    const api = makeApi();
    api.getList.mockRejectedValueOnce(new Error("Нет соединения с сервером"));
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} />);
    await pickPath("пожар в жилом доме", "жилой дом");
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет соединения с сервером");
    expect(screen.getByRole("button", { name: "жилой дом" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Служба 101 (МЧС)")).toBeInTheDocument();
  });

  it("409 сервера на событии: сообщение сервера, выбор остаётся, список не запрашивается", async () => {
    const api = makeApi();
    api.sendEvent.mockRejectedValue(new Error("Карточка уже отправлена"));
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} />);
    await pickPath("пожар в жилом доме", "жилой дом");
    expect(await screen.findByRole("alert")).toHaveTextContent("Карточка уже отправлена");
    expect(api.getList).not.toHaveBeenCalled();
  });

  it("снятие последнего признака очищает список оповещения", async () => {
    const api = makeApi();
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} />);
    await pickPath("пожар в жилом доме", "жилой дом");
    await screen.findByText("Служба 101 (МЧС)");
    fireEvent.click(screen.getByRole("button", { name: "жилой дом" }));
    expect(await screen.findByText(/Выберите признаки/)).toBeInTheDocument();
  });

  it("после перезагрузки выбор восстанавливается из событий и список запрашивается один раз", async () => {
    const api = makeApi();
    render(
      <Operator112Questionnaire
        attemptId="att-1"
        entries={TEST_ENTRIES}
        api={api}
        initialSigns={["на улице", "мусор"]}
      />,
    );
    await screen.findByText("Служба 101 (МЧС)");
    expect(screen.getByLabelText("Происшествие")).toHaveValue("пожар на улице");
    expect(api.getList).toHaveBeenCalledTimes(1);
    expect(api.sendEvent).not.toHaveBeenCalled();
  });

  it("disabled (вызов не принят): выбор недоступен, запросов нет", () => {
    const api = makeApi();
    render(<Operator112Questionnaire attemptId="att-1" entries={TEST_ENTRIES} api={api} disabled />);
    expect(screen.getByLabelText("Происшествие")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Происшествие"), { target: { value: "ДТП" } });
    expect(api.sendEvent).not.toHaveBeenCalled();
  });
});
