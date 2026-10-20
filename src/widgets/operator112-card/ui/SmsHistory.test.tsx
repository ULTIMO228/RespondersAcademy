import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SmsHistory } from "./SmsHistory";

describe("SmsHistory (ИНСТРУКЦИЯ_112)", () => {
  it("таблица, счётчик и возврат в карточку", () => {
    const onBack = vi.fn();
    render(
      <SmsHistory
        unread={1}
        onBack={onBack}
        messages={[
          {
            id: "1",
            operator: "97",
            dateTime: "02.04.2019 09:34",
            status: "получено",
            phone: "+7 (925) 081-10-23",
            text: "Помогите мне!",
          },
        ]}
      />,
    );
    for (const head of ["Опер.", "Дата и время", "Статус", "Телефон", "Текст сообщения"]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeInTheDocument();
    }
    expect(screen.getByText("получено")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /История сообщений 1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← вернуться в карточку" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("пустая история — явное «Сообщений нет»", () => {
    render(<SmsHistory unread={0} messages={[]} onBack={vi.fn()} />);
    expect(screen.getByText("Сообщений нет")).toBeInTheDocument();
  });
});
