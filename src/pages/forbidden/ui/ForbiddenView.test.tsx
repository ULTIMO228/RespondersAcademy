import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ForbiddenView } from "./ForbiddenView";

describe("ForbiddenView (403)", () => {
  it("рендерит «Доступ запрещён» и ссылку в раздел роли", () => {
    render(<ForbiddenView homeHref="/teacher" />);
    expect(screen.getByText("Доступ запрещён")).toBeInTheDocument();
    expect(screen.getByText("Ошибка 403")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в свой раздел" })).toHaveAttribute("href", "/teacher");
    expect(screen.getByRole("link", { name: "Войти под другой учётной записью" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("без сессии ссылка в раздел не показывается, тема светлая", () => {
    const { container } = render(<ForbiddenView homeHref={null} />);
    expect(screen.queryByRole("link", { name: "Перейти в свой раздел" })).not.toBeInTheDocument();
    expect(container.querySelector("main")).toHaveAttribute("data-theme", "light");
  });
});
