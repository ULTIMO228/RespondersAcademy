import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@/shared/lib";
import type { JournalApi } from "@/widgets/incident-list";
import armCardsJson from "@mocks/fixtures/arm-cards.json";
import referenceJson from "@mocks/reference.json";
import usersJson from "@mocks/users.json";
import type { ArmCardFixtureContract, PublicUser, ReferenceData } from "@/shared/api";

import { JournalScreen } from "./JournalPage";

const STUDENT = (usersJson.users as unknown as PublicUser[]).find(
  (user) => user.id === "u-005",
) as PublicUser;
const FIXTURES = armCardsJson.cards as unknown as ArmCardFixtureContract[];
const NOW = "2026-09-17T11:50:44+03:00";

/** Минимальный клиент мок-слоя: справочники и одна страница карточек; занятий нет. */
const API = {
  getReference: async () => referenceJson as unknown as ReferenceData,
  getCards: async () => ({ items: FIXTURES.slice(0, 3), total: FIXTURES.length, page: 1, perPage: 10 }),
  postCardLinks: async (cardId: string) => ({ cardId, chain: [] }),
  listSessions: async () => [],
  listScenarios: async () => [],
} as unknown as JournalApi;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("JournalPage (/arm) — экран обучающегося", () => {
  it("smoke: шапка с ФИО/АРМ пользователя сессии, лента из мок-слоя, модули", async () => {
    render(
      <JournalScreen
        student={STUDENT}
        nowMs={Date.parse(NOW)}
        deps={{ api: API, storage: createMemoryStorage(), prefersReducedMotion: () => false }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("heading", { level: 1, name: "Поиск происшествий" })).toBeInTheDocument();
    expect(screen.getByText("Четверг, 17 Сентябрь 2026")).toBeInTheDocument();
    expect(screen.getByText(/Иванов С\. П\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "журнал" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("rowgroup")).toHaveLength(3);
    expect(screen.getByText("1-10 из 12")).toBeInTheDocument();
    const modules = screen.getByRole("region", { name: "Мои назначенные модули" });
    expect(within(modules).getByText("Назначенных модулей нет")).toBeInTheDocument();
  });
});
