import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ErrorMapJournalResponse } from "@/shared/api";

import type { JournalApi } from "../api/errorMapApi";
import { JournalScreen } from "./JournalScreen";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const JOURNAL: ErrorMapJournalResponse = {
  mode: "dds",
  period: "1m",
  groupId: "g-1",
  stages: [
    { id: "address", order: 1, title: "Адрес" },
    { id: "services", order: 2, title: "Службы" },
  ],
  rows: [
    {
      studentId: "u-10",
      name: "Иванов Пётр",
      attempts: 5,
      levels: [
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
          attemptsWithError: 0,
          share: 0,
          level: "rare",
          comparison: "better",
          affectedStudents: 0,
        },
      ],
    },
    {
      studentId: "u-11",
      name: "Петрова Анна",
      attempts: 1,
      levels: [
        {
          stageId: "address",
          attempts: 1,
          attemptsWithError: 0,
          share: null,
          level: "noData",
          affectedStudents: 0,
        },
        {
          stageId: "services",
          attempts: 1,
          attemptsWithError: 0,
          share: null,
          level: "noData",
          affectedStudents: 0,
        },
      ],
    },
  ],
};

const GROUPS = [
  { groupId: "g-1", title: "Группа 1", studentCount: 2 },
  { groupId: "g-2", title: "Группа 2", studentCount: 3 },
];

const makeApi = (overrides: Partial<JournalApi> = {}): JournalApi => ({
  groups: vi.fn().mockResolvedValue(GROUPS),
  journal: vi.fn().mockResolvedValue(JOURNAL),
  ...overrides,
});

describe("страница «Журнал группы»", () => {
  beforeEach(() => {
    replace.mockClear();
    search = "";
  });

  it("запрашивает журнал по группе из пути, режиму и периоду из query", async () => {
    search = "period=2w&mode=operator112";
    const api = makeApi();
    render(<JournalScreen groupId="g-1" api={api} />);
    expect(await screen.findByRole("table", { name: "Журнал группы Группа 1" })).toBeInTheDocument();
    expect(api.journal).toHaveBeenCalledWith("g-1", { mode: "operator112", period: "2w" }, expect.anything());
    expect(screen.getByRole("rowheader", { name: /Иванов Пётр/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Петрова Анна/ })).toBeInTheDocument();
  });

  it("ячейка ведёт на разбор этапа обучающегося с теми же фильтрами", async () => {
    search = "period=2w&mode=operator112";
    render(<JournalScreen groupId="g-1" api={makeApi()} />);
    const cell = await screen.findByRole("link", { name: /Иванов Пётр, Адрес/ });
    expect(cell).toHaveAttribute(
      "href",
      "/teacher/error-map/students/u-10?group=g-1&period=2w&mode=operator112&stage=address&from=address",
    );
  });

  it("переключатель «Карта / Журнал» сохраняет группу, период и режим", async () => {
    search = "period=all&mode=dds";
    render(<JournalScreen groupId="g-1" api={makeApi()} />);
    await screen.findByRole("table");
    const nav = screen.getByRole("navigation", { name: "Вид раздела" });
    expect(within(nav).getByRole("link", { name: "Журнал" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Карта" })).toHaveAttribute(
      "href",
      "/teacher/error-map?group=g-1&period=all&mode=dds",
    );
  });

  it("«Показать на экране» помнит журнал, «Распечатать» просит PDF журнала", async () => {
    search = "period=2w&mode=dds";
    render(<JournalScreen groupId="g-1" api={makeApi()} />);
    await screen.findByRole("table");
    expect(screen.getByRole("link", { name: "Показать на экране" })).toHaveAttribute(
      "href",
      "/teacher/error-map/g-1/present?period=2w&mode=dds&view=journal",
    );
    const pdf = new URL(
      screen.getByRole("link", { name: /Распечатать/ }).getAttribute("href") ?? "",
      "http://x",
    );
    expect(Object.fromEntries(pdf.searchParams)).toEqual({
      scope: "journal",
      groupId: "g-1",
      mode: "dds",
      period: "2w",
    });
  });

  it("смена периода, режима и группы переходит на журнал с новыми фильтрами", async () => {
    search = "period=1m&mode=dds";
    render(<JournalScreen groupId="g-1" api={makeApi()} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "всё время" }));
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map/g-1/journal?period=all&mode=dds");
    fireEvent.click(screen.getByRole("button", { name: /112/ }));
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map/g-1/journal?period=1m&mode=operator112");
    fireEvent.change(screen.getByLabelText("Группа"), { target: { value: "g-2" } });
    expect(replace).toHaveBeenLastCalledWith("/teacher/error-map/g-2/journal?period=1m&mode=dds");
  });

  describe("состояния", () => {
    it("загрузка — таблицы ещё нет, переключатель виден", () => {
      render(
        <JournalScreen
          groupId="g-1"
          api={makeApi({ journal: vi.fn(() => new Promise<ErrorMapJournalResponse>(() => {})) })}
        />,
      );
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Вид раздела" })).toBeInTheDocument();
    });

    it("ни у кого нет попыток — «Пока нет данных за этот период»", async () => {
      const empty = { ...JOURNAL, rows: JOURNAL.rows.map((row) => ({ ...row, attempts: 0 })) };
      render(<JournalScreen groupId="g-1" api={makeApi({ journal: vi.fn().mockResolvedValue(empty) })} />);
      expect(await screen.findByText("Пока нет данных за этот период")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("нет закреплённых групп — понятное сообщение", async () => {
      render(<JournalScreen groupId="g-1" api={makeApi({ groups: vi.fn().mockResolvedValue([]) })} />);
      expect(await screen.findByText("Нет закреплённых групп")).toBeInTheDocument();
    });

    it("403 — понятный текст про доступ", async () => {
      const journal = vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Недостаточно прав"));
      render(<JournalScreen groupId="g-9" api={makeApi({ journal })} />);
      expect(await screen.findByText(/Нет доступа к журналу этой группы/)).toBeInTheDocument();
    });

    it("404 — «Группа не найдена»", async () => {
      const journal = vi.fn().mockRejectedValue(new ApiError(404, "notFound", "Данные не найдены"));
      render(<JournalScreen groupId="g-x" api={makeApi({ journal })} />);
      expect(await screen.findByText("Группа не найдена")).toBeInTheDocument();
    });

    it("прочая ошибка — сообщение сервера и повтор", async () => {
      const journal = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Не удалось построить журнал"))
        .mockResolvedValue(JOURNAL);
      render(<JournalScreen groupId="g-1" api={makeApi({ journal })} />);
      expect(await screen.findByText("Не удалось построить журнал")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
      expect(await screen.findByRole("table")).toBeInTheDocument();
    });

    it("без бэкенда — «требуется сервер»", async () => {
      const journal = vi.fn().mockRejectedValue(new ServerRequiredError());
      render(<JournalScreen groupId="g-1" api={makeApi({ journal })} />);
      expect(await screen.findByText(/сервер/i)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("список групп не загрузился — журнал всё равно показан, подпись берёт id группы", async () => {
      const groups = vi.fn().mockRejectedValue(new ApiError(500, "internal", "сбой"));
      render(<JournalScreen groupId="g-1" api={makeApi({ groups })} />);
      expect(await screen.findByRole("table", { name: "Журнал группы g-1" })).toBeInTheDocument();
    });
  });
});
