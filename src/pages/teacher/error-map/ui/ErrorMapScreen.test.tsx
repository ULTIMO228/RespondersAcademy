import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ErrorMapGroup, ErrorMapResponse, ErrorMapStageDetail } from "@/shared/api";

import type { ErrorMapApi } from "../api/errorMapApi";
import { ErrorMapScreen } from "./ErrorMapScreen";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const GROUPS: ErrorMapGroup[] = [
  { groupId: "g-1", title: "Группа 1", studentCount: 4 },
  { groupId: "g-2", title: "Группа 2", studentCount: 3 },
];

const MAP: ErrorMapResponse = {
  scope: { kind: "group", groupId: "g-1", title: "Группа 1" },
  mode: "dds",
  period: "1m",
  attempts: 12,
  stages: [
    { id: "greeting", order: 1, title: "Приветствие" },
    { id: "address", order: 2, title: "Адрес" },
  ],
  levels: [
    {
      stageId: "greeting",
      attempts: 12,
      attemptsWithError: 0,
      share: 0,
      level: "rare",
      affectedStudents: 0,
    },
    {
      stageId: "address",
      attempts: 12,
      attemptsWithError: 6,
      share: 0.5,
      level: "often",
      affectedStudents: 3,
    },
  ],
  headline: { kind: "problems", stageIds: ["address"], text: "Группа чаще всего ошибается на этапе «Адрес»" },
  generatedAt: "2026-10-19T10:00:00+03:00",
};

const DETAIL: ErrorMapStageDetail = {
  stage: { id: "address", order: 2, title: "Адрес" },
  level: MAP.levels[1],
  typicalErrors: [
    {
      ruleId: "a1",
      plainText: "Не уточнён адрес",
      severity: "major",
      studentCount: 2,
      students: [
        { id: "u-10", name: "Иванов" },
        { id: "u-11", name: "Петров" },
      ],
    },
    {
      ruleId: "a2",
      plainText: "Не назван подъезд",
      severity: "minor",
      studentCount: 2,
      students: [
        { id: "u-11", name: "Петров" },
        { id: "u-12", name: "Сидоров" },
      ],
    },
  ],
  chain: [{ from: "address", to: "greeting", caption: "Связь" }],
  explanation: null,
};

const makeApi = (overrides: Partial<ErrorMapApi> = {}): ErrorMapApi => ({
  groups: vi.fn().mockResolvedValue(GROUPS),
  map: vi.fn().mockResolvedValue(MAP),
  stage: vi.fn().mockResolvedValue(DETAIL),
  ...overrides,
});

describe("страница «Карта ошибок»", () => {
  beforeEach(() => {
    replace.mockClear();
    search = "";
  });

  it("успех: вывод над лентой этапов; без группы в URL берётся первая", async () => {
    const api = makeApi();
    render(<ErrorMapScreen api={api} />);
    expect(await screen.findByText("Группа чаще всего ошибается на этапе «Адрес»")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Этапы работы" })).toBeInTheDocument();
    expect(api.map).toHaveBeenCalledWith("g-1", { mode: "dds", period: "1m" }, expect.anything());
  });

  it("группа, режим и период берутся из query; выбранный этап помечен", async () => {
    search = "group=g-2&period=2w&mode=operator112&stage=address";
    const api = makeApi();
    render(<ErrorMapScreen api={api} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(api.map).toHaveBeenCalledWith("g-2", { mode: "operator112", period: "2w" }, expect.anything());
    expect(screen.getByRole("button", { name: /^Адрес:/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("группа из адреса используется, если в query её нет", async () => {
    const api = makeApi();
    render(<ErrorMapScreen groupId="g-2" api={api} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(api.map).toHaveBeenCalledWith("g-2", { mode: "dds", period: "1m" }, expect.anything());
  });

  it("смена периода пишет фильтры в URL через replace, плитка — этап", async () => {
    render(<ErrorMapScreen api={makeApi()} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    fireEvent.click(screen.getByRole("button", { name: "всё время" }));
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map?group=g-1&period=all&mode=dds");
    fireEvent.click(screen.getByRole("button", { name: /^Адрес:/ }));
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map?group=g-1&period=1m&mode=dds&stage=address");
  });

  it("«Показать на экране» и «Распечатать» несут группу, период и режим", async () => {
    search = "group=g-2&period=2w&mode=operator112";
    render(<ErrorMapScreen api={makeApi()} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(screen.getByRole("link", { name: "Показать на экране" })).toHaveAttribute(
      "href",
      "/teacher/error-map/g-2/present?period=2w&mode=operator112",
    );
    const pdf = new URL(
      screen.getByRole("link", { name: /Распечатать/ }).getAttribute("href") ?? "",
      "http://x",
    );
    expect(pdf.pathname.endsWith("/error-map/export.pdf")).toBe(true);
    expect(Object.fromEntries(pdf.searchParams)).toEqual({
      scope: "group",
      groupId: "g-2",
      mode: "operator112",
      period: "2w",
    });
  });

  it("нет попыток — «Пока нет данных за этот период»", async () => {
    render(<ErrorMapScreen api={makeApi({ map: vi.fn().mockResolvedValue({ ...MAP, attempts: 0 }) })} />);
    expect(await screen.findByText("Пока нет данных за этот период")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Этапы работы" })).not.toBeInTheDocument();
  });

  it("ошибка карты — сообщение и повтор", async () => {
    const map = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить карту"))
      .mockResolvedValue(MAP);
    render(<ErrorMapScreen api={makeApi({ map })} />);
    expect(await screen.findByText("Не удалось построить карту")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByRole("list", { name: "Этапы работы" })).toBeInTheDocument();
  });

  it("у преподавателя без групп — понятное сообщение", async () => {
    const api = makeApi({ groups: vi.fn().mockResolvedValue([]) });
    render(<ErrorMapScreen api={api} />);
    expect(await screen.findByText("Нет закреплённых групп")).toBeInTheDocument();
    expect(api.map).not.toHaveBeenCalled();
  });

  it("без бэкенда — состояние «требуется сервер»", async () => {
    render(
      <ErrorMapScreen api={makeApi({ groups: vi.fn().mockRejectedValue(new ServerRequiredError()) })} />,
    );
    expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Этапы работы" })).not.toBeInTheDocument();
  });

  describe("разбор этапа", () => {
    it("плитка пишет stage в URL; при stage в query под лентой загружается разбор", async () => {
      search = "group=g-1&stage=address";
      const api = makeApi();
      render(<ErrorMapScreen api={api} />);
      expect(await screen.findByRole("heading", { level: 2, name: /Адрес/ })).toBeInTheDocument();
      expect(api.stage).toHaveBeenCalledWith(
        "g-1",
        "address",
        { mode: "dds", period: "1m" },
        expect.anything(),
      );
      expect(screen.getByText("Не уточнён адрес", { exact: false })).toBeInTheDocument();
    });

    it("без stage разбор не запрашивается", async () => {
      const api = makeApi();
      render(<ErrorMapScreen api={api} />);
      await screen.findByRole("list", { name: "Этапы работы" });
      expect(api.stage).not.toHaveBeenCalled();
    });

    it("«Закрыть разбор» убирает stage из query, фильтры остаются", async () => {
      search = "group=g-1&period=2w&stage=address";
      render(<ErrorMapScreen api={makeApi()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Закрыть разбор" }));
      expect(replace).toHaveBeenLastCalledWith("/teacher/error-map?group=g-1&period=2w&mode=dds");
    });

    it("связанный этап подсвечен, переход по цепочке меняет stage", async () => {
      search = "group=g-1&stage=address";
      render(<ErrorMapScreen api={makeApi()} />);
      await screen.findByRole("heading", { level: 2, name: /Адрес/ });
      expect(screen.getByText("связан с выбранным")).toBeInTheDocument();
    });

    it("кнопка назначения: режим, название этапа и обучающиеся без дублей", async () => {
      search = "group=g-1&stage=address";
      render(<ErrorMapScreen api={makeApi()} />);
      const link = await screen.findByRole("link", { name: "Назначить тренировку по этому этапу" });
      const url = new URL(link.getAttribute("href") ?? "", "http://x");
      expect(url.pathname).toBe("/teacher/assignments/new");
      const params = url.searchParams;
      expect(params.get("mode")).toBe("dds");
      expect(params.get("title")).toBe("Тренировка: Адрес");
      expect(params.get("focusStage")).toBe("Адрес");
      expect(params.get("studentIds")).toBe("u-10,u-11,u-12");
    });

    it("имена обучающихся — ссылки на их карты с group/period/mode/stage/from", async () => {
      search = "group=g-1&period=2w&stage=address";
      render(<ErrorMapScreen api={makeApi()} />);
      const link = await screen.findByRole("link", { name: "Иванов" });
      expect(link).toHaveAttribute(
        "href",
        "/teacher/error-map/students/u-10?group=g-1&period=2w&mode=dds&stage=address&from=address",
      );
    });

    it("ошибка разбора — сообщение и повтор", async () => {
      search = "group=g-1&stage=address";
      const stage = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить разбор"))
        .mockResolvedValue(DETAIL);
      render(<ErrorMapScreen api={makeApi({ stage })} />);
      expect(await screen.findByText("Не удалось построить разбор")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(await screen.findByRole("heading", { level: 2, name: /Адрес/ })).toBeInTheDocument();
      expect(stage).toHaveBeenCalledTimes(2);
    });

    it("нет типовых ошибок — «По этому этапу типовых ошибок за период нет»", async () => {
      search = "group=g-1&stage=address";
      const stage = vi.fn().mockResolvedValue({ ...DETAIL, typicalErrors: [], chain: [] });
      render(<ErrorMapScreen api={makeApi({ stage })} />);
      expect(await screen.findByText("По этому этапу типовых ошибок за период нет")).toBeInTheDocument();
    });

    it("смена режима очищает stage, смена периода его сохраняет", async () => {
      search = "group=g-1&stage=address";
      render(<ErrorMapScreen api={makeApi()} />);
      await screen.findByRole("heading", { level: 2, name: /Адрес/ });
      fireEvent.click(screen.getByRole("button", { name: "всё время" }));
      expect(replace).toHaveBeenLastCalledWith(
        "/teacher/error-map?group=g-1&period=all&mode=dds&stage=address",
      );
      fireEvent.click(screen.getByRole("button", { name: /112/ }));
      expect(replace).toHaveBeenLastCalledWith("/teacher/error-map?group=g-1&period=1m&mode=operator112");
    });

    it("этап вне схемы карты не запрашивается (нет 404 на чужом режиме)", async () => {
      search = "group=g-1&stage=unknown";
      const api = makeApi();
      render(<ErrorMapScreen api={api} />);
      await screen.findByRole("list", { name: "Этапы работы" });
      expect(api.stage).not.toHaveBeenCalled();
    });

    it("без бэкенда разбор показывает «требуется сервер»", async () => {
      search = "group=g-1&stage=address";
      const stage = vi.fn().mockRejectedValue(new ServerRequiredError());
      render(<ErrorMapScreen api={makeApi({ stage })} />);
      expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
    });
  });
});
