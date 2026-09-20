import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { scenarios } from "@/shared/api";
import type { Scenario } from "@/shared/api";

import type { ScenarioEditorApi } from "../api/editorApi";
import { buildEditorContext } from "../lib/buildEditorData";
import { buildEditorModel } from "../lib/buildEditorModel";
import { ScenarioEditorScreen } from "./ScenarioEditorScreen";

const TEACHER_ID = "u-002";
const scenario = scenarios.find((candidate) => candidate.id === "s-032") ?? scenarios[0];
const context = buildEditorContext();
const model = buildEditorModel(scenario, context);

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
