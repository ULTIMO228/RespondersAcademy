import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage, ChatResponse } from "@/shared/api";
import { createChatHistoryStore, createMemoryStorage } from "@/shared/lib";

import { AttemptChat } from "./AttemptChat";

const REVIEW = { totalScore: 82, errors: [{ type: "timeReactionExceeded", message: "Долго" }] };
const ANSWER: ChatResponse = {
  reply: "Потому что норматив.",
  source: "local",
  provider: null,
  modelName: "qwen",
};

function setup() {
  const send = vi.fn(async () => ANSWER);
  const store = createChatHistoryStore<ChatMessage>(createMemoryStorage());
  render(
    <AttemptChat
      attemptId="a1"
      mode="dds"
      review={REVIEW}
      title="Разбор попытки: Пожар"
      send={send}
      store={store}
    />,
  );
  return { send, store };
}

describe("AttemptChat", () => {
  it("кнопка открывает шторку с приветствием и чипами; закрытие возвращает фокус на кнопку", () => {
    setup();
    const trigger = screen.getByRole("button", { name: /Обсудить результат с ИИ/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/вы набрали 82 балла, зафиксировано 1 замечание/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Почему превышен норматив времени?" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("клик по чипу отправляет вопрос, ответ приходит с бейджем и чипы исчезают", async () => {
    const { send } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Обсудить результат с ИИ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Почему превышен норматив времени?" }));
    expect(await screen.findByText("Потому что норматив.")).toBeInTheDocument();
    expect(screen.getByText("ИИ · локально")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "a1", mode: "dds", message: "Почему превышен норматив времени?" }),
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(screen.queryByRole("group", { name: "Быстрые вопросы" })).toBeNull());
  });
});
