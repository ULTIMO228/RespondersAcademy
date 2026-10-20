import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/shared/api";

import { NO_GROUP, assignableStudents, splitByMode } from "./students";

const user = (id: string, group: string | undefined, patch: Partial<PublicUser> = {}): PublicUser =>
  ({
    id,
    login: id,
    fullName: id,
    role: "student",
    armNumber: 1,
    isActive: true,
    group,
    ...patch,
  }) as PublicUser;

describe("assignableStudents", () => {
  const roster = [
    user("a", "Группа 1"),
    user("b", "Группа 1", { isActive: false }),
    user("c", "Группа 9"),
    user("d", undefined),
    user("e", "Группа 1", { role: "teacher" }),
  ];

  it("оставляет активных обучающихся закреплённых групп", () => {
    expect(assignableStudents(roster, ["Группа 1"]).map((item) => item.id)).toEqual(["a"]);
  });

  it("без закреплённых групп доступных нет; обучающийся без группы — только при явной записи «Без группы»", () => {
    expect(assignableStudents(roster, undefined)).toEqual([]);
    expect(assignableStudents(roster, [])).toEqual([]);
    expect(assignableStudents(roster, [NO_GROUP]).map((item) => item.id)).toEqual(["d"]);
  });
});

describe("splitByMode (spec/008)", () => {
  const roster = [
    user("none", "Группа 1"),
    user("op", "Группа 1", { trainingProfile: "operator112" }),
    user("dds", "Группа 1", { trainingProfile: "dds" }),
  ];

  it("режим ДДС пропускает специалиста-112", () => {
    const { allowed, skipped } = splitByMode(roster, "dds");
    expect(allowed.map((u) => u.id)).toEqual(["none", "dds"]);
    expect(skipped.map((u) => u.id)).toEqual(["op"]);
  });

  it("режим 112 пропускает диспетчера ДДС", () => {
    const { allowed, skipped } = splitByMode(roster, "operator112");
    expect(allowed.map((u) => u.id)).toEqual(["none", "op"]);
    expect(skipped.map((u) => u.id)).toEqual(["dds"]);
  });
});
