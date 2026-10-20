import { describe, expect, it } from "vitest";

import { reference } from "@/shared/api";

import { resolveTraineeServiceId } from "./traineeService";

describe("resolveTraineeServiceId — своя служба обучающегося (спека 012 FR-007)", () => {
  it("ДДС района → первая служба профиля (управа)", () => {
    expect(resolveTraineeServiceId("ДДС района Обручевский", reference.services)).toBe("svc-upr-obruchev");
    expect(resolveTraineeServiceId("ДДС района Чертаново Южное", reference.services)).toBe("svc-upr-chert");
  });

  it("без профиля — служба с тем же полным названием; неизвестная и пустая — undefined", () => {
    const named = reference.services[0];
    expect(resolveTraineeServiceId(named.name, reference.services)).toBe(named.id);
    expect(resolveTraineeServiceId("Служба, которой нет", reference.services)).toBeUndefined();
    expect(resolveTraineeServiceId(undefined, reference.services)).toBeUndefined();
  });
});
