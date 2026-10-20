import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput, MAX_HEIGHT, MIN_HEIGHT, MAX_LENGTH } from "./ChatInput";

const PLACEHOLDER = "Спросите, почему снижен балл или как действовать по регламенту...";

function field() {
  return screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement;
}
function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatInput", () => {
  it("пустое и из пробелов — кнопка disabled", () => {
    render(<ChatInput onSend={vi.fn()} waiting={false} />);
    const button = screen.getByRole("button", { name: "Отправить" });
    expect(button).toBeDisabled();
    type("   ");
    expect(button).toBeDisabled();
    type("Вопрос");
    expect(button).toBeEnabled();
  });

  it("Enter отправляет и очищает поле, Shift+Enter не отправляет", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} waiting={false} />);
    type("Почему?");
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Почему?");
    expect(field().value).toBe("");
  });

  it("клик по кнопке отправляет", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} waiting={false} />);
    type("Вопрос");
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(onSend).toHaveBeenCalledWith("Вопрос");
  });

  it("во время ожидания Enter и клик игнорируются, виден спиннер", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} waiting />);
    type("Вопрос");
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId("chat-spinner")).toBeInTheDocument();
  });

  it("высота растёт от 44px до 140px, после отправки возвращается к 44px", () => {
    let scroll = 0;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => scroll);
    render(<ChatInput onSend={vi.fn()} waiting={false} />);
    type("a");
    expect(field().style.height).toBe(`${MIN_HEIGHT}px`);
    scroll = 90;
    type("a\nb\nc");
    expect(field().style.height).toBe("90px");
    scroll = 400;
    type("a\nb\nc\nd\ne\nf\ng\nh");
    expect(field().style.height).toBe(`${MAX_HEIGHT}px`);
    expect(field().style.overflowY).toBe("auto");
    scroll = 0;
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().style.height).toBe(`${MIN_HEIGHT}px`);
  });

  it("maxLength 1000 и счётчик", () => {
    render(<ChatInput onSend={vi.fn()} waiting={false} />);
    expect(field()).toHaveAttribute("maxlength", String(MAX_LENGTH));
    type("abc");
    expect(screen.getByText(`3 / ${MAX_LENGTH}`)).toBeInTheDocument();
  });

  it("нет загрузки файлов: ни input[type=file], ни скрепки, ни «+»; drop и dragover отменяются", () => {
    const { container } = render(<ChatInput onSend={vi.fn()} waiting={false} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /прикреп|файл|\+/i })).toBeNull();
    for (const name of ["dragOver", "drop"] as const) {
      const event = createEvent[name](field());
      fireEvent(field(), event);
      expect(event.defaultPrevented).toBe(true);
    }
    const wrapper = createEvent.drop(container.firstElementChild as Element);
    fireEvent(container.firstElementChild as Element, wrapper);
    expect(wrapper.defaultPrevented).toBe(true);
  });
});
