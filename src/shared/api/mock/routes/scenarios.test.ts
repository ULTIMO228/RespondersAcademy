// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { POST as validateRoute } from "../../../../../app/api/mock/scenarios/[id]/validate/route";
import { GET as listRoute, POST as createRoute } from "../../../../../app/api/mock/scenarios/route";
import type { ApiErrorBody, Scenario } from "../../types";
import { readScenarios, readUsers } from "../readers";
import { resetMockStore } from "../store";

const TEACHER_ID = "u-002";
const STUDENT_ID = "u-005";

function list(query = ""): Promise<Scenario[]> {
  return listRoute(new Request(`http://localhost/api/mock/scenarios${query}`)).then((response) =>
    response.json(),
  );
}

function create(body: unknown): Promise<Response> {
  return createRoute(
    new Request("http://localhost/api/mock/scenarios", { method: "POST", body: JSON.stringify(body) }),
  );
}

function validate(id: string, body: unknown): Promise<Response> {
  const request = new Request(`http://localhost/api/mock/scenarios/${id}/validate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return validateRoute(request, { params: Promise.resolve({ id }) });
}

function draftBody(): Record<string, unknown> {
  const { id, validation, ...rest } = structuredClone(readScenarios()[0]);
  void id;
  void validation;
  return { ...rest, title: "Новый сценарий" };
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /api/mock/scenarios", () => {
  it("без фильтров — все 36; validationStatus=pending — только pending", async () => {
    expect(await list()).toHaveLength(readScenarios().length);
    const pending = await list("?validationStatus=pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((scenario) => scenario.validation.status === "pending")).toBe(true);
  });

  it("source=generated сохраняет источник; difficulty — множественный повторными ключами", async () => {
    const generated = await list("?source=generated");
    expect(generated.every((scenario) => scenario.source === "generated")).toBe(true);
    const easy = await list("?difficulty=1&difficulty=2");
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.every((scenario) => scenario.difficulty <= 2)).toBe(true);
  });

  it("group — сценарии с карточками группы ЕКП", async () => {
    const fire = await list(`?group=${encodeURIComponent("пожар на улице")}`);
    expect(fire.map((scenario) => scenario.id)).toContain("s-001");
    expect(await list("?group=нет%20группы")).toEqual([]);
  });

  it.each(["?difficulty=7", "?source=ai", "?validationStatus=done"])("мусор %s → 400", async (query) => {
    const response = await listRoute(new Request(`http://localhost/api/mock/scenarios${query}`));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/mock/scenarios + /[id]/validate", () => {
  it("создание → 201 черновик s-037; переходы draft → pending → approved", async () => {
    const response = await create(draftBody());
    expect(response.status).toBe(201);
    const created: Scenario = await response.json();
    expect(created).toMatchObject({ id: "s-037", validation: { status: "draft" }, source: "template" });
    const submitted = await validate(created.id, {
      action: "submit",
      reviewedBy: TEACHER_ID,
      comment: "На проверку",
    });
    expect(((await submitted.json()) as Scenario).validation).toMatchObject({
      status: "pending",
      comment: "На проверку",
    });
    const approved: Scenario = await (
      await validate(created.id, { action: "approve", reviewedBy: TEACHER_ID })
    ).json();
    expect(approved.validation).toEqual({ status: "approved", reviewedBy: TEACHER_ID });
    expect((await list("?validationStatus=approved")).map((scenario) => scenario.id)).toContain(created.id);
  });

  it("approve из draft недоступен → 409 invalidTransition", async () => {
    const created: Scenario = await (await create(draftBody())).json();
    const response = await validate(created.id, { action: "approve", reviewedBy: TEACHER_ID });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("invalidTransition");
  });

  it("s-033 (pending) approve → approved, reviewedBy есть в users.json", async () => {
    const body: Scenario = await (
      await validate("s-033", { action: "approve", reviewedBy: TEACHER_ID })
    ).json();
    expect(body.validation.status).toBe("approved");
    expect(readUsers().some((user) => user.id === body.validation.reviewedBy)).toBe(true);
    expect(body.source).toBe("generated");
  });

  it("pending → rejected с комментарием; approvePartial сохраняет fields", async () => {
    const rejected: Scenario = await (
      await validate("s-034", { action: "reject", reviewedBy: TEACHER_ID, comment: "Неверный эталон" })
    ).json();
    expect(rejected.validation).toMatchObject({ status: "rejected", comment: "Неверный эталон" });
    const fields = ["expectedActions", "keyPhrases"];
    const partial: Scenario = await (
      await validate("s-035", { action: "approvePartial", reviewedBy: TEACHER_ID, fields })
    ).json();
    expect(partial.validation).toMatchObject({ status: "approved", approvedFields: fields });
    expect((await validate("s-036", { action: "approvePartial", reviewedBy: TEACHER_ID })).status).toBe(400);
  });

  it("неизвестный id → 404; reviewedBy не-преподаватель → 400; кривой черновик → 400", async () => {
    expect((await validate("s-999", { action: "approve", reviewedBy: TEACHER_ID })).status).toBe(404);
    expect((await validate("s-033", { action: "approve", reviewedBy: STUDENT_ID })).status).toBe(400);
    expect((await create({ ...draftBody(), cardIds: ["c-999"] })).status).toBe(400);
    expect((await create({ ...draftBody(), difficulty: 9 })).status).toBe(400);
  });
});
