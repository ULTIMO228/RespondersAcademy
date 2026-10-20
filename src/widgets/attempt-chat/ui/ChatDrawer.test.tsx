import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/shared/api";

import { ChatDrawer } from "./ChatDrawer";
import type { ChatDrawerProps } from "./ChatDrawer";

const base: ChatDrawerProps = {
  title: "Разбор попытки: Пожар",
  greeting: "Здравствуйте! В этой попытке вы набрали 82 балла.",
  messages: [] as ChatMessage[],
  chips: ["Почему превышен норматив времени?", "Как избежать этих ошибок?"],
  status: "open",
  notice: null,
  onAsk: vi.fn(),
  onRetry: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
};

function renderDrawer(overrides: Partial<ChatDrawerProps> = {}) {
  const props = {
    ...base,
    onAsk: vi.fn(),
    onRetry: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ChatDrawer {...props} />) };
}

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  role: "user",
  content: "текст",
  status: "sent",
  timestamp: "2026-10-20T10:00:00Z",
  ...over,
});

describe("ChatDrawer", () => {
  it("диалог: role=dialog, aria-modal, заголовок, подпись про оценку преподавателя", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Разбор попытки: Пожар" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Оценку выставляет преподаватель, ответы ИИ справочные")).toBeInTheDocument();
    expect(screen.getByText("ИИ-ассистент разбора")).toBeInTheDocument();
  });

  it("фокус при открытии — в поле ввода", () => {
    renderDrawer();
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("закрывается по ✕, Escape и клику по подложке; клик внутри шторки не закрывает", () => {
    const { props } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("chat-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("dialog"));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it("Tab циклирует фокус внутри шторки", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not(:disabled), textarea, [href]"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("после закрытия фокус возвращается на кнопку, открывшую шторку", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = renderDrawer();
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("приветствие без бейджа; у каждого ответа ассистента бейдж источника", () => {
    renderDrawer({
      messages: [
        msg({ id: "1", role: "user", content: "Почему?" }),
        msg({ id: "2", role: "assistant", content: "Потому что.", source: "cloud", modelName: "qwen" }),
        msg({ id: "3", role: "assistant", content: "Ещё.", source: "template", modelName: null }),
      ],
    });
    expect(screen.getByText(base.greeting)).toBeInTheDocument();
    expect(screen.getByText("ИИ · облако")).toBeInTheDocument();
    expect(screen.getByText("шаблон")).toBeInTheDocument();
    expect(screen.getAllByText(/^(ИИ · облако|ИИ · локально|шаблон)$/)).toHaveLength(2);
  });

  it("чипы видны, пока нет реплик пользователя; клик отправляет вопрос; потом скрываются", () => {
    const { props, rerender } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Как избежать этих ошибок?" }));
    expect(props.onAsk).toHaveBeenCalledWith("Как избежать этих ошибок?");
    rerender(<ChatDrawer {...props} messages={[msg({ role: "user" })]} />);
    expect(screen.queryByRole("button", { name: "Как избежать этих ошибок?" })).toBeNull();
  });

  it("ошибка: сообщение в ленте и «Повторить»", () => {
    const { props } = renderDrawer({
      status: "error",
      notice: "Слишком много вопросов",
      messages: [msg({ status: "failed" })],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Слишком много вопросов");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("«Очистить переписку» вызывает onClear", () => {
    const { props } = renderDrawer({ messages: [msg({})] });
    fireEvent.click(screen.getByRole("button", { name: "Очистить переписку" }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it("ожидание: индикатор в ленте и спиннер на кнопке", () => {
    renderDrawer({ status: "waiting", messages: [msg({})] });
    expect(screen.getByTestId("chat-spinner")).toBeInTheDocument();
  });
});
