import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

function renderModal(onClose = vi.fn()) {
  const result = render(
    <Modal title="Записи звонков" onClose={onClose}>
      <button type="button">Прослушать</button>
      <button type="button">Скачать</button>
    </Modal>,
  );
  return { ...result, onClose };
}

describe("Modal: клавиатура и фокус (T5.2-02)", () => {
  it("окно объявляется своим заголовком", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Записи звонков");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("при открытии фокус уходит в окно", () => {
    renderModal();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("Tab с последнего интерактива возвращается на первый — фокус не уходит под затемнение", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Закрыть (Esc)" });
    const download = screen.getByRole("button", { name: "Скачать" });

    download.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(download);
  });

  it("Esc закрывает окно", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("после закрытия фокус возвращается на кнопку-открыватель", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="Напоминание" onClose={vi.fn()}>
        <button type="button">Отложить</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
