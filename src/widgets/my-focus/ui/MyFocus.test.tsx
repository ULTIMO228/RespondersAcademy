import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { MyFocusResponse } from "@/shared/api";

import { MyFocus } from "./MyFocus";

const FULL: MyFocusResponse = {
  mode: "dds",
  items: [
    { stageId: "statuses", title: "Статусы реагирования", hint: "Повторите тему «Статусы реагирования»." },
    { stageId: "route", title: "Маршрут", hint: "Повторите тему «Маршрут».", articleId: "art-route" },
    { stageId: "decision", title: "Тип происшествия", hint: "Повторите тему «Тип происшествия»." },
  ],
};

const api = (focus: () => Promise<MyFocusResponse>) => ({ focus });

describe("блок «Над чем поработать»", () => {
  it("три пункта: название, подсказка и ссылка на материал", async () => {
    render(<MyFocus api={api(() => Promise.resolve(FULL))} />);
    expect(await screen.findByRole("heading", { name: "Над чем поработать" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Повторите тему «Маршрут».")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /материал/i });
    expect(links).toHaveLength(3);
    expect(links[1]).toHaveAttribute("href", "/reference?article=art-route");
    expect(links[0]).toHaveAttribute("href", "/reference");
  });

  it("формулировки нейтральные: нет оценок и сравнений", async () => {
    const { container } = render(<MyFocus api={api(() => Promise.resolve(FULL))} />);
    await screen.findByRole("heading", { name: "Над чем поработать" });
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["хуже", "лучше", "часто", "слаб", "групп", "ошибк"]) expect(text).not.toContain(word);
  });

  it("замечаний нет — сообщение сервера, списка нет", async () => {
    render(
      <MyFocus api={api(() => Promise.resolve({ mode: "dds", items: [], message: "Пока замечаний нет" }))} />,
    );
    expect(await screen.findByText("Пока замечаний нет")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("мало данных — просьба пройти ещё тренировки", async () => {
    const message = "Пройдите ещё несколько тренировок, чтобы здесь появились подсказки";
    render(<MyFocus api={api(() => Promise.resolve({ mode: null, items: [], message }))} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("без бэкенда блок скрыт целиком и без сообщения об ошибке", async () => {
    const { container } = render(<MyFocus api={api(() => Promise.reject(new ServerRequiredError()))} />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("другая ошибка не прячется: сообщение и повтор", async () => {
    render(<MyFocus api={api(() => Promise.reject(new ApiError(500, "internal", "Сбой сервера")))} />);
    expect(await screen.findByText("Сбой сервера")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
