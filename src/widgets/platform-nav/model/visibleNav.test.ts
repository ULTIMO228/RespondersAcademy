import { describe, expect, it } from "vitest";

import { visibleNavEntries } from "./visibleNav";

const titles = (user: Parameters<typeof visibleNavEntries>[0]) =>
  visibleNavEntries(user).map((entry) => entry.title);

describe("visibleNavEntries: пункты кабинета по профилю режима (spec/008, T041)", () => {
  it("у специалиста-112 нет «Открыть АРМ» — журнал АРМ относится к режиму ДДС", () => {
    expect(titles({ role: "student", trainingProfile: "operator112" })).not.toContain("Открыть АРМ");
  });

  it("у курсанта без профиля «Открыть АРМ» есть (парный случай)", () => {
    expect(titles({ role: "student" })).toContain("Открыть АРМ");
  });

  it("у диспетчера ДДС «Открыть АРМ» есть", () => {
    expect(titles({ role: "student", trainingProfile: "dds" })).toContain("Открыть АРМ");
  });

  it("остальные пункты специалиста-112 на месте", () => {
    expect(titles({ role: "student", trainingProfile: "operator112" })).toEqual([
      "Главная",
      "Задания",
      "Результаты",
      "Аналитика",
      "Справочник",
      "Профиль",
    ]);
  });
});
