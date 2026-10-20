import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scenarios } from "@/shared/api";
import type { AIScenarioVersion, Scenario } from "@/shared/api";

import type { ScenarioEditorApi } from "../api/editorApi";
import { buildEditorContext } from "../lib/buildEditorData";
import { buildEditorModel } from "../lib/buildEditorModel";
import { ScenarioEditorScreen } from "./ScenarioEditorScreen";

const navigation = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

beforeEach(() => {
  navigation.push.mockClear();
  navigation.search = "";
});

const TEACHER_ID = "u-002";
const scenario = scenarios.find((candidate) => candidate.id === "s-032") ?? scenarios[0];
const context = buildEditorContext();
const model = buildEditorModel(scenario, context);

const aiVersion: AIScenarioVersion = {
  schemaVersion: "ai-workflow/1",
  scenarioId: "s-ai-001",
  version: 1,
  mode: "operator112",
  sourceTicketId: "ticket-synthetic-1",
  sourceSituationNo: 1,
  sourceKind: "ticket",
  sourceHash: "a".repeat(64),
  validation: "passed",
  validationErrors: [],
  approval: "draft",
  cardSnapshot: {
    id: "c-ai-001",
    fields: {
      summary: "Сильный ветер повалил дерево",
      group: "Дерево",
      address: "Москва, Чертановская улица, 58",
    },
  },
  etalonVersion: "s-ai-001:etalon:1",
  ruleSourceIds: ["ticket:synthetic"],
  semanticFacts: [],
  classifierVersion: "classifier-test",
  etalon: {
    expectedFields: { group: "Дерево" },
    expectedActions: [{ action: "submit", sourceRef: ["ticket:synthetic"] }],
    semanticFacts: [],
    ruleSourceIds: ["ticket:synthetic"],
    classifierVersion: "classifier-test",
  },
  fieldDecisions: [
    {
      fieldPath: "summary",
      decision: "edited",
      teacherId: TEACHER_ID,
      at: "2026-09-24T10:00:00Z",
      comment: "Уточнена фабула",
    },
  ],
};

function createApi(overrides: Partial<ScenarioEditorApi> = {}): ScenarioEditorApi {
  return {
    getScenario: vi.fn(async () => structuredClone(scenario) as Scenario),
    updateScenario: vi.fn(async (_id: string, body) => ({ ...scenario, ...body }) as Scenario),
    validateScenario: vi.fn(
      async (_id: string, body) =>
        ({
          ...scenario,
          validation: {
            status: body.action === "reject" ? "rejected" : body.action === "submit" ? "pending" : "approved",
            reviewedBy: body.reviewedBy,
            ...(body.comment ? { comment: body.comment } : {}),
            ...(body.fields ? { approvedFields: body.fields } : {}),
          },
        }) as Scenario,
    ),
    generateScenarios: vi.fn(async () => []),
    checkGrammar: vi.fn(async () => ({ data: [] })),
    listAIScenarioVersions: vi.fn(async () => []),
    createAIScenarioDrafts: vi.fn(async () => []),
    getScenarioPermissions: vi.fn(async () => ({ permissions: [] })),
    listScenarioSources: vi.fn(async () => []),
    validateScenarioGraph: vi.fn(async () => ({ valid: true, errors: [] })),
    createGraphScenario: vi.fn(async () => aiVersion),
    reviseGraphScenario: vi.fn(async () => aiVersion),
    submitGraphScenario: vi.fn(async () => aiVersion),
    reviewGraphScenario: vi.fn(async () => aiVersion),
    publishGraphScenario: vi.fn(async () => aiVersion),
    deriveGraphScenarioVersion: vi.fn(async () => aiVersion),
    listScenarioRuns: vi.fn(async () => []),
    reviseAIScenario: vi.fn(async () => aiVersion),
    approveAIScenario: vi.fn(async () => ({
      ...aiVersion,
      approval: "approved" as const,
      approvedBy: TEACHER_ID,
    })),
    ...overrides,
  };
}

async function renderEditor(api: ScenarioEditorApi = createApi()) {
  const result = render(
    <ScenarioEditorScreen
      scenarioId={scenario.id}
      teacherId={TEACHER_ID}
      reviewerName="Морозова Е. С."
      context={context}
      api={api}
    />,
  );
  await screen.findByRole("heading", { name: scenario.title });
  return { ...result, api };
}

describe("Редактор сценария s-032: параметры и карточка-основа (T3.1-10, T3.1-11)", () => {
  it("параметры приходят из мок-слоя, дефолты таймингов 30/180 подписаны", async () => {
    await renderEditor();
    expect(screen.getByLabelText("Название")).toHaveValue(scenario.title);
    expect(screen.getByLabelText("Норматив первичной реакции, сек")).toHaveValue(30);
    expect(screen.getByLabelText("Норматив полной отработки, сек")).toHaveValue(180);
    expect(screen.getByText("по умолчанию 30 сек")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: String(scenario.difficulty) })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("сохранение параметров уходит PATCH-ом с userId преподавателя", async () => {
    const { api } = await renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    fireEvent.change(screen.getByLabelText("Норматив первичной реакции, сек"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить параметры" }));
    await waitFor(() => expect(api.updateScenario).toHaveBeenCalled());
    expect(vi.mocked(api.updateScenario).mock.calls[0][1]).toMatchObject({
      difficulty: 2,
      timeNorms: { primaryReactionSec: 45, fullProcessingSec: 180 },
      updatedBy: TEACHER_ID,
    });
  });

  it("тайминг ≤ 0 блокирует сохранение и показывает ошибку диапазона", async () => {
    const { api } = await renderEditor();
    fireEvent.change(screen.getByLabelText("Норматив полной отработки, сек"), { target: { value: "0" } });
    expect(screen.getByText("Норматив отработки — больше 0 секунд")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить параметры" })).toBeDisabled();
    expect(api.updateScenario).not.toHaveBeenCalled();
  });

  it("карточка-основа — тот же виджет карточки курсанта, read-only", async () => {
    await renderEditor();
    const preview = screen.getByRole("group", { name: "Предпросмотр карточки-основы" });
    expect(preview).toBeDisabled();
    expect(within(preview).getAllByText(/36814850/).length).toBeGreaterThan(0);
  });
});

describe("Эталон и предпросмотр вопросов (T3.1-12, T3.1-13)", () => {
  it("ключевые фразы подсвечены, действия эталона — в порядке мока", async () => {
    const { container } = await renderEditor();
    expect(container.querySelectorAll("[data-key-phrase]").length).toBeGreaterThanOrEqual(
      scenario.etalon.keyPhrases.length,
    );
    expect(screen.getAllByText(/Звонок точке C: 103/).length).toBeGreaterThan(0);
    expect(screen.getByText("Текст поля «Действие диспетчера»")).toBeInTheDocument();
  });

  it("критерии успешности сохраняются PATCH-ом", async () => {
    const { api } = await renderEditor();
    const threshold = screen.getByLabelText("Допустимо грамматических ошибок, не более");
    expect(threshold).toHaveValue(scenario.successCriteria.maxGrammarErrors);
    fireEvent.change(threshold, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить критерии" }));
    await waitFor(() => expect(api.updateScenario).toHaveBeenCalled());
    expect(vi.mocked(api.updateScenario).mock.calls[0][1].successCriteria).toMatchObject({
      maxGrammarErrors: 3,
    });
  });

  it("отрицательный порог блокирует сохранение критериев", async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText("Допустимо грамматических ошибок, не более"), {
      target: { value: "-1" },
    });
    expect(screen.getByText("Порог — целое число не меньше 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить критерии" })).toBeDisabled();
  });
});

describe("Коррекция и валидация (T3.1-14, T3.1-15)", () => {
  it("частичное утверждение отправляет выбранные поля эталона", async () => {
    const { api } = await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Утвердить частично" }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(model.validationFields.length);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить выбор" }));
    await waitFor(() => expect(api.validateScenario).toHaveBeenCalled());
    const body = vi.mocked(api.validateScenario).mock.calls[0][1];
    expect(body.action).toBe("approvePartial");
    expect(body.reviewedBy).toBe(TEACHER_ID);
    expect(body.fields).toHaveLength(model.validationFields.length - 1);
    expect(
      await screen.findByText(
        `частично: ${model.validationFields.length - 1} из ${model.validationFields.length} полей эталона`,
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it("«Утвердить полностью» и «Отклонить» шлют решение с reviewedBy преподавателя", async () => {
    const { api } = await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Утвердить полностью" }));
    await waitFor(() => expect(api.validateScenario).toHaveBeenCalled());
    expect(vi.mocked(api.validateScenario).mock.calls[0][1]).toMatchObject({
      action: "approve",
      reviewedBy: TEACHER_ID,
    });
    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(vi.mocked(api.validateScenario).mock.calls).toHaveLength(2));
    expect(vi.mocked(api.validateScenario).mock.calls[1][1]).toMatchObject({ action: "reject" });
  });

  it("коррекция уводит сценарий в «на проверке», комментарий сохранён и запускает перегенерацию", async () => {
    const { api } = await renderEditor();
    fireEvent.change(screen.getByLabelText("Текст комментария"), {
      target: { value: "Добавить 101 обязательно" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить на доработку" }));
    await waitFor(() => expect(api.validateScenario).toHaveBeenCalled());
    const body = vi.mocked(api.validateScenario).mock.calls[0][1];
    expect(body.action).toBe("submit");
    expect(body.comment).toContain("Добавить 101 обязательно");
    await waitFor(() => expect(api.generateScenarios).toHaveBeenCalled());
    const corrections = await screen.findByRole("list", { name: "Комментарии коррекции" });
    expect(corrections).toHaveTextContent("Добавить 101 обязательно");
    expect(screen.getAllByText("на проверке").length).toBeGreaterThan(0);
  });
});

describe("Сценарий не найден", () => {
  it("показывает сообщение мок-слоя и ссылку к списку", async () => {
    render(
      <ScenarioEditorScreen
        scenarioId="s-999"
        teacherId={TEACHER_ID}
        reviewerName="Морозова Е. С."
        context={context}
        api={createApi({
          getScenario: vi.fn(async () => {
            throw new Error("Сценарий «s-999» не найден");
          }),
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Сценарий «s-999» не найден");
    expect(screen.getByRole("link", { name: "К списку сценариев" })).toBeInTheDocument();
  });
});

describe("Версии AI-workflow (US1)", () => {
  it("показывает решения по полям и ошибки проверки из истории версии", async () => {
    const version = {
      ...aiVersion,
      validation: "failed" as const,
      validationErrors: [
        { fieldPath: "address", code: "address_not_in_directory", message: "Адрес не найден" },
      ],
    };
    await renderEditor(createApi({ listAIScenarioVersions: vi.fn(async () => [version]) }));

    expect(await screen.findByText("address: Адрес не найден")).toBeInTheDocument();
    expect(screen.getByText(/summary — edited · Уточнена фабула/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Утвердить версию" })).not.toBeInTheDocument();
  });

  it("создаёт черновик из указанного очищенного источника и даёт утвердить проверенную версию", async () => {
    const listAIScenarioVersions = vi.fn(async (id: string) =>
      id === aiVersion.scenarioId ? [aiVersion] : [],
    );
    const createAIScenarioDrafts = vi.fn(async () => [aiVersion]);
    const approveAIScenario = vi.fn(async () => ({
      ...aiVersion,
      approval: "approved" as const,
      approvedBy: TEACHER_ID,
    }));
    const { api } = await renderEditor(
      createApi({ listAIScenarioVersions, createAIScenarioDrafts, approveAIScenario }),
    );

    fireEvent.change(screen.getByLabelText("Идентификатор очищенного билета"), {
      target: { value: "ticket-synthetic-1" },
    });
    fireEvent.change(screen.getByLabelText("Категория ЕКП"), { target: { value: "Дерево" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(await screen.findByRole("link", { name: "Открыть сценарий s-ai-001" })).toBeInTheDocument();
    expect(vi.mocked(api.createAIScenarioDrafts).mock.calls[0][0]).toMatchObject({
      mode: "operator112",
      sourceTicketId: "ticket-synthetic-1",
      category: "Дерево",
      count: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "Утвердить версию" }));
    await waitFor(() =>
      expect(approveAIScenario).toHaveBeenCalledWith("s-ai-001", expect.objectContaining({ version: 1 })),
    );
    expect(await screen.findByText("Версия 1 утверждена")).toBeInTheDocument();
  });

  it("сохраняет частичную правку отдельной новой версией", async () => {
    const revised = {
      ...aiVersion,
      version: 2,
      parentVersion: 1,
      cardSnapshot: {
        ...aiVersion.cardSnapshot,
        fields: { ...aiVersion.cardSnapshot.fields, summary: "Исправленная фабула" },
      },
    };
    const reviseAIScenario = vi.fn(async () => revised);
    await renderEditor(
      createApi({ listAIScenarioVersions: vi.fn(async () => [aiVersion]), reviseAIScenario }),
    );

    fireEvent.change(await screen.findByLabelText("Фабула карточки"), {
      target: { value: "Исправленная фабула" },
    });
    fireEvent.change(screen.getByLabelText("Комментарий преподавателя"), { target: { value: "Уточнение" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить правку фабулы" }));
    await waitFor(() =>
      expect(reviseAIScenario).toHaveBeenCalledWith(
        "s-ai-001",
        expect.objectContaining({
          baseVersion: 1,
          comment: "Уточнение",
          acceptedFields: [{ fieldPath: "summary", decision: "edited", value: "Исправленная фабула" }],
        }),
      ),
    );
    expect(await screen.findByText("Версия 2 · operator112")).toBeInTheDocument();
  });
});

describe("Проверка ручного текста версии (US3)", () => {
  const typoSummary = "Сильный ветер повалил дерево, бригадда направлена";
  const issue = {
    field: "summary",
    fragment: "дерево, бригадда",
    wrong: "бригадда",
    expected: "бригада",
    type: "spelling" as const,
    scenarioId: aiVersion.scenarioId,
    scenarioVersion: 1,
  };
  const typoVersion: AIScenarioVersion = {
    ...aiVersion,
    cardSnapshot: {
      ...aiVersion.cardSnapshot,
      fields: { ...aiVersion.cardSnapshot.fields, summary: typoSummary },
    },
  };

  async function renderWithVersion(overrides: Partial<ScenarioEditorApi> = {}) {
    const result = await renderEditor(
      createApi({ listAIScenarioVersions: vi.fn(async () => [typoVersion]), ...overrides }),
    );
    const summary = await screen.findByLabelText("Фабула карточки");
    return { ...result, summary };
  }

  it("показывает замечание с полем, фрагментом и версией, не меняя текст", async () => {
    const checkGrammar = vi.fn(async () => ({ data: [issue] }));
    const { summary } = await renderWithVersion({ checkGrammar });

    fireEvent.click(screen.getByRole("button", { name: "Проверить текст" }));
    const list = await screen.findByRole("list", { name: "Замечания к тексту" });
    expect(checkGrammar).toHaveBeenCalledWith(typoSummary, "summary", {
      scenarioId: "s-ai-001",
      scenarioVersion: 1,
    });
    expect(list).toHaveTextContent(
      "summary: «бригадда» → «бригада» — орфография · фрагмент «дерево, бригадда»",
    );
    expect(screen.getByText(/Фабула карточки, версия 1: замечаний 1/)).toBeInTheDocument();
    expect(summary).toHaveValue(typoSummary);
  });

  it("после правки текста результат помечается устаревшим, повторная проверка берёт новый текст", async () => {
    const checkGrammar = vi
      .fn<ScenarioEditorApi["checkGrammar"]>()
      .mockResolvedValueOnce({ data: [issue] })
      .mockResolvedValueOnce({ data: [] });
    const { summary } = await renderWithVersion({ checkGrammar });

    fireEvent.click(screen.getByRole("button", { name: "Проверить текст" }));
    await screen.findByRole("list", { name: "Замечания к тексту" });
    const fixed = "Сильный ветер повалил дерево, бригада направлена";
    fireEvent.change(summary, { target: { value: fixed } });
    expect(screen.getByText("Текст изменён после проверки — проверьте повторно")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Проверить повторно" }));
    expect(await screen.findByText("Замечаний к тексту нет")).toBeInTheDocument();
    expect(checkGrammar).toHaveBeenLastCalledWith(fixed, "summary", {
      scenarioId: "s-ai-001",
      scenarioVersion: 1,
    });
    expect(screen.queryByText("Текст изменён после проверки — проверьте повторно")).not.toBeInTheDocument();
  });

  it("новая версия после сохранения правки требует повторной проверки именно этой версии", async () => {
    const fixed = "Сильный ветер повалил дерево, бригада направлена";
    const revised: AIScenarioVersion = {
      ...typoVersion,
      version: 2,
      parentVersion: 1,
      cardSnapshot: {
        ...typoVersion.cardSnapshot,
        fields: { ...typoVersion.cardSnapshot.fields, summary: fixed },
      },
    };
    const checkGrammar = vi
      .fn<ScenarioEditorApi["checkGrammar"]>()
      .mockResolvedValueOnce({ data: [issue] })
      .mockResolvedValueOnce({ data: [] });
    const { summary } = await renderWithVersion({
      checkGrammar,
      reviseAIScenario: vi.fn(async () => revised),
    });

    fireEvent.click(screen.getByRole("button", { name: "Проверить текст" }));
    await screen.findByRole("list", { name: "Замечания к тексту" });
    fireEvent.change(summary, { target: { value: fixed } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить правку фабулы" }));
    expect(
      await screen.findByText("Результат относится к версии 1 — проверьте текст версии 2 повторно"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Проверить повторно" }));
    expect(await screen.findByText("Замечаний к тексту нет")).toBeInTheDocument();
    expect(checkGrammar).toHaveBeenLastCalledWith(fixed, "summary", {
      scenarioId: "s-ai-001",
      scenarioVersion: 2,
    });
  });

  it("ошибка сервера (устаревшая версия) показывается, пустой текст не проверяется", async () => {
    const checkGrammar = vi.fn(async () => {
      throw new Error("Текст относится к версии 1, текущая версия сценария — 2; повторите проверку");
    });
    const { summary } = await renderWithVersion({ checkGrammar });

    fireEvent.click(screen.getByRole("button", { name: "Проверить текст" }));
    expect(await screen.findByText(/текущая версия сценария — 2/)).toHaveAttribute("role", "alert");

    fireEvent.change(summary, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Проверить текст" })).toBeDisabled();
  });
});

describe("Вкладка «Граф» редактора сценария (спека 005, этап S4)", () => {
  it("по умолчанию открыт «Сценарий»; граф не грузится, пока вкладку не открыли", async () => {
    const { api } = await renderEditor();
    expect(screen.getByRole("tab", { name: "Сценарий" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Название")).toBeVisible();
    expect(api.getScenarioPermissions).not.toHaveBeenCalled();
  });

  it("у сценария с AI-версией с графом вкладка открывает последнюю версию на холсте", async () => {
    const graphVersion: AIScenarioVersion = {
      ...aiVersion,
      graph: {
        schemaVersion: "scenario-graph/1",
        start: "a",
        nodes: [
          { id: "a", type: "action", title: "Приём", action: "x", next: "b" },
          { id: "b", type: "end", outcome: "completed", score: 100, passed: true },
        ],
      },
    };
    const { api } = await renderEditor(
      createApi({ listAIScenarioVersions: vi.fn(async () => [graphVersion]) }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Граф" }));
    expect(await screen.findByRole("group", { name: "Холст графа сценария, блоков: 2" })).toBeVisible();
    expect(api.getScenarioPermissions).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Сценарий" }));
    expect(screen.getByLabelText("Название")).toBeVisible();
  });

  it("у сценария без графа вкладка предлагает форму создания; сбой источников не ломает страницу", async () => {
    await renderEditor(
      createApi({
        listScenarioSources: vi.fn(async () => [
          { sourceTicketId: "t-1", situationNo: 1, preview: "Дерево" },
        ]),
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Граф" }));
    expect(await screen.findByText("У сценария ещё нет графа")).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: "Создание графа сценария" })).toBeInTheDocument();
  });

  it("ошибка загрузки версий показана внутри вкладки, остальные секции работают", async () => {
    await renderEditor(
      createApi({
        listAIScenarioVersions: vi.fn(async () => {
          throw new Error("Сервис версий недоступен");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Граф" }));
    expect((await screen.findAllByText(/Сервис версий недоступен/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Сценарий" }));
    expect(screen.getByLabelText("Название")).toHaveValue(scenario.title);
  });

  it("параметр ?tab=graph открывает вкладку «Граф» сразу", async () => {
    navigation.search = "tab=graph";
    const { api } = await renderEditor();
    expect(screen.getByRole("tab", { name: "Граф" })).toHaveAttribute("aria-selected", "true");
    await screen.findByText("У сценария ещё нет графа");
    expect(api.getScenarioPermissions).toHaveBeenCalled();
  });

  it("после создания графа открывается страница нового сценария с вкладкой «Граф»", async () => {
    const created = { ...aiVersion, scenarioId: "s-ai-777", graph: undefined };
    const { api } = await renderEditor(
      createApi({
        listScenarioSources: vi.fn(async () => [
          { sourceTicketId: "t-1", situationNo: 1, preview: "Дерево" },
        ]),
        createGraphScenario: vi.fn(async () => created as AIScenarioVersion),
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Граф" }));
    await screen.findByRole("form", { name: "Создание графа сценария" });
    await screen.findByRole("option", { name: /Дерево/ });
    fireEvent.change(screen.getByLabelText("Источник (очищенный билет)"), { target: { value: "t-1" } });
    fireEvent.change(screen.getByLabelText("Краткое описание ситуации"), {
      target: { value: "Упало дерево" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать граф" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith("/teacher/scenarios/s-ai-777?tab=graph"),
    );
    expect(api.createGraphScenario).toHaveBeenCalledTimes(1);
  });
});
