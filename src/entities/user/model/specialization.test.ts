import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/shared/api";

import { hasSpecialization, zonesOf } from "./specialization";

function userOf(role: PublicUser["role"], specializations?: PublicUser["specializations"]): PublicUser {
  return { id: "u-x", login: "x", fullName: "Тест", role, armNumber: 1, isActive: true, specializations };
}

describe("hasSpecialization", () => {
  it("обучающийся: по вхождению в список", () => {
    const only112 = userOf("student", ["operator112"]);
    expect(hasSpecialization(only112, "operator112")).toBe(true);
    expect(hasSpecialization(only112, "dds")).toBe(false);
  });

  it("обучающийся с двумя специализациями проходит в обе зоны", () => {
    const both = userOf("student", ["operator112", "dds"]);
    expect(hasSpecialization(both, "operator112")).toBe(true);
    expect(hasSpecialization(both, "dds")).toBe(true);
  });

  it("пустой список — нигде не допущен", () => {
    const none = userOf("student", []);
    expect(hasSpecialization(none, "operator112")).toBe(false);
    expect(hasSpecialization(none, "dds")).toBe(false);
  });

  it("без поля у обучающегося действует «dds»", () => {
    const legacy = userOf("student");
    expect(hasSpecialization(legacy, "dds")).toBe(true);
    expect(hasSpecialization(legacy, "operator112")).toBe(false);
  });

  it("преподаватель и администратор не ограничиваются специализацией (режим просмотра)", () => {
    for (const role of ["teacher", "admin"] as const) {
      expect(hasSpecialization(userOf(role), "operator112")).toBe(true);
      expect(hasSpecialization(userOf(role), "dds")).toBe(true);
    }
  });
});

describe("zonesOf", () => {
  it("возвращает зоны в стабильном порядке: сначала 112, затем ДДС", () => {
    expect(zonesOf(userOf("student", ["dds", "operator112"]))).toEqual(["operator112", "dds"]);
    expect(zonesOf(userOf("student", ["operator112"]))).toEqual(["operator112"]);
    expect(zonesOf(userOf("student", ["dds"]))).toEqual(["dds"]);
  });

  it("убирает дубли и пустой список даёт пустой результат", () => {
    expect(zonesOf(userOf("student", ["dds", "dds"]))).toEqual(["dds"]);
    expect(zonesOf(userOf("student", []))).toEqual([]);
  });

  it("преподаватель и администратор видят обе зоны", () => {
    expect(zonesOf(userOf("teacher"))).toEqual(["operator112", "dds"]);
    expect(zonesOf(userOf("admin"))).toEqual(["operator112", "dds"]);
  });
});
