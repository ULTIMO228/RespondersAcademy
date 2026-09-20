import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RING_DELAY_MS } from "../config/callControl";
import type { CallResponder, FinishedCall } from "../model/types";
import { ActiveCall } from "./ActiveCall";

const TARGET = { number: "301", subscriberTitle: "Руководитель дежурной смены ДДС" };

/** Мок ИИ-абонента: реплики как в mocks/sessions.json, без сети. */
function createResponder(): CallResponder {
  return {
    answer: vi.fn(async () => ({
      text: "Слушаю вас",
      voice: "female" as const,
      speakerTitle: TARGET.subscriberTitle,
    })),
    reply: vi.fn(async () => ({
      text: "Я вас понял, информация принята",
      voice: "female" as const,
      speakerTitle: TARGET.subscriberTitle,
    })),
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T08:21:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActiveCall", () => {
  it("«Вызов…» → ответ ИИ «Слушаю вас» с бейджем «ИИ» и пометкой голоса → «Разговор»", async () => {
    render(<ActiveCall target={TARGET} responder={createResponder()} />);
    expect(screen.getByText("Вызов…")).toBeInTheDocument();
    expect(screen.getByLabelText("Реплика диспетчера")).toBeDisabled();
    await advance(RING_DELAY_MS);
    expect(screen.getByText("Разговор")).toBeInTheDocument();
    const aiLine = screen
      .getByRole("log", { name: "Транскрипт вызова" })
      .querySelector("[data-speaker='ai']");
    expect(aiLine).toHaveTextContent("Слушаю вас");
    expect(within(aiLine as HTMLElement).getByText("ИИ")).toBeInTheDocument();
    expect(screen.getByText(/Голос ИИ-абонента: женский/)).toBeInTheDocument();
  });

  it("реплика диспетчера → подтверждение ИИ в логе; таймер разговора идёт", async () => {
    const responder = createResponder();
    render(<ActiveCall target={TARGET} responder={responder} />);
    await advance(RING_DELAY_MS);
    fireEvent.change(screen.getByLabelText("Реплика диспетчера"), {
      target: { value: "ДТП на Волгоградском" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await advance(0);
    const log = screen.getByRole("log");
    expect(within(log).getByText("ДТП на Волгоградском")).toBeInTheDocument();
    expect(within(log).getByText("Я вас понял, информация принята")).toBeInTheDocument();
    expect(responder.reply).toHaveBeenCalledWith("301", "ДТП на Волгоградском");
    await advance(5000);
    expect(screen.getByText("0:05")).toBeInTheDocument();
  });

  it("«Завершить»: «Завершён», таймер остановлен, onFinish получает PhoneCall-данные", async () => {
    const onFinish = vi.fn<(call: FinishedCall) => void>();
    render(<ActiveCall target={TARGET} responder={createResponder()} onFinish={onFinish} />);
    await advance(RING_DELAY_MS + 3000);
    fireEvent.click(screen.getByRole("button", { name: /Завершить/ }));
    expect(screen.getByText("Завершён")).toBeInTheDocument();
    expect(screen.getByLabelText("Реплика диспетчера")).toBeDisabled();
    await advance(10_000);
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0]).toMatchObject({
      number: "301",
      startedAt: "2026-09-17T11:21:00+03:00",
      endedAt: "2026-09-17T11:21:05+03:00",
      transcript: [{ speaker: "ai", text: "Слушаю вас", at: "2026-09-17T11:21:02+03:00" }],
    });
  });

  it("завершение до ответа: ИИ-абонент не подключается", async () => {
    const responder = createResponder();
    render(<ActiveCall target={TARGET} responder={responder} />);
    fireEvent.click(screen.getByRole("button", { name: /Завершить/ }));
    await advance(RING_DELAY_MS);
    expect(responder.answer).not.toHaveBeenCalled();
    expect(screen.getByText("Реплик нет")).toBeInTheDocument();
  });
});
