import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionBanner } from "./ConnectionBanner";

describe("ConnectionBanner (T3.3-02)", () => {
  it("при связи ничего не показывает", () => {
    const { container } = render(<ConnectionBanner isOnline />);
    expect(container).toBeEmptyDOMElement();
  });

  it("при обрыве — сообщение поверх интерфейса и пометка о сохранении данных", () => {
    render(<ConnectionBanner isOnline={false} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/Соединение потеряно/);
    expect(banner).toHaveTextContent(/таймеры продолжают идти/);
    expect(banner).toHaveAttribute("data-online", "false");
  });

  it("после восстановления — подтверждение о догрузке", () => {
    render(<ConnectionBanner isOnline isRestored />);
    expect(screen.getByRole("status")).toHaveTextContent(/Соединение восстановлено/);
  });
});
