import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ServerRequiredError } from "@/shared/api";
import type { PublicUser } from "@/shared/api";

import type { AdminHomeApi } from "../api/homeApi";
import { AdminHomeScreen, countActiveByRole } from "./AdminHomeScreen";

const user = (id: string, role: PublicUser["role"], isActive = true): PublicUser => ({
  id,
  login: id,
  fullName: `Пользователь ${id}`,
  role,
  armNumber: 1,
  isActive,
});

function makeApi(overrides: Partial<AdminHomeApi> = {}): AdminHomeApi {
  return {
    health: vi.fn().mockResolvedValue({ status: "ok", db: "sqlite", version: "0.1.0" }),
    services: vi.fn().mockResolvedValue({
      services: [
        { id: "s1", name: "База данных", state: "running", uptimeSec: 1, critical: true, description: "" },
        { id: "s2", name: "Телефония", state: "stopped", uptimeSec: 0, critical: false, description: "" },
      ],
      integrity: { ok: true, checkedAt: "2026-09-29T10:00:00+03:00", details: "Проверено" },
    }),
    monitoring: vi.fn().mockResolvedValue({
      generatedAt: "2026-09-29T10:00:00+03:00",
      windowHours: 1,
      stepMinutes: 10,
      labels: ["10:00", "10:10"],
      series: {
        cpuPercent: [10, 20],
        memoryPercent: [30, 40],
        networkMbit: [1, 2],
        activeSessions: [3, 5],
        responseSec: [0.5, 0.7],
      },
      norms: { sessionLimit: 20, responseSec: 2 },
    }),
    users: vi
      .fn()
      .mockResolvedValue([
        user("u-1", "admin"),
        user("u-2", "teacher"),
        user("u-5", "student"),
        user("u-6", "student", false),
      ]),
    audit: vi.fn().mockResolvedValue({
      items: [
        {
          id: "a1",
          at: "2026-09-29T10:00:00+03:00",
          userId: "u-2",
          role: "teacher",
          action: "assignment.create",
          details: "Задание asg-1",
        },
      ],
      total: 1,
      page: 1,
      perPage: 8,
    }),
    ...overrides,
  };
}

describe("главная администратора", () => {
  it("считает активных пользователей по ролям", () => {
    expect(
      countActiveByRole([user("a", "student"), user("b", "student", false), user("c", "teacher")]),
    ).toEqual({ student: 1, teacher: 1, admin: 0 });
  });

  it("показывает сервер, сервисы, нагрузку и последние события с человекочитаемым названием", async () => {
    render(<AdminHomeScreen api={makeApi()} />);
    expect(await screen.findByText("работает")).toBeInTheDocument();
    expect(screen.getByText("SQLite (разработка)")).toBeInTheDocument();
    expect(await screen.findByText("Работают 1 из 2")).toBeInTheDocument();
    expect(screen.getByText("Телефония")).toBeInTheDocument();
    expect(await screen.findByText("лимит 20")).toBeInTheDocument();
    expect(await screen.findByText("Создано задание")).toBeInTheDocument();
    expect(screen.getByText("Пользователь u-2")).toBeInTheDocument();
  });

  it("без бэкенда health — «нужен сервер», остальные блоки работают", async () => {
    render(
      <AdminHomeScreen api={makeApi({ health: vi.fn().mockRejectedValue(new ServerRequiredError()) })} />,
    );
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
    expect(await screen.findByText("Работают 1 из 2")).toBeInTheDocument();
  });

  it("ошибка одного блока не роняет страницу", async () => {
    render(
      <AdminHomeScreen
        api={makeApi({ monitoring: vi.fn().mockRejectedValue(new Error("Мониторинг недоступен")) })}
      />,
    );
    expect(await screen.findByText("Мониторинг недоступен")).toBeInTheDocument();
    expect(await screen.findByText("Создано задание")).toBeInTheDocument();
  });
});
