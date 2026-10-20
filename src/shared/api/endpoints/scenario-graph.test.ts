import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../client";
import type { ScenarioGraph } from "../types";
import {
  createGraphScenario,
  getScenarioPermissions,
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
    await expect(publishGraphScenario("s-1", { version: 1, requestId: "r" })).rejects.toBeInstanceOf(ApiError);
    stubFetch(403, { error: { code: "forbidden", message: "Нет права публикации" } });
    await expect(publishGraphScenario("s-1", { version: 1, requestId: "r" })).rejects.toMatchObject({
      status: 403,
      message: "Нет права публикации",
    });
  });
});
