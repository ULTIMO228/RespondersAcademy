import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/shared/api";

import { NO_GROUP, assignableStudents } from "./students";

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
    expect(assignableStudents(roster, ["Группа 1"], "dds").map((item) => item.id)).toEqual(["a"]);
  });

  it("без закреплённых групп доступных нет; обучающийся без группы — только при явной записи «Без группы»", () => {
    expect(assignableStudents(roster, undefined, "dds")).toEqual([]);
    expect(assignableStudents(roster, [], "dds")).toEqual([]);
    expect(assignableStudents(roster, [NO_GROUP], "dds").map((item) => item.id)).toEqual(["d"]);
  });

  it("фильтрует по специализации режима; цепочке нужны обе", () => {
    const roster = [
      user("both", "Группа 1", { specializations: ["operator112", "dds"] }),
      user("112", "Группа 1", { specializations: ["operator112"] }),
      user("dds", "Группа 1", { specializations: ["dds"] }),
      user("legacy", "Группа 1"),
    ];
    expect(assignableStudents(roster, ["Группа 1"], "operator112").map((item) => item.id)).toEqual(["both", "112"]);
    expect(assignableStudents(roster, ["Группа 1"], "dds").map((item) => item.id)).toEqual(["both", "dds", "legacy"]);
    expect(assignableStudents(roster, ["Группа 1"], "chain").map((item) => item.id)).toEqual(["both"]);
  });
});
