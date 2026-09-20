import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionWizardApi } from "@/features/session-wizard";
import { cards, reference, scenarios, users } from "@/shared/api";
import type { IncidentCard, PublicUser, Scenario } from "@/shared/api";

import { TeacherSessionScreen } from "./TeacherSessionPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const TEACHER = (users as PublicUser[]).find((user) => user.id === "u-002") as PublicUser;

/** Минимальный клиент мок-слоя: состав группы, справочник, утверждённые сценарии и карточки. */
const API = {
  listUsers: async () => users as PublicUser[],
  getReference: async () => reference,
  listScenarios: async () =>
    (scenarios as Scenario[]).filter((scenario) => scenario.validation.status === "approved"),
  listTrainingCards: async () => cards as IncidentCard[],
  getProfileMapping: async () => [],
  listSessions: async () => [],
} as unknown as SessionWizardApi;

describe("TeacherSessionPage (/teacher/session)", () => {
  it("smoke: шапка с ФИО преподавателя сессии и секции мастера на живых данных", async () => {
    render(<TeacherSessionScreen teacher={TEACHER} api={API} />);
    expect(screen.getByRole("heading", { name: "Настройка занятия", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Морозова Елена Сергеевна/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Группа" })).toBeInTheDocument();
    [
      "Категории событий",
      "Категория вопросов",
      "Сценарии",
      "Режим",
      "Тайминги и критерии",
      "Поток карточек",
      "Старт",
    ].forEach((title) => expect(screen.getByRole("heading", { name: title })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Начать занятие" })).toBeDisabled();
  });
});
