import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../client";
import type { ScenarioGraph } from "../types";
import {
  createGraphScenario,
  deriveGraphScenarioVersion,
  finishScenarioRun,
  getScenarioPermissions,
  getScenarioRun,
  listAssignedScenarios,
  listScenarioRuns,
  performScenarioAction,
  startScenarioRun,
  listGraphScenarios,
  publishGraphScenario,
  reviseGraphScenario,
  validateScenarioGraph,
} from "./scenario-graph";

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>) {
  const [input, init] = fetchMock.mock.calls[0];
  return {
    url: new URL(String(input), "http://localhost"),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

const graph: ScenarioGraph = {
  schemaVersion: "scenario-graph/1",
  start: "n1",
  nodes: [{ id: "n1", type: "end", outcome: "completed", score: 100, passed: true }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("клиент графа сценариев /api/v1/ai/scenarios", () => {
  it("права и список — GET с query-параметрами", async () => {
    const permissions = stubFetch(200, { permissions: ["scenario.review"] });
    expect(await getScenarioPermissions()).toEqual({ permissions: ["scenario.review"] });
    expect(sent(permissions).url.pathname).toBe("/api/v1/ai/scenarios/permissions");
    const list = stubFetch(200, []);
    await listGraphScenarios({ mode: "dds", approval: "draft" });
    expect(Object.fromEntries(sent(list).url.searchParams)).toEqual({ mode: "dds", approval: "draft" });
  });

  it("validate, create, revise, publish — POST с телом на свои пути", async () => {
    const validate = stubFetch(200, { valid: true, errors: [] });
    await validateScenarioGraph(graph);
    expect(sent(validate)).toMatchObject({ method: "POST", body: { graph } });
    expect(sent(validate).url.pathname).toBe("/api/v1/ai/scenarios/graph/validate");

    const create = stubFetch(201, {});
    await createGraphScenario({
      mode: "operator112",
      sourceTicketId: "t",
      category: "Дерево",
      summary: "s",
      graph,
      requestId: "r1",
    });
    expect(sent(create).url.pathname).toBe("/api/v1/ai/scenarios");

    const revise = stubFetch(201, {});
    await reviseGraphScenario("s/ai 1", { baseVersion: 1, graph, requestId: "r2" });
    expect(sent(revise).url.pathname).toBe("/api/v1/ai/scenarios/s%2Fai%201/revise");

    const publish = stubFetch(200, {});
    await publishGraphScenario("s-1", { version: 2, requestId: "r3" });
    expect(sent(publish).url.pathname).toBe("/api/v1/ai/scenarios/s-1/publish");
  });

  it("403 бэкенда превращается в ApiError с русским сообщением", async () => {
    stubFetch(403, { error: { code: "forbidden", message: "Нет права публикации" } });
    await expect(publishGraphScenario("s-1", { version: 1, requestId: "r" })).rejects.toBeInstanceOf(
      ApiError,
    );
    stubFetch(403, { error: { code: "forbidden", message: "Нет права публикации" } });
    await expect(publishGraphScenario("s-1", { version: 1, requestId: "r" })).rejects.toMatchObject({
      status: 403,
      message: "Нет права публикации",
    });
  });
});

describe("клиент прохождения и derive", () => {
  it("derive — POST на путь версии с requestId и комментарием", async () => {
    const fetchMock = stubFetch(201, { version: 3 });
    await deriveGraphScenarioVersion("s-1", 2, { requestId: "r-1", comment: "правка" });
    const call = sent(fetchMock);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/api/v1/ai/scenarios/s-1/versions/2/derive");
    expect(call.body).toEqual({ requestId: "r-1", comment: "правка" });
  });

  it("derive: 409 приходит ApiError с сообщением сервера", async () => {
    stubFetch(409, { error: { code: "conflict", message: "Уже есть неопубликованная версия" } });
    await expect(deriveGraphScenarioVersion("s-1", 2, { requestId: "r" })).rejects.toMatchObject({
      status: 409,
      message: "Уже есть неопубликованная версия",
    });
  });

  it("назначенные сценарии, запуск, чтение, действие и завершение — свои пути", async () => {
    const assigned = stubFetch(200, []);
    await listAssignedScenarios();
    expect(sent(assigned).url.pathname).toBe("/api/v1/ai/scenario-assignments");
    const start = stubFetch(201, {});
    await startScenarioRun("s-1", 2);
    expect(sent(start).method).toBe("POST");
    expect(sent(start).url.pathname).toBe("/api/v1/ai/scenarios/s-1/versions/2/runs");
    const read = stubFetch(200, {});
    await getScenarioRun("run 1");
    expect(sent(read).url.pathname).toBe("/api/v1/ai/scenario-runs/run%201");
    const act = stubFetch(200, {});
    await performScenarioAction("run-1", { action: "a", expectedSteps: 1, choice: "x" });
    expect(sent(act).url.pathname).toBe("/api/v1/ai/scenario-runs/run-1/actions");
    expect(sent(act).body).toEqual({ action: "a", expectedSteps: 1, choice: "x" });
    const fin = stubFetch(200, {});
    await finishScenarioRun("run-1");
    expect(sent(fin).url.pathname).toBe("/api/v1/ai/scenario-runs/run-1/finish");
  });

  it("список прогонов — GET с scenarioId в query", async () => {
    const fetchMock = stubFetch(200, []);
    await listScenarioRuns({ scenarioId: "s-1" });
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/ai/scenario-runs");
    expect(sent(fetchMock).url.searchParams.get("scenarioId")).toBe("s-1");
  });
});
