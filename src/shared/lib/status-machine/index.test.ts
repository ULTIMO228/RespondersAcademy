import referenceJson from "@mocks/reference.json";
import { describe, expect, it } from "vitest";

import { buildStatusMachine, StatusTransitionError } from "./index";
import type { StatusDefinition } from "./index";

type Graph = StatusDefinition<string>[];

const ddsDefs: Graph = referenceJson.ddsStatuses;
const serviceDefs: Graph = referenceJson.serviceStatuses;

function expectError(action: () => void, code: StatusTransitionError["code"]): StatusTransitionError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(StatusTransitionError);
    expect((error as StatusTransitionError).code).toBe(code);
    return error as StatusTransitionError;
  }
  throw new Error("ожидалась StatusTransitionError");
}

describe.each([
  ["ddsStatuses", ddsDefs],
  ["serviceStatuses", serviceDefs],
])("полный обход пар переходов графа %s из reference.json", (_name, defs) => {
  const machine = buildStatusMachine(defs);

  it.each(defs.map((def) => [def.status, def] as const))(
    "из %s разрешены ровно next справочника",
    (_s, def) => {
      for (const target of defs) {
        expect(machine.canTransition(def.status, target.status)).toBe(def.next.includes(target.status));
      }
      expect(machine.nextStatuses(def.status)).toEqual(def.next);
    },
  );
});

describe("buildStatusMachine", () => {
  const dds = buildStatusMachine(ddsDefs, { initial: ["accepted", "notAccepted"] });

  it("строит сервисный граф из 9 статусов reference.json", () => {
    expect(buildStatusMachine(serviceDefs).statuses).toHaveLength(9);
  });

  it("workDone → * отклонён, workDone — финальный", () => {
    expect(dds.isFinal("workDone")).toBe(true);
    for (const status of dds.statuses) expect(dds.canTransition("workDone", status)).toBe(false);
    const error = expectError(() => dds.assertTransition("workDone", "accepted"), "invalidTransition");
    expect(error.message).toBe("Переход из «Работы завершены» в «Принята» недопустим. Доступно: нет");
  });

  it("notAccepted → accepted разрешён", () => {
    expect(dds.canTransition("notAccepted", "accepted")).toBe(true);
    expect(() => dds.assertTransition("notAccepted", "accepted")).not.toThrow();
  });

  it("первичный статус — только из initial", () => {
    expect(dds.nextStatuses(null)).toEqual(["accepted", "notAccepted"]);
    expect(dds.canTransition(null, "workDone")).toBe(false);
    expectError(() => dds.assertTransition(null, "arrived"), "invalidTransition");
  });

  it.each(["notAccepted", "workRefused"])("requiresComment для %s: без комментария — отказ", (status) => {
    const from = status === "notAccepted" ? null : "workInProgress";
    expect(dds.requiresComment(status)).toBe(true);
    const error = expectError(() => dds.assertTransition(from, status, { comment: "  " }), "commentRequired");
    expect(error.message).toMatch(/обязателен комментарий/);
    expect(() => dds.assertTransition(from, status, { comment: "Вне компетенции" })).not.toThrow();
  });

  it("неизвестный статус → unknownStatus", () => {
    expectError(() => dds.assertTransition("accepted", "flying"), "unknownStatus");
    expect(dds.hasStatus("flying")).toBe(false);
  });

  it("по умолчанию стартовые статусы — без входящих рёбер (added для служб)", () => {
    expect(buildStatusMachine(serviceDefs).initialStatuses).toEqual(["added"]);
  });

  it("изменение данных справочника меняет поведение без правки кода", () => {
    const patched = ddsDefs.map((def) => (def.status === "workDone" ? { ...def, next: ["accepted"] } : def));
    expect(buildStatusMachine(patched).canTransition("workDone", "accepted")).toBe(true);
  });
});
