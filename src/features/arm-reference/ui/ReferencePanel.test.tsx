import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { KbArticle } from "@/shared/api";

import type { ReferencePanelApi } from "../model/referenceApi";
import { ReferenceToggle } from "./ReferencePanel";
import { ReferenceWindow } from "./ReferenceWindow";

const ARTICLES: KbArticle[] = [
  {
    id: "kb-1",
    group: "Пожары",
    title: "Пожар в жилом доме",
    sections: {
      signs: ["Горит балкон"],
      notification: ["Служба 101"],
      clarify: ["Есть ли люди в квартире"],
      ddsDecision: [],
      typicalErrors: ["Не уточнён этаж"],
    },
  },
  {
    id: "kb-2",
    group: "Газ",
    title: "Утечка газа",
    sections: {
      signs: ["Запах газа"],
      notification: ["Служба 104"],
      clarify: [],
      ddsDecision: [],
      typicalErrors: [],
    },
  },
];

const api = (overrides: Partial<ReferencePanelApi> = {}): ReferencePanelApi => ({
  access: vi.fn().mockResolvedValue({ allowed: true }),
  articles: vi.fn().mockResolvedValue(ARTICLES),
  article: vi
    .fn()
    .mockImplementation((id: string) => Promise.resolve(ARTICLES.find((item) => item.id === id))),
  ...overrides,
});

describe("справочник поверх АРМ", () => {
  it("кнопка открывает панель, поиск по форме слова, статья тезисами по разделам", async () => {
    render(<ReferenceToggle api={api()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    expect(screen.getByRole("dialog", { name: "Справочник" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Поиск по ключевым словам"), {
      target: { value: "балкон пожаре" },
    });
    const results = await screen.findByRole("list", { name: "Найденные статьи" });
    expect(results).toHaveTextContent("Пожар в жилом доме");
    expect(results).not.toHaveTextContent("Утечка газа");
    fireEvent.click(within(results).getAllByRole("button")[0]);
    expect(await screen.findByRole("heading", { name: "Признаки" })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 4 }).map((item) => item.textContent);
    expect(headings).toEqual(["Признаки", "Оповещение служб", "Что уточнить у заявителя", "Типичные ошибки"]);
    expect(screen.getByText("балкон", { selector: "mark" })).toBeInTheDocument();
  });

  it("в выдаче виден тезис с найденным словом, пример запроса подставляется в поиск, «×» очищает его", async () => {
    render(<ReferenceToggle api={api()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    const input = await screen.findByLabelText("Поиск по ключевым словам");
    fireEvent.click(screen.getByRole("button", { name: "балкон" }));
    expect(input).toHaveValue("балкон");
    const results = await screen.findByRole("list", { name: "Найденные статьи" });
    expect(within(results).getByText("Горит", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Найдено статей: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("list", { name: "Примеры запросов" })).toBeInTheDocument();
  });

  it("стрелка вниз из поля переводит фокус на первую статью, вверх — обратно в поле", async () => {
    render(<ReferenceToggle api={api()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    const input = await screen.findByLabelText("Поиск по ключевым словам");
    fireEvent.change(input, { target: { value: "пожар" } });
    const results = await screen.findByRole("list", { name: "Найденные статьи" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = within(results).getAllByRole("button")[0];
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(input).toHaveFocus();
  });

  it("короткий запрос и пустой результат — подсказки, панель не закрывается", async () => {
    render(<ReferenceToggle api={api()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    const input = await screen.findByLabelText("Поиск по ключевым словам");
    fireEvent.change(input, { target: { value: "га" } });
    expect(screen.getByText(/хотя бы 3 буквы/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "наводнение" } });
    expect(screen.getByText(/Ничего не найдено/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Esc закрывает панель", async () => {
    render(<ReferenceToggle api={api()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("при запрете в задании кнопки нет", async () => {
    const access = vi
      .fn()
      .mockResolvedValue({ allowed: false, message: "Справочник недоступен в этом задании" });
    render(<ReferenceToggle api={api({ access })} />);
    await waitFor(() => expect(access).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Справочник" })).not.toBeInTheDocument());
  });

  it("403 от сервера на статьи — «недоступен в этом задании»; другой сбой — «временно недоступен»", async () => {
    const locked = vi
      .fn()
      .mockRejectedValue(new ApiError(403, "forbidden", "Справочник недоступен в этом задании"));
    const { unmount } = render(<ReferenceToggle api={api({ articles: locked })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    expect(await screen.findByText("Справочник недоступен в этом задании")).toBeInTheDocument();
    unmount();
    render(<ReferenceToggle api={api({ articles: vi.fn().mockRejectedValue(new Error("сеть")) })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Справочник" }));
    expect(await screen.findByText("Справочник временно недоступен")).toBeInTheDocument();
  });
});

describe("окно справочника", () => {
  it("открывается с тем же запросом и статьёй", async () => {
    render(<ReferenceWindow api={api()} initialQuery="газ" initialArticleId="kb-2" />);
    expect(await screen.findByRole("heading", { level: 3 })).toHaveTextContent("Утечка газа");
  });

  it("при запрете содержание скрыто", async () => {
    render(<ReferenceWindow api={api({ access: vi.fn().mockResolvedValue({ allowed: false }) })} />);
    expect(await screen.findByText("Справочник недоступен в этом задании")).toBeInTheDocument();
    expect(screen.queryByLabelText("Поиск по ключевым словам")).not.toBeInTheDocument();
  });
});
