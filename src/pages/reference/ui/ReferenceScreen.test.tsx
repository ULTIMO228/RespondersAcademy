import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { KbArticle, PublicUser, ReferenceData } from "@/shared/api";

import { SessionProvider } from "@/entities/user";

import type { ReferenceApi } from "../api/referenceApi";
import { HOTKEY_SECTIONS } from "../config/hotkeys";
import { HotkeysTab } from "./HotkeysTab";
import { ReferenceScreen } from "./ReferenceScreen";

const ARTICLES: KbArticle[] = [
  {
    id: "kb-1",
    group: "Пожар",
    title: "Пожар в жилом доме",
    sections: {
      signs: ["Дым из окон"],
      notification: ["Оповестить ДДС 01"],
      clarify: ["Есть ли пострадавшие?"],
      ddsDecision: ["Направить расчёт"],
      typicalErrors: [],
    },
  },
  {
    id: "kb-2",
    group: "ДТП",
    title: "Столкновение двух автомобилей",
    sections: {
      signs: [],
      notification: [],
      clarify: [],
      ddsDecision: [],
      typicalErrors: ["Не уточнён адрес"],
    },
  },
];

const REFERENCE = {
  internalNumbers: [
    { number: "101", title: "Пожарно-спасательная служба" },
    { number: "102", title: "Полиция" },
  ],
  ddsStatuses: [
    { status: "accepted", title: "Принята", requiresComment: false, next: ["arrived"] },
    { status: "arrived", title: "Прибыла", requiresComment: true, next: [] },
  ],
  cardStatuses: [{ status: "new", title: "Новая", alert: true }],
} as unknown as ReferenceData;

function makeApi(overrides: Partial<ReferenceApi> = {}): ReferenceApi {
  return {
    articles: vi.fn().mockResolvedValue(ARTICLES),
    reference: vi.fn().mockResolvedValue(REFERENCE),
    materials: vi.fn().mockResolvedValue([]),
    updateArticle: vi.fn(),
    ...overrides,
  };
}

describe("ReferenceScreen", () => {
  it("показывает статьи, фильтрует по поиску и открывает пять разделов статьи", async () => {
    render(<ReferenceScreen api={makeApi()} />);
    expect(await screen.findByRole("button", { name: /Пожар в жилом доме/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Статьи (2)" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Поиск по всем разделам"), { target: { value: "столкновение" } });
    expect(screen.queryByRole("button", { name: /Пожар в жилом доме/ })).not.toBeInTheDocument();
    const article = screen.getByRole("article");
    expect(
      within(article).getByRole("heading", { name: "Столкновение двух автомобилей" }),
    ).toBeInTheDocument();
    for (const title of [
      "Признаки происшествия",
      "Оповещение служб",
      "Что уточнить у заявителя",
      "Решение диспетчера ДДС",
      "Типичные ошибки",
    ]) {
      expect(within(article).getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(within(article).getByText("Не уточнён адрес")).toBeInTheDocument();
  });

  it("открывает статью по article из адреса", async () => {
    render(<ReferenceScreen api={makeApi()} initialArticleId="kb-2" />);
    expect(await screen.findByRole("heading", { name: "Столкновение двух автомобилей" })).toBeInTheDocument();
  });

  it("без запроса ничего не найдено — пустое состояние", async () => {
    render(<ReferenceScreen api={makeApi()} initialQuery="несуществующее" />);
    expect(await screen.findByText("Статьи не найдены")).toBeInTheDocument();
  });

  it("без бэкенда статьи показывают «требуется сервер», остальные вкладки работают", async () => {
    const api = makeApi({
      articles: vi.fn().mockRejectedValue(new ServerRequiredError()),
    });
    render(<ReferenceScreen api={api} />);
    await waitFor(() =>
      expect(screen.getByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Служебные номера/ }));
    expect(await screen.findByText("Пожарно-спасательная служба")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Горячие клавиши/ }));
    expect(screen.getAllByRole("table")).toHaveLength(5);
  });

  it("ошибка сервера показывает сообщение и повтор", async () => {
    const api = makeApi({ articles: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Сбой")) });
    render(<ReferenceScreen api={api} />);
    expect(await screen.findByText("Не удалось загрузить статьи")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Повторить/ })).toBeInTheDocument();
  });

  it("служебные номера фильтруются общим поиском", async () => {
    render(<ReferenceScreen api={makeApi()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Служебные номера/ }));
    expect(await screen.findByText("Полиция")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Поиск по всем разделам"), { target: { value: "101" } });
    expect(screen.queryByText("Полиция")).not.toBeInTheDocument();
    expect(screen.getByText("Пожарно-спасательная служба")).toBeInTheDocument();
  });

  it("памятки: только чтение, просмотр раскрывается, «Перейти» ведёт к клавишам", async () => {
    render(<ReferenceScreen api={makeApi()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Памятки/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Открыть/ })[0]);
    expect(screen.getByRole("document", { name: "Просмотр документа" })).toHaveTextContent("только чтение");
    for (const name of [/Изменить/, /Редактировать/, /Удалить/, /Загрузить/, /Сохранить/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Перейти" }));
    expect(screen.getAllByRole("table")).toHaveLength(5);
  });

  it("статусы показывают цепочку переходов", async () => {
    render(<ReferenceScreen api={makeApi()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Статусы" }));
    expect(await screen.findByText("Статусы реагирования")).toBeInTheDocument();
    expect(screen.getByText("обязателен")).toBeInTheDocument();
  });
});

describe("HotkeysTab", () => {
  it("содержит все 5 таблиц спеки с полным набором комбинаций", () => {
    const { container } = render(<HotkeysTab query="" />);
    expect(container.querySelectorAll("table")).toHaveLength(5);
    const rowCount = HOTKEY_SECTIONS.reduce((sum, section) => sum + section.rows.length, 0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(rowCount);
    expect(rowCount).toBe(33);
    for (const title of [
      "Общие:",
      "Переход к блокам карточки (режим создания):",
      "Мгновенные действия (режим создания):",
      "Режим просмотра:",
      "Окно добавления связи:",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Shift+F2")).toBeInTheDocument();
    expect(screen.getByText("Alt+Q")).toBeInTheDocument();
    expect(screen.getByText("Alt+Ctrl+1…n")).toBeInTheDocument();
  });

  it("комбинации и действия дословно совпадают с 04-arm-progress.md", () => {
    const spec = readFileSync(resolve(process.cwd(), "spec/000-фронт/04-pages/04-arm-progress.md"), "utf8");
    const section = spec.slice(
      spec.indexOf("### Методический материал"),
      spec.indexOf("## Критерии приёмки"),
    );
    const specRows = section
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Комбинация"))
      .map((line) => {
        const [keys, action] = line
          .split("|")
          .slice(1, 3)
          .map((cell) => cell.trim());
        return [keys, action];
      });
    const configRows = HOTKEY_SECTIONS.flatMap((s) =>
      s.rows.map((row): [string, string] => [row.keys, row.action]),
    );
    expect(configRows).toEqual(specRows);
  });

  it("общие и режим просмотра — активны; режим создания и окно связи — справочно (T2.3-19)", () => {
    const { container } = render(<HotkeysTab query="" />);
    const activity = Object.fromEntries(
      [...container.querySelectorAll("section[data-activity]")].map((section) => [
        section.getAttribute("aria-labelledby"),
        section.getAttribute("data-activity"),
      ]),
    );
    expect(activity).toEqual({
      "hotkeys-common": "active",
      "hotkeys-create-blocks": "reference",
      "hotkeys-create-actions": "reference",
      "hotkeys-view": "active",
      "hotkeys-link-window": "reference",
    });
    expect(screen.getAllByText("В тренажёре активны")).toHaveLength(2);
    expect(screen.getAllByText("Справочно: в тренажёре неактивны")).toHaveLength(3);
    expect(screen.getByText(/у обучающегося не действует/)).toBeInTheDocument();
  });
});

const viewer = (role: PublicUser["role"]): PublicUser => ({
  id: `u-${role}`,
  login: role,
  fullName: role,
  role,
  armNumber: 1,
  isActive: true,
});

describe("правка статьи (FR-072)", () => {
  it("преподаватель правит раздел, сохраняет и сразу видит новый текст", async () => {
    const updated: KbArticle = {
      ...ARTICLES[0],
      sections: { ...ARTICLES[0].sections, signs: ["Дым из окон", "Запах гари"] },
    };
    const updateArticle = vi.fn().mockResolvedValue(updated);
    render(
      <SessionProvider user={viewer("teacher")}>
        <ReferenceScreen api={makeApi({ updateArticle })} />
      </SessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Править разделы" }));
    const signs = screen.getByLabelText(/Признаки происшествия/);
    fireEvent.change(signs, { target: { value: "Дым из окон\nЗапах гари\n\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(screen.getByText("Запах гари")).toBeInTheDocument());
    expect(updateArticle).toHaveBeenCalledWith("kb-1", {
      signs: ["Дым из окон", "Запах гари"],
      notification: ["Оповестить ДДС 01"],
      clarify: ["Есть ли пострадавшие?"],
      ddsDecision: ["Направить расчёт"],
      typicalErrors: [],
    });
    expect(screen.getByText("Изменения сохранены и видны обучающимся.")).toBeInTheDocument();
  });

  it("обучающемуся кнопки правки нет", async () => {
    render(
      <SessionProvider user={viewer("student")}>
        <ReferenceScreen api={makeApi()} />
      </SessionProvider>,
    );
    await screen.findByRole("button", { name: /Пожар в жилом доме/ });
    expect(screen.queryByRole("button", { name: "Править разделы" })).not.toBeInTheDocument();
  });

  it("отказ сервера (403) показывается дословно, введённое остаётся в форме", async () => {
    const updateArticle = vi.fn().mockRejectedValue(new ApiError(403, "forbidden", "Недостаточно прав"));
    render(
      <SessionProvider user={viewer("teacher")}>
        <ReferenceScreen api={makeApi({ updateArticle })} />
      </SessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Править разделы" }));
    fireEvent.change(screen.getByLabelText(/Признаки происшествия/), { target: { value: "Новый признак" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Недостаточно прав")).toBeInTheDocument();
    expect(screen.getByLabelText(/Признаки происшествия/)).toHaveValue("Новый признак");
  });
});
