import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ApiError, ServerRequiredError } from "@/shared/api";
import type { AiHealth, AiSettings, PublicUser } from "@/shared/api";

import type { AccountAiApi } from "../api/accountAiApi";
import { AccountAiPage } from "./AccountAiPage";
import { AccountNav } from "./AccountNav";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, push: vi.fn() }) }));

const user = (role: PublicUser["role"]) =>
  ({ id: "u1", login: "adm", fullName: "Админ", role, armNumber: 1, isActive: true }) as PublicUser;

const SETTINGS: AiSettings = {
  source: "local",
  cloud: {
    model: "qwen/qwen3.8-27b",
    route: "cerebras/fp16",
    keyConfigured: true,
    keyLast4: "abcd",
    available: true,
  },
  fromEnv: false,
  cloudFunctions: ["генерация сценариев", "пояснение карты ошибок"],
  updatedAt: "2026-10-20T10:00:00+03:00",
  updatedBy: "adm",
};

const HEALTH: AiHealth = {
  state: "ok",
  activeSource: "local",
  servedBy: "local",
  lastOkAt: "2026-10-20T10:05:00+03:00",
  lastErrorAt: null,
  reason: null,
  errorsToday: 2,
  callsToday: 40,
  dailyLimit: 500,
};

function makeApi(over: Partial<AccountAiApi> = {}): AccountAiApi {
  return {
    settings: vi.fn().mockResolvedValue(SETTINGS),
    save: vi.fn().mockResolvedValue({ ...SETTINGS, source: "cloud" }),
    test: vi.fn().mockResolvedValue({ ok: true, latencyMs: 420, route: "cerebras/fp16" }),
    health: vi.fn().mockResolvedValue(HEALTH),
    ...over,
  };
}

function renderPage(api: AccountAiApi, role: PublicUser["role"] = "admin") {
  return render(
    <SessionProvider user={user(role)}>
      <AccountAiPage api={api} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  replaceMock.mockReset();
});

describe("Модель ИИ: загрузка и состояния", () => {
  it("пока грузится — скелетон, затем форма с текущим источником", async () => {
    renderPage(makeApi());
    expect(screen.getAllByRole("status", { name: "Загрузка…" }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("radio", { name: /Локальная модель/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Облачная модель/ })).not.toBeChecked();
  });

  it("ошибка загрузки настройки — ErrorState с «Повторить»", async () => {
    const settings = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "internal", "Сбой"))
      .mockResolvedValue(SETTINGS);
    renderPage(makeApi({ settings }));
    expect(await screen.findByText("Сбой")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Повторить" })[0]);
    expect(await screen.findByRole("radio", { name: /Локальная модель/ })).toBeInTheDocument();
  });

  it("без бэкенда — состояние «требуется сервер»", async () => {
    renderPage(
      makeApi({
        settings: vi.fn().mockRejectedValue(new ServerRequiredError()),
        health: vi.fn().mockRejectedValue(new ServerRequiredError()),
      }),
    );
    expect(await screen.findAllByText(/требует подключения к серверу/i)).not.toHaveLength(0);
  });

  it("не-админ уходит на /forbidden и настройку не запрашивает", () => {
    const api = makeApi();
    renderPage(api, "teacher");
    expect(replaceMock).toHaveBeenCalledWith("/forbidden");
    expect(api.settings).not.toHaveBeenCalled();
  });
});

describe("Модель ИИ: источник и ключ", () => {
  it("поле ключа пустое, «ключ задан …abcd» показано, тип password", async () => {
    renderPage(makeApi());
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    const input = screen.getByLabelText("Ключ Polza.ai");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByText(/ключ задан …abcd/i)).toBeInTheDocument();
  });

  it("облако недоступно (cloud.available=false): пояснение и выбор заблокирован", async () => {
    const unavailable = { ...SETTINGS, cloud: { ...SETTINGS.cloud, available: false } };
    renderPage(makeApi({ settings: vi.fn().mockResolvedValue(unavailable) }));
    const cloud = await screen.findByRole("radio", { name: /Облачная модель/ });
    expect(cloud).toBeDisabled();
    expect(screen.getByText(/облачная модель ещё не подтверждена/i)).toBeInTheDocument();
  });

  it("сохраняет выбранный источник и новый ключ, затем очищает поле ключа", async () => {
    const api = makeApi();
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.change(screen.getByLabelText("Ключ Polza.ai"), { target: { value: "  sk-new-wxyz " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ source: "cloud", apiKey: "sk-new-wxyz" }));
    expect(await screen.findByText("Настройка сохранена")).toBeInTheDocument();
    expect(screen.getByLabelText("Ключ Polza.ai")).toHaveValue("");
    expect(screen.queryByText(/sk-new/)).not.toBeInTheDocument();
  });

  it("сохранение без нового ключа при уже заданном — apiKey не отправляется", async () => {
    const api = makeApi();
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ source: "cloud" }));
  });

  it("облако без сохранённого и без введённого ключа — ошибка поля, запрос не уходит", async () => {
    const noKey = { ...SETTINGS, cloud: { ...SETTINGS.cloud, keyConfigured: false, keyLast4: null } };
    const api = makeApi({ settings: vi.fn().mockResolvedValue(noKey) });
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Введите ключ Polza.ai")).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("ошибка сохранения показывается, ключ остаётся для повторной попытки", async () => {
    const api = makeApi({
      save: vi.fn().mockRejectedValue(new ApiError(400, "validationFailed", "Ключ пуст")),
    });
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.change(screen.getByLabelText("Ключ Polza.ai"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Ключ пуст")).toBeInTheDocument();
    expect(screen.getByLabelText("Ключ Polza.ai")).toHaveValue("abc");
  });

  it("удаление ключа отправляет clearKey", async () => {
    const api = makeApi({
      save: vi.fn().mockResolvedValue({
        ...SETTINGS,
        cloud: { ...SETTINGS.cloud, keyConfigured: false, keyLast4: null },
      }),
    });
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить ключ" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ source: "cloud", clearKey: true }));
    expect(await screen.findByText("Ключ удалён")).toBeInTheDocument();
  });
});

describe("Модель ИИ: проверка подключения", () => {
  it("успех: маршрут и задержка", async () => {
    const api = makeApi();
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.change(screen.getByLabelText("Ключ Polza.ai"), { target: { value: "sk-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить подключение" }));
    expect(
      await screen.findByText(/Подключение работает: маршрут cerebras\/fp16, 420 мс/),
    ).toBeInTheDocument();
    expect(api.test).toHaveBeenCalledWith({ source: "cloud", apiKey: "sk-1" });
  });

  it("неудача: причина по-русски и предупреждение, «Сохранить» не заблокирована", async () => {
    const api = makeApi({
      test: vi.fn().mockResolvedValue({ ok: false, latencyMs: 90, route: null, reason: "invalid_key" }),
    });
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить подключение" }));
    expect(await screen.findByText(/Ключ не принят провайдером/)).toBeInTheDocument();
    expect(screen.getByText(/запасной путь/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it.each([
    ["insufficient_funds", /Недостаточно средств/],
    ["rate_limited", /лимит запросов в минуту/],
    ["daily_limit", /суточный лимит/],
    ["timeout", /не ответил вовремя/],
    ["network", /Нет сетевого соединения/],
    ["wrong_route", /маршрут/],
    ["bad_response", /непонятный ответ/],
    ["local_down", /Локальная модель недоступна/],
  ] as const)("причина %s", async (reason, pattern) => {
    const api = makeApi({
      test: vi.fn().mockResolvedValue({ ok: false, latencyMs: 1, route: null, reason }),
    });
    renderPage(api);
    fireEvent.click(await screen.findByRole("radio", { name: /Облачная модель/ }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить подключение" }));
    expect(await screen.findByText(pattern)).toBeInTheDocument();
  });

  it("сбой самого запроса проверки показывает сообщение ошибки", async () => {
    const api = makeApi({
      test: vi.fn().mockRejectedValue(new ApiError(0, "networkError", "Нет соединения с сервером")),
    });
    renderPage(api);
    fireEvent.click(await screen.findByRole("button", { name: "Проверить подключение" }));
    expect(await screen.findByText("Нет соединения с сервером")).toBeInTheDocument();
  });
});

describe("Модель ИИ: блок «Состояние»", () => {
  it("активный источник, модель, маршрут, расход лимита и ошибки за сутки", async () => {
    renderPage(makeApi());
    const block = await screen.findByRole("region", { name: "Состояние" });
    await waitFor(() => expect(block).toHaveTextContent("Ошибок за сутки"));
    expect(block).toHaveTextContent("Локальная модель");
    expect(block).toHaveTextContent("40 из 500");
    expect(block).toHaveTextContent("2");
    expect(block).toHaveTextContent("Последний успех");
  });

  it("облако активно: модель и маршрут облака", async () => {
    const health = vi.fn().mockResolvedValue({ ...HEALTH, activeSource: "cloud", servedBy: "cloud" });
    renderPage(makeApi({ health, settings: vi.fn().mockResolvedValue({ ...SETTINGS, source: "cloud" }) }));
    const block = await screen.findByRole("region", { name: "Состояние" });
    await waitFor(() => expect(block).toHaveTextContent("qwen/qwen3.8-27b"));
    expect(block).toHaveTextContent("cerebras/fp16");
  });

  it("ошибка состояния не роняет форму", async () => {
    renderPage(makeApi({ health: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Нет данных")) }));
    expect(await screen.findByText("Нет данных")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Локальная модель/ })).toBeInTheDocument();
  });

  it("нет вызовов — пустое состояние расхода", async () => {
    const health = vi
      .fn()
      .mockResolvedValue({ ...HEALTH, callsToday: 0, errorsToday: 0, lastOkAt: null, dailyLimit: null });
    renderPage(makeApi({ health }));
    const block = await screen.findByRole("region", { name: "Состояние" });
    await waitFor(() => expect(block).toHaveTextContent("ещё не было"));
  });
});

describe("Пункт «Модель ИИ» в навигации профиля", () => {
  it("виден администратору со ссылкой на /account/ai", () => {
    render(
      <SessionProvider user={user("admin")}>
        <AccountNav active="profile" />
      </SessionProvider>,
    );
    expect(screen.getByRole("link", { name: "Модель ИИ" })).toHaveAttribute("href", "/account/ai");
  });

  it.each(["teacher", "student"] as const)("скрыт у роли %s", (role) => {
    render(
      <SessionProvider user={user(role)}>
        <AccountNav active="profile" />
      </SessionProvider>,
    );
    expect(screen.queryByRole("link", { name: "Модель ИИ" })).not.toBeInTheDocument();
  });
});
