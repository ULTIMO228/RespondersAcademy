import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import { ApiError, ServerRequiredError } from "@/shared/api";
import type { AiHealth, PublicUser } from "@/shared/api";

import type { AiHealthApi } from "../api/aiHealthApi";
import { AiHealthBanner } from "./AiHealthBanner";

const user = (role: PublicUser["role"]) =>
  ({ id: "u1", login: "x", fullName: "Тест", role, armNumber: 1, isActive: true }) as PublicUser;

const DEGRADED: AiHealth = {
  state: "degraded",
  activeSource: "cloud",
  servedBy: "local",
  lastOkAt: null,
  lastErrorAt: "2026-10-20T10:00:00+03:00",
  reason: "invalid_key",
  errorsToday: 3,
  callsToday: 10,
  dailyLimit: 100,
};
const OK: AiHealth = { ...DEGRADED, state: "ok", servedBy: "cloud", reason: null, errorsToday: 3 };

function renderBanner(
  role: PublicUser["role"],
  health: ReturnType<typeof vi.fn>,
  settings?: ReturnType<typeof vi.fn>,
) {
  return render(
    <SessionProvider user={user(role)}>
      <AiHealthBanner
        api={{
          health: health as unknown as AiHealthApi["health"],
          settings: settings as unknown as AiHealthApi["settings"],
        }}
      />
    </SessionProvider>,
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("AiHealthBanner", () => {
  it("администратор видит причину, счётчик и ссылку на настройки ИИ", async () => {
    renderBanner("admin", vi.fn().mockResolvedValue(DEGRADED));
    await act(async () => {});
    expect(screen.getByText(/Ключ не принят провайдером/)).toBeInTheDocument();
    expect(screen.getByText(/ошибок за сутки: 3/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /настройки ИИ/i })).toHaveAttribute("href", "/account/ai");
  });

  it("преподаватель видит краткое сообщение без технических деталей", async () => {
    renderBanner(
      "teacher",
      vi.fn().mockResolvedValue({ ...DEGRADED, reason: undefined, errorsToday: undefined }),
    );
    await act(async () => {});
    expect(screen.getByText("ИИ временно работает в запасном режиме")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/ключ/i)).not.toBeInTheDocument();
  });

  it("обучающийся баннера не видит и состояние не запрашивает", async () => {
    const health = vi.fn().mockResolvedValue(DEGRADED);
    renderBanner("student", health);
    await act(async () => {});
    expect(health).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("при state=ok баннера нет", async () => {
    renderBanner("admin", vi.fn().mockResolvedValue(OK));
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("опрашивает раз в 30 секунд и снимает баннер после восстановления", async () => {
    const health = vi.fn().mockResolvedValueOnce(DEGRADED).mockResolvedValue(OK);
    renderBanner("admin", health);
    await act(async () => {});
    expect(screen.getByText(/Ключ не принят провайдером/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(health).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(health).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Ключ не принят провайдером/)).not.toBeInTheDocument();
  });

  it("без бэкенда (ServerRequiredError) баннер скрыт", async () => {
    renderBanner("admin", vi.fn().mockRejectedValue(new ServerRequiredError()));
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ошибка запроса состояния не показывает баннер и не падает", async () => {
    renderBanner("teacher", vi.fn().mockRejectedValue(new ApiError(500, "internal", "сбой")));
    await act(async () => {});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("при down администратор видит, что ИИ отвечает шаблонами", async () => {
    renderBanner("admin", vi.fn().mockResolvedValue({ ...DEGRADED, state: "down", reason: "local_down" }));
    await act(async () => {});
    expect(screen.getByText(/Локальная модель недоступна/)).toBeInTheDocument();
    expect(screen.getByText(/шаблон/i)).toBeInTheDocument();
  });

  it("администратор без ключа видит подсказку вставить ключ Polza со ссылкой на настройки", async () => {
    const settings = vi.fn().mockResolvedValue({ cloud: { keyConfigured: false } });
    renderBanner("admin", vi.fn().mockResolvedValue(OK), settings);
    await act(async () => {});
    expect(screen.getByText(/ИИ не подключён: вставьте ключ Polza/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /настройки ИИ/i })).toHaveAttribute("href", "/account/ai");
  });

  it("с ключом подсказки нет, а преподавателю она не показывается никогда", async () => {
    const withKey = vi.fn().mockResolvedValue({ cloud: { keyConfigured: true } });
    renderBanner("admin", vi.fn().mockResolvedValue(OK), withKey);
    await act(async () => {});
    expect(screen.queryByText(/ИИ не подключён/)).not.toBeInTheDocument();
    const noKey = vi.fn().mockResolvedValue({ cloud: { keyConfigured: false } });
    renderBanner("teacher", vi.fn().mockResolvedValue(OK), noKey);
    await act(async () => {});
    expect(noKey).not.toHaveBeenCalled();
  });
});
