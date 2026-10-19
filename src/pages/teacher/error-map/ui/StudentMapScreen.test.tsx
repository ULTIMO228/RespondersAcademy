import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ErrorMapResponse, ErrorMapStageDetail } from "@/shared/api";

import type { StudentMapApi } from "../api/errorMapApi";
import { StudentMapScreen } from "./StudentMapScreen";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const MAP: ErrorMapResponse = {
  scope: { kind: "student", groupId: "g-1", studentId: "u-10", title: "Иванов Пётр" },
  mode: "dds",
  period: "1m",
  attempts: 5,
  stages: [
    { id: "greeting", order: 1, title: "Приветствие" },
    { id: "address", order: 2, title: "Адрес" },
    { id: "services", order: 3, title: "Службы" },
    { id: "closing", order: 4, title: "Завершение" },
  ],
  levels: [
    {
      stageId: "greeting",
      attempts: 5,
      attemptsWithError: 0,
      share: 0,
      level: "rare",
      comparison: "better",
      affectedStudents: 0,
    },
    {
      stageId: "address",
      attempts: 5,
      attemptsWithError: 3,
      share: 0.6,
      level: "often",
      comparison: "worse",
      affectedStudents: 1,
    },
    {
      stageId: "services",
      attempts: 5,
      attemptsWithError: 1,
      share: 0.2,
      level: "sometimes",
      comparison: "same",
      affectedStudents: 1,
    },
    {
      stageId: "closing",
      attempts: 1,
      attemptsWithError: 0,
      share: null,
      level: "noData",
      comparison: "better",
      affectedStudents: 0,
    },
  ],
  headline: { kind: "problems", stageIds: ["address"], text: "Чаще всего ошибается на этапе «Адрес»" },
  generatedAt: "2026-10-19T10:00:00+03:00",
};

const DETAIL: ErrorMapStageDetail = {
  stage: MAP.stages[1],
  level: MAP.levels[1],
  typicalErrors: [
    {
      ruleId: "a1",
      plainText: "Не уточнён адрес",
      severity: "major",
      studentCount: 1,
      students: [{ id: "u-10", name: "Иванов Пётр" }],
    },
  ],
  chain: [],
  explanation: null,
};

const makeApi = (overrides: Partial<StudentMapApi> = {}): StudentMapApi => ({
  groups: vi.fn().mockResolvedValue([{ groupId: "g-1", title: "Группа 1", studentCount: 4 }]),
  student: vi.fn().mockResolvedValue(MAP),
  studentStage: vi.fn().mockResolvedValue(DETAIL),
  ...overrides,
});

describe("страница «Карта ошибок обучающегося»", () => {
  beforeEach(() => {
    replace.mockClear();
    search = "";
  });

  it("запрашивает карту по режиму и периоду из query, показывает ФИО и группу", async () => {
    search = "group=g-1&period=2w&mode=operator112";
    const api = makeApi();
    render(<StudentMapScreen studentId="u-10" api={api} />);
    expect(await screen.findByText("Чаще всего ошибается на этапе «Адрес»")).toBeInTheDocument();
    expect(api.student).toHaveBeenCalledWith(
      "u-10",
      { mode: "operator112", period: "2w" },
      expect.anything(),
    );
    expect(screen.getByText("Иванов Пётр")).toBeInTheDocument();
    expect(await screen.findByText(/Группа: Группа 1/)).toBeInTheDocument();
  });

  it("сравнение с группой подписано словами; у «мало данных» сравнения нет", async () => {
    render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(screen.getByText("лучше группы")).toBeInTheDocument();
    expect(screen.getByText("хуже группы")).toBeInTheDocument();
    expect(screen.getByText("как у группы")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Этапы работы" })).getAllByText(/группы$/)).toHaveLength(
      3,
    );
    expect(screen.getByRole("button", { name: /^Завершение: мало данных/ })).not.toHaveAccessibleName(
      /группы/,
    );
  });

  it("только «Распечатать»: PDF обучающегося, показа на экране для одного обучающегося нет", async () => {
    search = "group=g-1&period=all&mode=operator112";
    render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(screen.queryByRole("link", { name: "Показать на экране" })).not.toBeInTheDocument();
    const pdf = new URL(
      screen.getByRole("link", { name: /Распечатать/ }).getAttribute("href") ?? "",
      "http://x",
    );
    expect(Object.fromEntries(pdf.searchParams)).toEqual({
      scope: "student",
      studentId: "u-10",
      mode: "operator112",
      period: "all",
    });
  });

  it("фильтр группы скрыт, период и режим меняют URL; смена режима сбрасывает этап и from", async () => {
    search = "group=g-1&period=1m&mode=dds&stage=address&from=address";
    render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
    await screen.findByRole("list", { name: "Этапы работы" });
    expect(screen.queryByLabelText("Группа")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "всё время" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/teacher/error-map/students/u-10?group=g-1&period=all&mode=dds&stage=address&from=address",
    );
    fireEvent.click(screen.getByRole("button", { name: /112/ }));
    expect(replace).toHaveBeenLastCalledWith(
      "/teacher/error-map/students/u-10?group=g-1&period=1m&mode=operator112",
    );
  });

  describe("«К карте группы»", () => {
    it("возвращает на карту группы с тем же group/period/mode и этапом из from", async () => {
      search = "group=g-1&period=2w&mode=operator112&stage=services&from=address";
      render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
      expect(screen.getByRole("link", { name: /К карте группы/ })).toHaveAttribute(
        "href",
        "/teacher/error-map?group=g-1&period=2w&mode=operator112&stage=address",
      );
      await screen.findByRole("list", { name: "Этапы работы" });
    });

    it("без from этап не передаётся", async () => {
      search = "group=g-1&period=1m&mode=dds&stage=address";
      render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
      expect(screen.getByRole("link", { name: /К карте группы/ })).toHaveAttribute(
        "href",
        "/teacher/error-map?group=g-1&period=1m&mode=dds",
      );
      await screen.findByRole("list", { name: "Этапы работы" });
    });

    it("выбор этапа обучающегося не трогает from", async () => {
      search = "group=g-1&from=address";
      render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
      await screen.findByRole("list", { name: "Этапы работы" });
      fireEvent.click(screen.getByRole("button", { name: /^Службы:/ }));
      expect(replace).toHaveBeenLastCalledWith(
        "/teacher/error-map/students/u-10?group=g-1&period=1m&mode=dds&stage=services&from=address",
      );
    });
  });

  describe("разбор этапа", () => {
    it("открывается по ?stage через getErrorMapStudentStage", async () => {
      search = "group=g-1&stage=address";
      const api = makeApi();
      render(<StudentMapScreen studentId="u-10" api={api} />);
      expect(await screen.findByRole("heading", { level: 2, name: /Адрес/ })).toBeInTheDocument();
      expect(api.studentStage).toHaveBeenCalledWith(
        "u-10",
        "address",
        { mode: "dds", period: "1m" },
        expect.anything(),
      );
      expect(screen.getByText(/Не уточнён адрес/)).toBeInTheDocument();
      const assign = screen.getByRole("link", { name: "Назначить тренировку по этому этапу" });
      expect(new URL(assign.getAttribute("href") ?? "", "http://x").searchParams.get("studentIds")).toBe(
        "u-10",
      );
    });

    it("без stage и для этапа вне схемы разбор не запрашивается", async () => {
      const api = makeApi();
      const { unmount } = render(<StudentMapScreen studentId="u-10" api={api} />);
      await screen.findByRole("list", { name: "Этапы работы" });
      unmount();
      search = "stage=unknown";
      render(<StudentMapScreen studentId="u-10" api={api} />);
      await screen.findByRole("list", { name: "Этапы работы" });
      expect(api.studentStage).not.toHaveBeenCalled();
    });

    it("«Закрыть разбор» убирает stage и сохраняет from", async () => {
      search = "group=g-1&stage=address&from=address";
      render(<StudentMapScreen studentId="u-10" api={makeApi()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Закрыть разбор" }));
      expect(replace).toHaveBeenLastCalledWith(
        "/teacher/error-map/students/u-10?group=g-1&period=1m&mode=dds&from=address",
      );
    });

    it("ошибка разбора — сообщение и повтор", async () => {
      search = "group=g-1&stage=address";
      const studentStage = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить разбор"))
        .mockResolvedValue(DETAIL);
      render(<StudentMapScreen studentId="u-10" api={makeApi({ studentStage })} />);
      expect(await screen.findByText("Не удалось построить разбор")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(await screen.findByRole("heading", { level: 2, name: /Адрес/ })).toBeInTheDocument();
    });
  });

  describe("состояния", () => {
    it("загрузка — скелетон, карта ещё не показана", () => {
      render(
        <StudentMapScreen
          studentId="u-10"
          api={makeApi({ student: vi.fn(() => new Promise<ErrorMapResponse>(() => {})) })}
        />,
      );
      expect(screen.queryByRole("list", { name: "Этапы работы" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /К карте группы/ })).toBeInTheDocument();
    });

    it("нет попыток — «Пока нет данных за этот период»", async () => {
      render(
        <StudentMapScreen
          studentId="u-10"
          api={makeApi({ student: vi.fn().mockResolvedValue({ ...MAP, attempts: 0 }) })}
        />,
      );
      expect(await screen.findByText("Пока нет данных за этот период")).toBeInTheDocument();
    });

    it("403 — понятный текст про доступ", async () => {
      const student = vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Недостаточно прав"));
      render(<StudentMapScreen studentId="u-10" api={makeApi({ student })} />);
      expect(await screen.findByText(/Нет доступа к карте этого обучающегося/)).toBeInTheDocument();
    });

    it("404 — «Обучающийся не найден»", async () => {
      const student = vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Данные не найдены"));
      render(<StudentMapScreen studentId="u-x" api={makeApi({ student })} />);
      expect(await screen.findByText("Обучающийся не найден")).toBeInTheDocument();
    });

    it("прочая ошибка — сообщение сервера и повтор", async () => {
      const student = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить карту"))
        .mockResolvedValue(MAP);
      render(<StudentMapScreen studentId="u-10" api={makeApi({ student })} />);
      expect(await screen.findByText("Не удалось построить карту")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(await screen.findByRole("list", { name: "Этапы работы" })).toBeInTheDocument();
    });

    it("без бэкенда — «требуется сервер»", async () => {
      const student = vi.fn().mockRejectedValue(new ServerRequiredError());
      render(<StudentMapScreen studentId="u-10" api={makeApi({ student })} />);
      expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Этапы работы" })).not.toBeInTheDocument();
    });

    it("список групп не загрузился — карта всё равно показана", async () => {
      const groups = vi.fn().mockRejectedValue(new ApiError(500, "internal", "сбой"));
      render(<StudentMapScreen studentId="u-10" api={makeApi({ groups })} />);
      expect(await screen.findByRole("list", { name: "Этапы работы" })).toBeInTheDocument();
      expect(screen.queryByText(/Группа:/)).not.toBeInTheDocument();
    });
  });
});
