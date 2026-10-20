import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicUser } from "@/shared/api";

const redirectMock = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});

vi.mock("next/navigation", () => ({ redirect: (href: string) => redirectMock(href) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token" }) }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

import { requireSpecialization } from "./server-session";

function respondWith(user: PublicUser) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(user), { status: 200 })),
  );
}

function userOf(role: PublicUser["role"], specializations?: PublicUser["specializations"]): PublicUser {
  return { id: "u-x", login: "x", fullName: "Тест", role, armNumber: 1, isActive: true, specializations };
}

beforeEach(() => {
  redirectMock.mockClear();
  vi.unstubAllGlobals();
});

describe("requireSpecialization", () => {
  it("обучающийся без нужной специализации → /forbidden", async () => {
    respondWith(userOf("student", ["dds"]));
    await expect(requireSpecialization("operator112")).rejects.toThrow("NEXT_REDIRECT:/forbidden");
    expect(redirectMock).toHaveBeenCalledWith("/forbidden");
  });

  it("парный случай: со своей специализацией пропускает", async () => {
    respondWith(userOf("student", ["operator112"]));
    const { user } = await requireSpecialization("operator112");
    expect(user.role).toBe("student");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("обучающийся с обеими специализациями проходит в обе зоны", async () => {
    respondWith(userOf("student", ["operator112", "dds"]));
    await expect(requireSpecialization("dds")).resolves.toBeDefined();
    await expect(requireSpecialization("operator112")).resolves.toBeDefined();
  });

  it("чужая роль → /forbidden, как в requireSessionUser", async () => {
    respondWith(userOf("teacher"));
    await expect(requireSpecialization("dds")).rejects.toThrow("NEXT_REDIRECT:/forbidden");
  });
});
