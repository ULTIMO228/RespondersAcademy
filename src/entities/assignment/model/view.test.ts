import { describe, expect, it } from "vitest";

import type { Assignment, AssignmentDetail, AssignmentProgress } from "@/shared/api";

import {
  averageScore,
  daysUntilDue,
  formatLimit,
  pickNextAssignment,
  pickOpenAttempt,
  ticketTotal,
  toView,
} from "./view";

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "asg-001",
    teacherId: "u-002",
    studentIds: ["u-005"],
    trainingMode: "operator112",
    format: "training",
    cardIds: ["c-010", "c-050"],
    params: {},
    state: "active",
    createdAt: "2026-09-29T10:00:00+03:00",
    title: "Тренировка",
    ...overrides,
  };
}

const link = (
  state: AssignmentProgress["state"],
  extra: Partial<AssignmentProgress> = {},
): AssignmentProgress => ({
  studentId: "u-005",
  cardId: "c-010",
  state,
  attemptId: `att-${state}`,
  ...extra,
});

const detail = (progress: AssignmentProgress[], overrides: Partial<Assignment> = {}): AssignmentDetail => ({
  ...assignment(overrides),
  progress,
});

describe("toView: статус по прогрессу", () => {
  it("без попыток — «не начато»; прогресс не загрузился — тоже, но progress = null", () => {
    expect(toView(assignment(), detail([]))).toMatchObject({ status: "available", closed: 0, total: 2 });
    expect(toView(assignment(), null)).toMatchObject({ status: "available", progress: null });
  });

  it("открытая попытка (вызов поступил / в работе) — «в работе»", () => {
    expect(toView(assignment(), detail([link("ringing")])).status).toBe("inProgress");
    expect(toView(assignment(), detail([link("answered")])).hasOpenAttempt).toBe(true);
  });

  it("часть билетов закрыта — снова «не начато» (следующий билет); все закрыты — «выполнено»", () => {
    const one = toView(assignment(), detail([link("submitted")]));
    expect(one).toMatchObject({ status: "available", closed: 1 });
    const all = toView(
      assignment(),
      detail([link("submitted"), link("notCompleted", { attemptId: "att-2" })]),
    );
    expect(all).toMatchObject({ status: "done", closed: 2 });
  });

  it("завершённое преподавателем задание — «завершено» независимо от прогресса", () => {
    expect(toView(assignment({ state: "finished" }), detail([link("ringing")])).status).toBe("finished");
  });

  it("цепочка: этап A передан, вход ДДС не подтверждён — ждём преподавателя, «выполнено» не ставится", () => {
    const pending = link("submitted", {
      chainReview: { scenarioId: "ais-001", version: 2, approval: "pending_review", validation: "passed" },
    });
    const view = toView(assignment({ trainingMode: "chain", cardIds: ["c-010"] }), detail([pending]));
    expect(view.awaitsTeacher).toBe(true);
    expect(view.status).toBe("available");
  });

  it("число билетов: фиксированный набор либо число случайных; иначе неизвестно", () => {
    expect(ticketTotal(assignment())).toBe(2);
    expect(
      ticketTotal(assignment({ cardIds: [], randomRule: { groups: [], difficulty: [], count: 5 } })),
    ).toBe(5);
    expect(ticketTotal(assignment({ cardIds: [] }))).toBeNull();
  });
});

describe("подписи", () => {
  it("лимит времени: секунды, минуты, часы", () => {
    expect(formatLimit(45)).toBe("45 с");
    expect(formatLimit(600)).toBe("10 мин");
    expect(formatLimit(3900)).toBe("1 ч 5 мин");
  });

  it("средний балл — по билетам с оценкой; без оценок null", () => {
    expect(
      averageScore([link("submitted", { score: 80 }), link("submitted", { score: 91, attemptId: "b" })]),
    ).toBe(86);
    expect(averageScore([link("ringing")])).toBeNull();
    expect(averageScore(null)).toBeNull();
  });
});

describe("pickNextAssignment — «Ближайшее задание» главной", () => {
  const view = (overrides: Partial<Assignment>, detail: AssignmentDetail | null = null) =>
    toView(assignment(overrides), detail);

  it("наименьший срок dueAt среди доступных для запуска", () => {
    const later = view({ id: "asg-a", dueAt: "2026-10-05T18:00:00+03:00" });
    const sooner = view({ id: "asg-b", dueAt: "2026-09-30T18:00:00+03:00" });
    expect(pickNextAssignment([later, sooner])?.assignment.id).toBe("asg-b");
  });

  it("задание со сроком раньше задания без срока", () => {
    const withoutDue = view({ id: "asg-a", createdAt: "2026-09-01T10:00:00+03:00" });
    const withDue = view({ id: "asg-b", dueAt: "2026-12-31T18:00:00+03:00" });
    expect(pickNextAssignment([withoutDue, withDue])?.assignment.id).toBe("asg-b");
  });

  it("без сроков — раньше созданное", () => {
    const newer = view({ id: "asg-a", createdAt: "2026-09-20T10:00:00+03:00" });
    const older = view({ id: "asg-b", createdAt: "2026-09-10T10:00:00+03:00" });
    expect(pickNextAssignment([newer, older])?.assignment.id).toBe("asg-b");
  });

  it("завершённые, выполненные целиком и ждущие подтверждения преподавателя не считаются", () => {
    const finished = view({ id: "asg-f", state: "finished", dueAt: "2026-09-01T10:00:00+03:00" });
    const done = view(
      { id: "asg-d", cardIds: ["c-010"], dueAt: "2026-09-02T10:00:00+03:00" },
      { ...assignment({ id: "asg-d", cardIds: ["c-010"] }), progress: [link("submitted")] },
    );
    const awaiting = view(
      { id: "asg-w", trainingMode: "chain", cardIds: ["c-010"], dueAt: "2026-09-03T10:00:00+03:00" },
      {
        ...assignment({ id: "asg-w", cardIds: ["c-010"] }),
        progress: [
          link("submitted", {
            chainReview: { scenarioId: "s", version: 1, approval: "pending", validation: "ok" },
          }),
        ],
      },
    );
    const runnable = view({ id: "asg-ok", dueAt: "2026-10-20T10:00:00+03:00" });
    expect(pickNextAssignment([finished, done, awaiting, runnable])?.assignment.id).toBe("asg-ok");
    expect(pickNextAssignment([finished, done, awaiting])).toBeNull();
    expect(pickNextAssignment([])).toBeNull();
  });

  it("открытая попытка находится отдельно и учитывается как доступное задание", () => {
    const open = view(
      { id: "asg-open" },
      { ...assignment({ id: "asg-open" }), progress: [link("answered")] },
    );
    expect(pickOpenAttempt([view({ id: "x" }), open])?.assignment.id).toBe("asg-open");
    expect(pickNextAssignment([open])?.assignment.id).toBe("asg-open");
    expect(pickOpenAttempt([view({ id: "x" })])).toBeNull();
  });

  it("daysUntilDue: срок в днях, просрочка отрицательна, без срока — null", () => {
    const now = Date.parse("2026-09-29T12:00:00+03:00");
    expect(daysUntilDue(assignment({ dueAt: "2026-09-30T12:00:00+03:00" }), now)).toBe(1);
    expect(daysUntilDue(assignment({ dueAt: "2026-09-27T12:00:00+03:00" }), now)).toBe(-2);
    expect(daysUntilDue(assignment(), now)).toBeNull();
  });
});
