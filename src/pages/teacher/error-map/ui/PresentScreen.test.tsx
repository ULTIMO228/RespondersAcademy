import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ErrorMapResponse, ErrorMapStageDetail } from "@/shared/api";

import type { ErrorMapApi } from "../api/errorMapApi";
import { PresentScreen } from "./PresentScreen";

const replace = vi.fn();
const push = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(search),
}));

const MAP: ErrorMapResponse = {
  scope: { kind: "group", groupId: "g-1", title: "g-1" },
  mode: "dds",
  period: "1m",
  attempts: 10,
  stages: [
    { id: "address", order: 1, title: "Адрес" },
    { id: "services", order: 2, title: "Службы" },
    { id: "closing", order: 3, title: "Завершение" },
  ],
  levels: [
    {
      stageId: "address",
      attempts: 10,
      attemptsWithError: 6,
      share: 0.6,
      level: "often",
      affectedStudents: 4,
    },
    {
      stageId: "services",
      attempts: 10,
      attemptsWithError: 5,
      share: 0.5,
      level: "often",
      affectedStudents: 3,
    },
    { stageId: "closing", attempts: 10, attemptsWithError: 0, share: 0, level: "rare", affectedStudents: 0 },
  ],
  headline: {
    kind: "problems",
    stageIds: ["address", "services"],
    text: "Главные проблемы группы: Адрес и Службы",
  },
  generatedAt: "2026-10-19T10:00:00+03:00",
};

function detail(stageId: string, title: string, plain: string): ErrorMapStageDetail {
  return {
    stage: { id: stageId, order: 1, title },
    level: MAP.levels.find((item) => item.stageId === stageId)!,
    typicalErrors: [
      {
        ruleId: "r1",
        plainText: plain,
        severity: "major",
        studentCount: 2,
        students: [{ id: "u-1", name: "Иванов Пётр" }],
      },
    ],
    chain: [],
    explanation: null,
  };
}

const makeApi = (overrides: Partial<ErrorMapApi> = {}): ErrorMapApi => ({
  groups: vi.fn().mockResolvedValue([]),
  map: vi.fn().mockResolvedValue(MAP),
  stage: vi.fn((_group: string, stageId: string) =>
    Promise.resolve(
      stageId === "address"
        ? detail("address", "Адрес", "Адрес не совпадает с билетом")
        : detail("services", "Службы", "Не вызвана нужная служба"),
    ),
  ),
  ...overrides,
});

describe("страница «Показ карты ошибок»", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    search = "";
  });

  it("шаг 1: вывод и лента этапов; разбор этапа не запрашивается", async () => {
    const api = makeApi();
    render(<PresentScreen groupId="g-1" api={api} />);
    expect(
      await screen.findByRole("heading", { name: "Главные проблемы группы: Адрес и Службы" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Шаг 1 из 3")).toBeInTheDocument();
    expect(api.map).toHaveBeenCalledWith("g-1", { mode: "dds", period: "1m" }, expect.anything());
    expect(api.stage).not.toHaveBeenCalled();
  });

  it("фильтры берутся из query и уходят в запрос карты", async () => {
    search = "period=2w&mode=operator112";
    const api = makeApi();
    render(<PresentScreen groupId="g-1" api={api} />);
    await screen.findByText("Шаг 1 из 3");
    expect(api.map).toHaveBeenCalledWith("g-1", { mode: "operator112", period: "2w" }, expect.anything());
  });

  it("шаг 2: разбор первого проблемного этапа", async () => {
    search = "period=1m&mode=dds&step=2";
    const api = makeApi();
    render(<PresentScreen groupId="g-1" api={api} />);
    expect(await screen.findByText("Адрес не совпадает с билетом")).toBeInTheDocument();
    expect(screen.getByText("Шаг 2 из 3")).toBeInTheDocument();
    expect(api.stage).toHaveBeenCalledWith(
      "g-1",
      "address",
      { mode: "dds", period: "1m" },
      expect.anything(),
    );
  });

  it("шаг 3: разбор второго проблемного этапа, кнопки «Дальше» уже нет", async () => {
    search = "step=3";
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    expect(await screen.findByText("Не вызвана нужная служба")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Дальше/ })).not.toBeInTheDocument();
  });

  it("«Дальше» и «Назад» меняют шаг в адресе, фильтры и вид сохраняются", async () => {
    search = "period=2w&mode=dds&step=2&view=journal";
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    await screen.findByText("Адрес не совпадает с билетом");
    fireEvent.click(screen.getByRole("button", { name: /Дальше/ }));
    expect(replace).toHaveBeenLastCalledWith(
      "/teacher/error-map/g-1/present?period=2w&mode=dds&step=3&view=journal",
    );
    fireEvent.click(screen.getByRole("button", { name: /Назад/ }));
    expect(replace).toHaveBeenLastCalledWith(
      "/teacher/error-map/g-1/present?period=2w&mode=dds&step=1&view=journal",
    );
  });

  it("с клавиатуры стрелка вправо переходит на следующий шаг", async () => {
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    await screen.findByText("Шаг 1 из 3");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map/g-1/present?period=1m&mode=dds&step=2");
  });

  it("выход возвращает на карту группы с теми же фильтрами", async () => {
    search = "period=2w&mode=operator112&step=2";
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    await screen.findByText("Шаг 2 из 3");
    fireEvent.click(screen.getByRole("button", { name: "Выйти из показа" }));
    expect(push).toHaveBeenLastCalledWith("/teacher/error-map?group=g-1&period=2w&mode=operator112");
  });

  it("выход из показа, открытого из журнала, возвращает в журнал", async () => {
    search = "period=2w&mode=dds&view=journal";
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    await screen.findByText("Шаг 1 из 3");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenLastCalledWith("/teacher/error-map/g-1/journal?period=2w&mode=dds");
  });

  it("шаг за границей и мусор заменяются допустимым", async () => {
    search = "step=99";
    const { unmount } = render(<PresentScreen groupId="g-1" api={makeApi()} />);
    expect(await screen.findByText("Шаг 3 из 3")).toBeInTheDocument();
    unmount();
    search = "step=abc";
    render(<PresentScreen groupId="g-1" api={makeApi()} />);
    expect(await screen.findByText("Шаг 1 из 3")).toBeInTheDocument();
  });

  it("нет проблемных этапов — один шаг с выводом", async () => {
    const clean = {
      ...MAP,
      headline: { kind: "clean", stageIds: [], text: "Критичных проблем нет" },
    } as ErrorMapResponse;
    render(<PresentScreen groupId="g-1" api={makeApi({ map: vi.fn().mockResolvedValue(clean) })} />);
    expect(await screen.findByRole("heading", { name: "Критичных проблем нет" })).toBeInTheDocument();
    expect(screen.getByText("Шаг 1 из 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Дальше/ })).not.toBeInTheDocument();
  });

  describe("состояния", () => {
    it("загрузка — показа ещё нет", () => {
      render(
        <PresentScreen
          groupId="g-1"
          api={makeApi({ map: vi.fn(() => new Promise<ErrorMapResponse>(() => {})) })}
        />,
      );
      expect(screen.queryByText(/Шаг 1/)).not.toBeInTheDocument();
    });

    it("нет попыток — понятное сообщение и выход на карту", async () => {
      render(
        <PresentScreen
          groupId="g-1"
          api={makeApi({ map: vi.fn().mockResolvedValue({ ...MAP, attempts: 0 }) })}
        />,
      );
      expect(await screen.findByText("Пока нет данных за этот период")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Выйти из показа" })).toHaveAttribute(
        "href",
        "/teacher/error-map?group=g-1&period=1m&mode=dds",
      );
    });

    it("403 и 404 — понятный текст", async () => {
      const denied = vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Недостаточно прав"));
      const { unmount } = render(<PresentScreen groupId="g-9" api={makeApi({ map: denied })} />);
      expect(await screen.findByText(/Нет доступа к карте этой группы/)).toBeInTheDocument();
      unmount();
      const missing = vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Данные не найдены"));
      render(<PresentScreen groupId="g-x" api={makeApi({ map: missing })} />);
      expect(await screen.findByText("Группа не найдена")).toBeInTheDocument();
    });

    it("без бэкенда — «требуется сервер»", async () => {
      const map = vi.fn().mockRejectedValue(new ServerRequiredError());
      render(<PresentScreen groupId="g-1" api={makeApi({ map })} />);
      expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
      expect(screen.queryByText(/Шаг 1/)).not.toBeInTheDocument();
    });

    it("ошибка разбора этапа — сообщение и повтор внутри шага, рамка показа остаётся", async () => {
      search = "step=2";
      const stage = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить разбор"))
        .mockResolvedValue(detail("address", "Адрес", "Адрес не совпадает с билетом"));
      render(<PresentScreen groupId="g-1" api={makeApi({ stage })} />);
      expect(await screen.findByText("Не удалось построить разбор")).toBeInTheDocument();
      expect(screen.getByText("Шаг 2 из 3")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(await screen.findByText("Адрес не совпадает с билетом")).toBeInTheDocument();
    });
  });
});
