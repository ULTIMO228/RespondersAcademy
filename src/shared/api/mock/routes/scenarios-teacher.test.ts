// @vitest-environment node
/* Конструктор сценариев (фаза 3.1): PATCH/DELETE сценария, генерация ИИ, материалы, привязка, грамматика. */
import { beforeEach, describe, expect, it } from "vitest";

import { POST as grammarRoute } from "../../../../../app/api/mock/grammar-check/route";
import { GET as materialsRoute, POST as uploadRoute } from "../../../../../app/api/mock/materials/route";
import {
  GET as mappingRoute,
  PUT as saveMappingRoute,
} from "../../../../../app/api/mock/profile-mapping/route";
import { POST as generateRoute } from "../../../../../app/api/mock/scenarios/generate/route";
import {
  DELETE as deleteRoute,
  GET as scenarioRoute,
  PATCH as patchRoute,
} from "../../../../../app/api/mock/scenarios/[id]/route";
import { POST as validateRoute } from "../../../../../app/api/mock/scenarios/[id]/validate/route";
import { GET as listRoute } from "../../../../../app/api/mock/scenarios/route";
import { GET as trainingCardsRoute } from "../../../../../app/api/mock/training-cards/route";
import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import type { AiResponse } from "../../ai-gateway";
import type { GrammarError, ProfileMappingRow, Scenario } from "../../types";
import type { AuditLogEntry, IncidentCard, PageResponse, TrainingMaterial } from "../../types";
import { getScenarioDeleteBlock } from "../scenarios";
import { resetMockStore } from "../store";

const AUDIT_URL = "http://localhost/api/mock/admin/audit";

const TEACHER_ID = "u-002";
const STUDENT_ID = "u-005";
const GENERATED_SCENARIO_ID = "s-033";
const TEMPLATE_SCENARIO_ID = "s-032";
const GAS_GROUP = "Запах газа в помещении (в доме, в квартире)";

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, { method, body: JSON.stringify(body) });
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function listScenarios(query = ""): Promise<Scenario[]> {
  const response = await listRoute(new Request(`http://localhost/api/mock/scenarios${query}`));
  return response.json();
}

/** GET /admin/audit отдаёт страницу `{ items, total, page, perPage }` (T4.2-05). */
async function audit(): Promise<AuditLogEntry[]> {
  const response = await auditRoute(new Request(AUDIT_URL));
  const page: PageResponse<AuditLogEntry> = await response.json();
  return page.items;
}

beforeEach(() => {
  resetMockStore();
});

describe("GET/PATCH /api/mock/scenarios/[id]", () => {
  it("GET отдаёт сценарий, неизвестный id → 404", async () => {
    const response = await scenarioRoute(
      new Request(`http://localhost/api/mock/scenarios/${TEMPLATE_SCENARIO_ID}`),
      withId(TEMPLATE_SCENARIO_ID),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as Scenario).id).toBe(TEMPLATE_SCENARIO_ID);
    const missing = await scenarioRoute(
      new Request("http://localhost/api/mock/scenarios/s-999"),
      withId("s-999"),
    );
    expect(missing.status).toBe(404);
  });

  it("PATCH сохраняет сложность и тайминги, пересчитывает level и пишет аудит", async () => {
    const response = await patchRoute(
      jsonRequest(`http://localhost/api/mock/scenarios/${TEMPLATE_SCENARIO_ID}`, "PATCH", {
        difficulty: 2,
        timeNorms: { primaryReactionSec: 45, fullProcessingSec: 240 },
        mode: "follow",
        updatedBy: TEACHER_ID,
      }),
      withId(TEMPLATE_SCENARIO_ID),
    );
    expect(response.status).toBe(200);
    const updated = (await response.json()) as Scenario;
    expect(updated).toMatchObject({
      difficulty: 2,
      level: "beginner",
      mode: "follow",
      timeNorms: { primaryReactionSec: 45, fullProcessingSec: 240 },
    });
    const fromList = (await listScenarios()).find((item) => item.id === TEMPLATE_SCENARIO_ID);
    expect(fromList?.difficulty).toBe(2);
    expect((await audit())[0]).toMatchObject({ userId: TEACHER_ID, action: "scenario.update" });
  });

  it("PATCH проверяет диапазоны: сложность 1–5, тайминги > 0, порог ошибок ≥ 0", async () => {
    const cases = [
      { difficulty: 7 },
      { timeNorms: { primaryReactionSec: 0, fullProcessingSec: 180 } },
      {
        successCriteria: { maxGrammarErrors: -1, requiredFields: [], syntaxRequirements: "" },
      },
    ];
    for (const patch of cases) {
      const response = await patchRoute(
        jsonRequest(`http://localhost/api/mock/scenarios/${TEMPLATE_SCENARIO_ID}`, "PATCH", {
          ...patch,
          updatedBy: TEACHER_ID,
        }),
        withId(TEMPLATE_SCENARIO_ID),
      );
      expect(response.status).toBe(400);
    }
  });

  it("PATCH от не-преподавателя → 400 validationFailed", async () => {
    const response = await patchRoute(
      jsonRequest(`http://localhost/api/mock/scenarios/${TEMPLATE_SCENARIO_ID}`, "PATCH", {
        title: "Правка курсанта",
        updatedBy: STUDENT_ID,
      }),
      withId(TEMPLATE_SCENARIO_ID),
    );
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/mock/scenarios/[id] (T3.1-17)", () => {
  it("правило блокировки: шаблон — системный, назначенный в занятие — используется", () => {
    const scenario = { id: "s-100", source: "generated" } as Scenario;
    expect(getScenarioDeleteBlock({ ...scenario, source: "template" }, [])).toBe("system");
    expect(getScenarioDeleteBlock(scenario, ["s-100"])).toBe("inSession");
    expect(getScenarioDeleteBlock(scenario, ["s-101"])).toBeNull();
  });

  it("удаляет неактуальный сценарий и пишет в аудит кем/что", async () => {
    const response = await deleteRoute(
      new Request(`http://localhost/api/mock/scenarios/${GENERATED_SCENARIO_ID}?deletedBy=${TEACHER_ID}`, {
        method: "DELETE",
      }),
      withId(GENERATED_SCENARIO_ID),
    );
    expect(response.status).toBe(200);
    expect((await listScenarios()).some((item) => item.id === GENERATED_SCENARIO_ID)).toBe(false);
    const entry = (await audit())[0];
    expect(entry).toMatchObject({ userId: TEACHER_ID, action: "scenario.delete", role: "teacher" });
    expect(entry.details).toContain(GENERATED_SCENARIO_ID);
  });

  it("системный шаблон не удаляется → 409 invalidTransition/conflict", async () => {
    const response = await deleteRoute(
      new Request(`http://localhost/api/mock/scenarios/${TEMPLATE_SCENARIO_ID}?deletedBy=${TEACHER_ID}`, {
        method: "DELETE",
      }),
      withId(TEMPLATE_SCENARIO_ID),
    );
    expect(response.status).toBe(409);
    expect((await listScenarios()).some((item) => item.id === TEMPLATE_SCENARIO_ID)).toBe(true);
  });
});

describe("POST /api/mock/scenarios/generate (T3.1-06)", () => {
  function generate(body: unknown) {
    return generateRoute(jsonRequest("http://localhost/api/mock/scenarios/generate", "POST", body));
  }

  it("создаёт 2–3 сценария pending с source=generated и карточками категории", async () => {
    const response = await generate({ category: GAS_GROUP, requestedBy: TEACHER_ID });
    expect(response.status).toBe(201);
    const generated = (await response.json()) as Scenario[];
    expect(generated.length).toBeGreaterThanOrEqual(2);
    expect(generated.length).toBeLessThanOrEqual(3);
    expect(generated.every((item) => item.validation.status === "pending")).toBe(true);
    expect(generated.every((item) => item.source === "generated")).toBe(true);
    expect(generated.every((item) => item.id.startsWith("s-"))).toBe(true);
    expect(generated.every((item) => item.cardIds.length > 0)).toBe(true);
    expect((await audit())[0]).toMatchObject({ action: "scenario.generate" });
  });

  it("повторная генерация по той же категории детерминирована и не плодит дубли", async () => {
    const first = (await (
      await generate({ category: GAS_GROUP, requestedBy: TEACHER_ID })
    ).json()) as Scenario[];
    const before = (await listScenarios()).length;
    const second = (await (
      await generate({ category: GAS_GROUP, requestedBy: TEACHER_ID })
    ).json()) as Scenario[];
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect((await listScenarios()).length).toBe(before);
  });

  it("пустая категория → 400", async () => {
    expect((await generate({ category: "  ", requestedBy: TEACHER_ID })).status).toBe(400);
  });
});

describe("/api/mock/materials (T3.1-07)", () => {
  function upload(body: unknown) {
    return uploadRoute(jsonRequest("http://localhost/api/mock/materials", "POST", body));
  }

  it("принимает DOCX/PDF/MP3 и отдаёт список после перезагрузки страницы", async () => {
    for (const name of ["Регламент.docx", "Билеты.pdf", "Запись.mp3"]) {
      expect((await upload({ name, uploadedBy: TEACHER_ID })).status).toBe(201);
    }
    const list = (await (await materialsRoute()).json()) as TrainingMaterial[];
    expect(list.map((item) => item.format)).toEqual(["MP3", "PDF", "DOCX"]);
    expect(list[0].id).toMatch(/^mat-\d{3}$/);
    expect((await audit()).some((entry) => entry.action === "material.upload")).toBe(true);
  });

  it("неподдерживаемый тип отклоняется сообщением по-русски", async () => {
    const response = await upload({ name: "Презентация.pptx", uploadedBy: TEACHER_ID });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("DOCX, PDF, MP3");
  });
});

describe("/api/mock/profile-mapping (T3.1-09)", () => {
  it("отдаёт строки сида с числом курсантов", async () => {
    const rows = (await (await mappingRoute()).json()) as ProfileMappingRow[];
    const gas = rows.find((row) => row.id === "mosgaz");
    expect(gas?.incidentGroups).toContain(GAS_GROUP);
    expect(rows.every((row) => typeof row.studentCount === "number")).toBe(true);
  });

  it("сохраняет привязку, переживает перезагрузку и пишет в аудит", async () => {
    const response = await saveMappingRoute(
      jsonRequest("http://localhost/api/mock/profile-mapping", "PUT", {
        rows: [{ id: "mosgaz", incidentGroups: [GAS_GROUP] }],
        savedBy: TEACHER_ID,
      }),
    );
    expect(response.status).toBe(200);
    const reloaded = (await (await mappingRoute()).json()) as ProfileMappingRow[];
    expect(reloaded.find((row) => row.id === "mosgaz")?.incidentGroups).toEqual([GAS_GROUP]);
    expect((await audit())[0]).toMatchObject({ userId: TEACHER_ID, action: "profileMapping.save" });
  });

  it("неизвестная группа ЕКП → 400, неизвестный профиль → 404", async () => {
    const badGroup = await saveMappingRoute(
      jsonRequest("http://localhost/api/mock/profile-mapping", "PUT", {
        rows: [{ id: "mosgaz", incidentGroups: ["Нет такой группы"] }],
        savedBy: TEACHER_ID,
      }),
    );
    expect(badGroup.status).toBe(400);
    const badRow = await saveMappingRoute(
      jsonRequest("http://localhost/api/mock/profile-mapping", "PUT", {
        rows: [{ id: "нет-профиля", incidentGroups: [] }],
        savedBy: TEACHER_ID,
      }),
    );
    expect(badRow.status).toBe(404);
  });
});

describe("POST /api/mock/grammar-check (T3.1-08)", () => {
  it("находит опечатку «пренято» с типом spelling и маркером ИИ", async () => {
    const response = await grammarRoute(
      jsonRequest("http://localhost/api/mock/grammar-check", "POST", {
        text: "Сообщение пренято, бригада направлена",
        field: "dispatcherAction",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as AiResponse<GrammarError[]>;
    expect(body.origin).toBe("ai");
    expect(body.data).toContainEqual(
      expect.objectContaining({ wrong: "пренято", expected: "принято", type: "spelling" }),
    );
  });

  it("без текста → 400", async () => {
    const response = await grammarRoute(
      jsonRequest("http://localhost/api/mock/grammar-check", "POST", { field: "text" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/mock/training-cards", () => {
  it("отдаёт 96 учебных карточек с группой ЕКП и эталонными тегами", async () => {
    const cards = (await (await trainingCardsRoute()).json()) as IncidentCard[];
    expect(cards).toHaveLength(96);
    expect(cards[0]).toMatchObject({ id: "c-001" });
    expect(cards.every((card) => typeof card.group === "string")).toBe(true);
  });
});

describe("Коррекция и валидация (T3.1-14, T3.1-15)", () => {
  function validate(id: string, body: unknown) {
    return validateRoute(
      jsonRequest(`http://localhost/api/mock/scenarios/${id}/validate`, "POST", body),
      withId(id),
    );
  }

  it("submit уводит сценарий в pending с комментарием коррекции и записью в аудит", async () => {
    const response = await validate(TEMPLATE_SCENARIO_ID, {
      action: "submit",
      reviewedBy: TEACHER_ID,
      comment: "Для ДТП с утечкой 101 обязателен",
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as Scenario;
    expect(updated.validation).toMatchObject({
      status: "pending",
      comment: "Для ДТП с утечкой 101 обязателен",
      reviewedBy: TEACHER_ID,
    });
    expect((await audit())[0]).toMatchObject({ action: "scenario.submit" });
  });

  it("частичное утверждение сохраняет выбранные поля и переживает перезагрузку", async () => {
    await validate(TEMPLATE_SCENARIO_ID, { action: "submit", reviewedBy: TEACHER_ID });
    const response = await validate(TEMPLATE_SCENARIO_ID, {
      action: "approvePartial",
      reviewedBy: TEACHER_ID,
      fields: ["actions", "text"],
    });
    expect(response.status).toBe(200);
    const reloaded = (await listScenarios()).find((item) => item.id === TEMPLATE_SCENARIO_ID);
    expect(reloaded?.validation).toMatchObject({
      status: "approved",
      approvedFields: ["actions", "text"],
      reviewedBy: TEACHER_ID,
    });
  });
});
