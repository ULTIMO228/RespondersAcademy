import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ServerRequired } from "./ServerRequired";

describe("ServerRequired (спека 002, FR-003)", () => {
  it("показывает сообщение и пояснение как статус, без кнопки повтора по умолчанию", () => {
    render(<ServerRequired />);
    expect(screen.getByRole("status")).toHaveTextContent("Раздел требует подключения к серверу тренажёра");
    expect(screen.getByRole("status")).toHaveTextContent(/BACKEND_URL/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("выводит название раздела", () => {
    render(<ServerRequired section="Задания" />);
    expect(screen.getByRole("heading", { name: "Задания" })).toBeInTheDocument();
  });

  it("с onRetry — кнопка «Повторить» вызывает обработчик", () => {
    const onRetry = vi.fn();
    render(<ServerRequired onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
