import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sessionStore } from "../model/session-store";
import { LogoutLink } from "./LogoutLink";

describe("LogoutLink", () => {
  it("клик «выйти» завершает сессию и ведёт на /login", () => {
    sessionStore.set({
      userId: "u-005",
      role: "student",
      token: "mock-u-005-abc",
      twoFactorUsed: true,
      issuedAt: new Date().toISOString(),
    });
    render(<LogoutLink title="Выйти">выйти</LogoutLink>);
    const link = screen.getByRole("link", { name: "выйти" });
    expect(link).toHaveAttribute("href", "/login");
    fireEvent.click(link);
    expect(sessionStore.get()).toBeNull();
    expect(document.cookie).not.toContain("arm112_session=%7B");
  });
});
