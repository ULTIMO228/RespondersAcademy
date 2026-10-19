/*
 * Секция «Карта ошибок» на вкладке «Настройки» (спека 003, T028): клиент /api/v1 идёт через настоящий v1ApiClient,
 * подменён только fetch. Проверяются загрузка порогов в процентах, зеркальная валидация, подтверждение и PUT с долями,
 * ошибка сервера, состояние «требуется сервер» (автономный фронт, решение D2) и ошибка загрузки.
 * Доступ «только администратор» обеспечивает лэйаут раздела (AdminLayout → requireSessionUser("admin") → /forbidden).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorMapSettingsSection } from "./ErrorMapSettingsSection";

const ENDPOINT = "/api/v1/error-map/settings";
const SAVED = {
  sometimesFrom: 0.1,
  oftenFrom: 0.3,
  minAttemptsGroup: 5,
  minAttemptsStudent: 3,
  sameBandPoints: 10,
};

const LABEL = {
  sometimes: "Порог „иногда“ с",
  often: "Порог „часто“ с",
  group: "Минимум попыток у группы",
  student: "Минимум попыток у обучающегося",
  sameBand: "Зона „как у группы“, п.п.",
};

type Reply = { status?: number; body?: unknown };

/** Ответы на GET и PUT. Без `body` и с 404 Next отвечает на /api/v1 без бэкенда — клиент даёт ServerRequiredError. */
function stubFetch(replies: { get?: Reply; put?: Reply } = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname !== ENDPOINT) throw new Error(`Нет маршрута для ${url.pathname}`);
    const reply = (init?.method === "PUT" ? replies.put : replies.get) ?? { body: SAVED };
    const status = reply.status ?? 200;
    return reply.body === undefined ? new Response(null, { status }) : Response.json(reply.body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderSection() {
  render(<ErrorMapSettingsSection />);
  await screen.findByLabelText(LABEL.sometimes);
}

function sentPut(fetchMock: ReturnType<typeof stubFetch>): unknown {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function changeField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function openConfirmation() {
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  return screen.getByRole("dialog");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("загрузка порогов (T028)", () => {
  it("показывает пороги с сервера: доли — в процентах, без хвостов двоичной арифметики", async () => {
    const fetchMock = stubFetch();
    render(<ErrorMapSettingsSection />);
    expect(document.querySelector("[data-state='loading']")).not.toBeNull();
    expect(await screen.findByLabelText(LABEL.sometimes)).toHaveValue(10);
    expect(screen.getByLabelText(LABEL.often)).toHaveValue(30);
    expect(screen.getByLabelText(LABEL.group)).toHaveValue(5);
    expect(screen.getByLabelText(LABEL.student)).toHaveValue(3);
    expect(screen.getByLabelText(LABEL.sameBand)).toHaveValue(10);
    expect(new URL(String(fetchMock.mock.calls[0][0]), "http://localhost").pathname).toBe(ENDPOINT);
    expect(screen.getByText(/Значения — черновик, согласуются с экспертом по обучению/)).toBeInTheDocument();
  });
});

describe("валидация (зеркало серверной проверки)", () => {
  it("«часто» не больше «иногда»: ошибка у обоих полей, сохранение недоступно, запроса нет", async () => {
    const fetchMock = stubFetch();
    await renderSection();
    changeField(LABEL.often, "10");
    expect(screen.getByLabelText(LABEL.often)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Порог «часто» — меньше 100 % и больше порога «иногда»")).toBeInTheDocument();
    expect(screen.getByLabelText(LABEL.sometimes)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(sentPut(fetchMock)).toBeUndefined();

    changeField(LABEL.often, "40");
    expect(screen.getByLabelText(LABEL.often)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it("пустое поле и дробный минимум — ошибка, а не подстановка нуля; зона вне 0–50 — ошибка", async () => {
    stubFetch();
    await renderSection();
    changeField(LABEL.group, "");
    expect(screen.getByLabelText(LABEL.group)).toHaveAttribute("aria-invalid", "true");
    changeField(LABEL.group, "5");
    changeField(LABEL.student, "2.5");
    expect(screen.getByLabelText(LABEL.student)).toHaveAttribute("aria-invalid", "true");
    changeField(LABEL.student, "3");
    changeField(LABEL.sameBand, "");
    expect(screen.getByLabelText(LABEL.sameBand)).toHaveAttribute("aria-invalid", "true");
    changeField(LABEL.sameBand, "51");
    expect(screen.getByText("Целое число от 0 до 50 п. п.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("граница: «иногда» 0 и «часто» 100 не принимаются", async () => {
    stubFetch();
    await renderSection();
    changeField(LABEL.sometimes, "0");
    expect(screen.getByLabelText(LABEL.sometimes)).toHaveAttribute("aria-invalid", "true");
    changeField(LABEL.sometimes, "10");
    changeField(LABEL.often, "100");
    expect(screen.getByLabelText(LABEL.often)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });
});

describe("сохранение (T028)", () => {
  it("после подтверждения шлёт доли (0.4, не 40) и показывает «Сохранено»", async () => {
    const fetchMock = stubFetch();
    await renderSection();
    changeField(LABEL.often, "40");
    const dialog = openConfirmation();
    expect(within(dialog).getByText(/«часто» с 40 %/)).toBeInTheDocument();
    expect(sentPut(fetchMock)).toBeUndefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByText("Сохранено. Изменение записано в журнал аудита.")).toBeInTheDocument();
    expect(sentPut(fetchMock)).toEqual({ ...SAVED, oftenFrom: 0.4 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("отмена в подтверждении не отправляет запрос и не меняет значения", async () => {
    const fetchMock = stubFetch();
    await renderSection();
    changeField(LABEL.often, "40");
    fireEvent.click(within(openConfirmation()).getByRole("button", { name: "Отмена" }));
    expect(sentPut(fetchMock)).toBeUndefined();
    expect(screen.getByLabelText(LABEL.often)).toHaveValue(40);
  });

  it("ошибка сервера выводится под формой и не сбрасывает введённые значения", async () => {
    const message = "Настройки карты ошибок не сохранены. Пороги долей должны идти по возрастанию";
    stubFetch({ put: { status: 400, body: { error: { code: "validationFailed", message } } } });
    await renderSection();
    changeField(LABEL.often, "40");
    fireEvent.click(within(openConfirmation()).getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(LABEL.often)).toHaveValue(40);
  });
});

describe("состояния без бэкенда и при сбое", () => {
  it("автономный фронт: «требуется сервер» вместо формы; «Повторить» запрашивает снова", async () => {
    const fetchMock = stubFetch({ get: { status: 404 } });
    render(<ErrorMapSettingsSection />);
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
    expect(screen.queryByLabelText(LABEL.sometimes)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("ошибка загрузки (500) показывает причину сервера и кнопку «Повторить»", async () => {
    stubFetch({
      get: {
        status: 500,
        body: { error: { code: "internal", message: "Ошибка сервера. Повторите попытку позже" } },
      },
    });
    render(<ErrorMapSettingsSection />);
    expect(await screen.findByText("Ошибка сервера. Повторите попытку позже")).toBeInTheDocument();
    expect(screen.getByText("Не удалось загрузить пороги карты ошибок")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
