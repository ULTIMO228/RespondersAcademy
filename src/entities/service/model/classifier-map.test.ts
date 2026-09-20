import classifierJson from "@mocks/classifier.json";
import referenceJson from "@mocks/reference.json";
import { describe, expect, it } from "vitest";

import type { ClassifierEntry, ReferenceData, ServiceRef } from "@/shared/api";

import {
  collectClassifierServiceNames,
  collectUnmappedClassifierServices,
  resolveServiceByClassifierName,
} from "./classifier-map";

const services = (referenceJson as ReferenceData).services;
const entries = classifierJson.entries as ClassifierEntry[];

describe("resolveServiceByClassifierName — прогон по моку", () => {
  const names = collectClassifierServiceNames(entries);

  it("классификатор v.046_24 содержит 61 уникальное имя службы", () => {
    expect(names).toHaveLength(61);
  });

  it("каждое имя резолвится в существующий ServiceRef", () => {
    const serviceIds = new Set(services.map((service) => service.id));
    for (const name of names) {
      const resolved = resolveServiceByClassifierName(name, services);
      expect(resolved, name).not.toBeNull();
      expect(serviceIds.has(resolved?.id ?? "")).toBe(true);
    }
  });

  it("collectUnmappedClassifierServices пуст", () => {
    expect(collectUnmappedClassifierServices(entries, services)).toEqual([]);
  });

  it("примеры спеки §2.5", () => {
    expect(resolveServiceByClassifierName("МОСГАЗ (Служба 104)", services)?.id).toBe("svc-104");
    expect(resolveServiceByClassifierName("СМП (Служба 103)", services)?.id).toBe("svc-103");
    expect(resolveServiceByClassifierName("МВД (Служба 102)", services)?.id).toBe("svc-102");
    expect(resolveServiceByClassifierName("Мослифт", services)?.id).toBe("svc-moslift");
  });
});

describe("resolveServiceByClassifierName — правило", () => {
  const fallback: ServiceRef = { id: "svc-a", name: "Горсвет", shortName: "ГС", kind: "arm112" };
  const exact: ServiceRef = {
    id: "svc-b",
    name: "ГБУ Горсвет",
    shortName: "Свет",
    kind: "arm112",
    classifierName: "Горсвет",
  };

  it("точное совпадение classifierName приоритетнее fallback по name", () => {
    expect(resolveServiceByClassifierName("Горсвет", [fallback, exact])?.id).toBe("svc-b");
  });

  it("fallback по shortName — только для служб без classifierName", () => {
    expect(resolveServiceByClassifierName("ГС", [fallback, exact])?.id).toBe("svc-a");
    expect(resolveServiceByClassifierName("Свет", [fallback, exact])).toBeNull();
  });

  it("нормализации нет: регистр/пробелы/вариант «карточка -112» код не угадывает — правится в данных", () => {
    expect(resolveServiceByClassifierName("горсвет", [fallback])).toBeNull();
    expect(resolveServiceByClassifierName(" Горсвет", [fallback])).toBeNull();
  });

  it("неизвестная строка → null и попадает в отчёт", () => {
    const report = collectUnmappedClassifierServices(
      [{ notifications: [{ service: "Неизвестная служба", mode: "card112" }] }],
      services,
    );
    expect(resolveServiceByClassifierName("Неизвестная служба", services)).toBeNull();
    expect(report).toEqual(["Неизвестная служба"]);
  });
});
