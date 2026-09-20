import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCardIndex } from "@/features/scenario-builder";
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import { cards, classifier, reference, scenarios } from "@/shared/api";
import type { ProfileMappingRow, Scenario, ScenarioListQuery, TrainingMaterial } from "@/shared/api";

import type { ScenariosApi } from "../api/scenariosApi";
import { TeacherScenariosScreen } from "./TeacherScenariosScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const TEACHER_ID = "u-002";
const cardIndex = buildCardIndex(cards, classifier, (cardId) => TRAINING_CARD_FIXTURE_IDS[cardId]);

const MATERIAL: TrainingMaterial = {
  id: "mat-001",
  name: "Регламент_112.docx",
  format: "DOCX",
  sizeBytes: 188_416,
  uploadedBy: TEACHER_ID,
  uploadedAt: "2026-09-18T11:05:12+03:00",
};

const PROFILE: ProfileMappingRow = {
  id: "mosgaz",
  profile: "Мосгаз (учебный профиль)",
  incidentGroups: ["Запах газа в помещении (в доме, в квартире)"],
  serviceIds: ["svc-104"],
  studentCount: 2,
};

function createApi(overrides: Partial<ScenariosApi> = {}): ScenariosApi {
  return {
    listScenarios: vi.fn(async (query?: ScenarioListQuery) =>
      query?.source ? scenarios.filter((item) => item.source === query.source) : scenarios,
    ),
    getReference: vi.fn(async () => reference),
    listMaterials: vi.fn(async () => [MATERIAL]),
    getProfileMapping: vi.fn(async () => [PROFILE]),
    createScenario: vi.fn(async () => ({ ...scenarios[0], id: "s-037" }) as Scenario),
    generateScenarios: vi.fn(async () => scenarios.filter((item) => item.source === "generated").slice(0, 2)),
    deleteScenario: vi.fn(async () => scenarios[0]),
    uploadMaterial: vi.fn(async () => MATERIAL),
    saveProfileMapping: vi.fn(async () => [PROFILE]),
    checkGrammar: vi.fn(async (text: string) => ({
      data: [
        {
          field: "text",
          fragment: text,
          wrong: "пренято",
          expected: "принято",
          type: "spelling" as const,
        },
      ],
    })),
    ...overrides,
  };
}

async function renderScreen(api: ScenariosApi) {
  render(<TeacherScenariosScreen teacherId={TEACHER_ID} cardIndex={cardIndex} api={api} />);
  await screen.findByRole("table", { name: /Сценарии/ });
}

/** Строки таблицы сценариев (на странице есть ещё таблица профильных категорий). */
function scenarioRows() {
  return within(screen.getByRole("table", { name: /Сценарии/ }))
    .getAllByRole("row")
    .slice(1);
}

beforeEach(() => {
  push.mockClear();
});

describe("Список сценариев на живых данных (T3.1-03, T3.1-04)", () => {
  it("рендерит строки из мок-API: категории, типы ЕКП, бейдж «ИИ» у generated", async () => {
    await renderScreen(createApi());
    const bodyRows = scenarioRows();
    const approved = bodyRows.find((row) => within(row).queryByText("утверждён"));
    expect(within(approved as HTMLElement).getByRole("link", { name: "в занятие" })).toHaveAttribute(
      "href",
      expect.stringContaining("/teacher/session?scenarioId="),
    );
    expect(bodyRows).toHaveLength(scenarios.length);
    const generated = bodyRows.filter((row) => row.querySelector("[data-source='generated']"));
    expect(generated.length).toBeGreaterThan(0);
    generated.forEach((row) => expect(within(row).getByText("ИИ")).toBeInTheDocument());
    expect(screen.getAllByText("утверждён").length).toBeGreaterThan(0);
  });

  it("фильтр по источнику уходит query-параметром в GET /scenarios, сброс возвращает список", async () => {
    const api = createApi();
    await renderScreen(api);
    fireEvent.change(screen.getByLabelText("Источник"), { target: { value: "generated" } });
    await waitFor(() =>
      expect(api.listScenarios).toHaveBeenCalledWith({ source: "generated" }, expect.anything()),
    );
    await waitFor(() =>
      expect(scenarioRows()).toHaveLength(scenarios.filter((item) => item.source === "generated").length),
    );
    fireEvent.click(screen.getByRole("button", { name: "сбросить" }));
    await waitFor(() => expect(scenarioRows()).toHaveLength(scenarios.length));
  });
});

describe("Создание и генерация (T3.1-05, T3.1-06)", () => {
  it("«Создать сценарий» шлёт черновик в мок-слой и открывает редактор", async () => {
    const api = createApi();
    await renderScreen(api);
    fireEvent.click(screen.getByRole("button", { name: "Создать сценарий" }));
    fireEvent.change(screen.getByLabelText("Карточка-шаблон (учебная ситуация)"), {
      target: { value: "c-095" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    await waitFor(() => expect(api.createScenario).toHaveBeenCalled());
    expect(vi.mocked(api.createScenario).mock.calls[0][0]).toMatchObject({
      cardIds: ["c-095"],
      source: "template",
      timeNorms: { primaryReactionSec: 30, fullProcessingSec: 180 },
      sourceTicketNo: 32,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/scenarios/s-037"));
  });

  it("«Сгенерировать (ИИ)» показывает вариации со статусом «на проверке» и бейджем «ИИ»", async () => {
    const api = createApi();
    await renderScreen(api);
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать (ИИ)" }));
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать" }));
    const result = await screen.findByRole("region", { name: "Результат генерации" });
    expect(api.generateScenarios).toHaveBeenCalledWith({
      category: "Дорожно-транспортные происшествия с пострадавшими",
      requestedBy: TEACHER_ID,
    });
    expect(within(result).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(within(result).getAllByText("на проверке").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Удаление с подтверждением (T3.1-17)", () => {
  it("кнопка активна только у неактуальных сценариев, удаление идёт через диалог", async () => {
    const api = createApi();
    await renderScreen(api);
    const buttons = screen.getAllByRole("button", { name: "удалить" });
    expect(buttons.some((button) => button.hasAttribute("disabled"))).toBe(true);
    const enabled = buttons.find((button) => !button.hasAttribute("disabled"));
    fireEvent.click(enabled as HTMLElement);
    expect(screen.getByRole("dialog")).toHaveTextContent("Удалить сценарий?");
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.deleteScenario).toHaveBeenCalled());
    expect(vi.mocked(api.deleteScenario).mock.calls[0][1]).toBe(TEACHER_ID);
  });
});

describe("Материалы и грамматика (T3.1-07, T3.1-08)", () => {
  it("показывает загруженные материалы и отправляет файл-заглушку в мок-слой", async () => {
    const api = createApi();
    await renderScreen(api);
    expect(screen.getByText("Регламент_112.docx")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    const input = screen.getByLabelText("Файл учебного материала (DOCX, PDF, MP3)");
    const file = new File(["x"], "Билеты.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMaterial).toHaveBeenCalled());
    expect(vi.mocked(api.uploadMaterial).mock.calls[0][0]).toMatchObject({
      name: "Билеты.pdf",
      uploadedBy: TEACHER_ID,
    });
  });

  it("«Проверить грамматику» подсвечивает «пренято» и показывает бейдж «ИИ»", async () => {
    const api = createApi();
    const { container } = render(
      <TeacherScenariosScreen teacherId={TEACHER_ID} cardIndex={cardIndex} api={api} />,
    );
    await screen.findByRole("table", { name: /Сценарии/ });
    fireEvent.click(screen.getByRole("button", { name: "Проверить грамматику" }));
    const result = await screen.findByRole("region", { name: "Результат проверки грамматики" });
    expect(container.querySelectorAll("mark").length).toBeGreaterThanOrEqual(1);
    expect(within(result).getByText("ИИ")).toBeInTheDocument();
    expect(result).toHaveTextContent("«пренято» → «принято» — орфография");
  });
});

describe("Профильные категории (T3.1-09)", () => {
  it("теги-мультиселект и «Сохранить привязку» пишут в мок-слой", async () => {
    const api = createApi();
    await renderScreen(api);
    expect(screen.getByText("Мосгаз (учебный профиль)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Добавить группу ЕКП: Мосгаз (учебный профиль)"), {
      target: { value: "Повреждение газопровода" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить привязку" }));
    await waitFor(() => expect(api.saveProfileMapping).toHaveBeenCalled());
    expect(vi.mocked(api.saveProfileMapping).mock.calls[0][0]).toEqual({
      savedBy: TEACHER_ID,
      rows: [
        {
          id: "mosgaz",
          incidentGroups: ["Запах газа в помещении (в доме, в квартире)", "Повреждение газопровода"],
        },
      ],
    });
  });
});
