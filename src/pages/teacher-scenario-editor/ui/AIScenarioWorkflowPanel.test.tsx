import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AIScenarioVersion } from "@/shared/api";

import type { ScenarioEditorApi } from "../api/editorApi";
import { AIScenarioWorkflowPanel } from "./AIScenarioWorkflowPanel";

const draft: AIScenarioVersion = {
  schemaVersion: "ai-workflow/1",
  scenarioId: "s-ai-001",
  version: 1,
  mode: "operator112",
  sourceTicketId: "t-1",
  sourceSituationNo: 1,
  sourceKind: "ticket",
  sourceHash: "a".repeat(64),
  validation: "passed",
  validationErrors: [],
  approval: "draft",
  cardSnapshot: { id: "c-ai-001", fields: { summary: "Фабула" } },
  etalonVersion: "e1",
  ruleSourceIds: [],
  semanticFacts: [],
  classifierVersion: "v1",
  etalon: {
    expectedFields: {},
    expectedActions: [],
    semanticFacts: [],
    ruleSourceIds: [],
    classifierVersion: "v1",
  },
  fieldDecisions: [],
  generation: { provider: "ollama:qwen2.5:7b-instruct", durationMs: 12_300 },
};

function renderPanel(create: ScenarioEditorApi["createAIScenarioDrafts"]) {
  const api = {
    listAIScenarioVersions: vi.fn().mockResolvedValue([]),
    createAIScenarioDrafts: create,
  } as unknown as ScenarioEditorApi;
  render(<AIScenarioWorkflowPanel scenarioId="s-1" category="Дерево" api={api} />);
  return api;
}

describe("AIScenarioWorkflowPanel: способ генерации", () => {
  it("передаёт выбранный способ и показывает провайдера и время генерации", async () => {
    const create = vi.fn().mockResolvedValue([draft]);
    const api = renderPanel(create);
    await waitFor(() => expect(api.listAIScenarioVersions).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Идентификатор очищенного билета"), { target: { value: "t-1" } });
    fireEvent.change(screen.getByLabelText("Генерация"), { target: { value: "ai" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));

    await waitFor(() => expect(screen.getByTestId("ai-generation-result")).toBeTruthy());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ generator: "ai" }));
    expect(screen.getByTestId("ai-generation-result").textContent).toContain(
      "ИИ: локальная модель qwen2.5:7b-instruct",
    );
    expect(screen.getByTestId("ai-generation-result").textContent).toContain("12.3 с");
  });

  it("при ошибке ИИ показывает сообщение и не выдаёт результат за успех", async () => {
    const create = vi.fn().mockRejectedValue(new Error("ИИ недоступен: Ollama не настроен"));
    renderPanel(create);

    fireEvent.change(screen.getByLabelText("Идентификатор очищенного билета"), { target: { value: "t-1" } });
    fireEvent.change(screen.getByLabelText("Генерация"), { target: { value: "ai" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("ИИ недоступен"));
    expect(screen.queryByTestId("ai-generation-result")).toBeNull();
  });
});
