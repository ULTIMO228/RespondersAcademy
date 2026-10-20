import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSessionUser = vi.fn();

vi.mock("@/entities/user/index.server", () => ({
  requireSessionUser: (role: string) => requireSessionUser(role),
}));

import { AdminOnlyLayout } from "./AdminOnlyLayout";

beforeEach(() => {
  requireSessionUser.mockReset();
});

describe("AdminOnlyLayout", () => {
  it("требует роль admin", async () => {
    requireSessionUser.mockResolvedValue({});
    await AdminOnlyLayout({ children: null });
    expect(requireSessionUser).toHaveBeenCalledWith("admin");
  });

  it("не-админ: гвард перенаправляет на /forbidden, содержимое не отдаётся", async () => {
    requireSessionUser.mockImplementation(() => Promise.reject(new Error("NEXT_REDIRECT")));
    await expect(AdminOnlyLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
  });
});
