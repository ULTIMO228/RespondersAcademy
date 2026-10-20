import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ErrorMapExplanation, ErrorMapVerdictRequest } from "@/shared/api";

import { AiExplain } from "./AiExplain";

const TARGET = { groupId: "g-1", mode: "dds", period: "1m", stageId: "address" } as const;

const aiText: ErrorMapExplanation = {
  text: "Скорее всего, обучающиеся торопятся и не сверяют адрес с билетом.",
  source: "ai",
  textHash: "a".repeat(64),
};

const templateText: ErrorMapExplanation = {
  text: "На этапе «Адрес» чаще всего: адрес не совпадает с билетом.",
  source: "template",
  textHash: "b".repeat(64),
};

describe("пояснение «Почему так происходит»", () => {
  it("текст ИИ — с бейджем «ИИ» и словами «предположение ИИ»", () => {
    render(<AiExplain explanation={aiText} target={TARGET} save={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Почему так происходит/ })).toHaveTextContent(
      "предположение ИИ",
    );
    expect(screen.getByLabelText(/^ИИ:/)).toBeInTheDocument();
    expect(screen.getByText(aiText.text)).toBeInTheDocument();
  });

  it("шаблон — «справочное пояснение», без бейджа «ИИ»", () => {
    render(<AiExplain explanation={templateText} target={TARGET} save={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Почему так происходит/ })).toHaveTextContent(
      "справочное пояснение",
    );
    expect(screen.queryByLabelText(/^ИИ:/)).not.toBeInTheDocument();
  });

  it("новый источник локальной модели показывает фактическую пометку, а вердикт хранит legacy source ai", async () => {
    const save = vi.fn<(body: ErrorMapVerdictRequest) => Promise<void>>().mockResolvedValue();
    const localText: ErrorMapExplanation = { ...aiText, source: "local", model: "qwen-local" };
    render(<AiExplain explanation={localText} target={TARGET} save={save} />);

    expect(screen.getByText("ИИ · локально")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Согласен" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ source: "ai" })));
  });

  it("старый ответ ai/sourceKind локально отображается с уточнённым источником", () => {
    render(
      <AiExplain
        explanation={{ ...aiText, sourceKind: "local", model: "qwen-local" }}
        target={TARGET}
        save={vi.fn()}
      />,
    );

    expect(screen.getByText("ИИ · локально")).toBeInTheDocument();
  });

  it("без ответа обе кнопки не нажаты, итог не показан", () => {
    render(<AiExplain explanation={aiText} target={TARGET} save={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Не согласен" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/Ваш ответ/)).not.toBeInTheDocument();
  });

  it("сохранённый ответ виден значком и словом, кнопка нажата", () => {
    render(<AiExplain explanation={{ ...aiText, verdict: "disagree" }} target={TARGET} save={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Не согласен" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Ваш ответ/)).toHaveTextContent("Не согласен");
  });

  it("клик отправляет вердикт с контекстом, хэшем и источником и сразу показывает ответ", async () => {
    const save = vi.fn<(body: ErrorMapVerdictRequest) => Promise<void>>().mockResolvedValue();
    render(<AiExplain explanation={aiText} target={{ ...TARGET, studentId: "u-1" }} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Согласен" }));
    expect(save).toHaveBeenCalledWith({
      groupId: "g-1",
      studentId: "u-1",
      mode: "dds",
      period: "1m",
      stageId: "address",
      textHash: aiText.textHash,
      source: "ai",
      verdict: "agree",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByText(/Ваш ответ/)).toHaveTextContent("Согласен");
  });

  it("можно передумать: второй клик шлёт другой вердикт", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<AiExplain explanation={{ ...templateText, verdict: "agree" }} target={TARGET} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Не согласен" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ verdict: "disagree", source: "template" });
    expect(screen.getByRole("button", { name: "Не согласен" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "false");
  });

  it("ошибка сохранения — понятное сообщение, прежний ответ остаётся, повторить можно", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("сбой")).mockResolvedValue(undefined);
    render(<AiExplain explanation={{ ...aiText, verdict: "agree" }} target={TARGET} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Не согласен" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить ответ");
    expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Не согласен" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Не согласен" })).toHaveAttribute("aria-pressed", "true");
  });

  it("новый текст пояснения сбрасывает ответ к вердикту этого текста", () => {
    const { rerender } = render(
      <AiExplain explanation={{ ...aiText, verdict: "agree" }} target={TARGET} save={vi.fn()} />,
    );
    rerender(<AiExplain explanation={templateText} target={TARGET} save={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Согласен" })).toHaveAttribute("aria-pressed", "false");
  });

  it("напоминает, что решение за преподавателем", () => {
    render(<AiExplain explanation={aiText} target={TARGET} save={vi.fn()} />);
    expect(screen.getByText(/решение остаётся за вами/i)).toBeInTheDocument();
  });
});
