import sessionsJson from "@mocks/sessions.json";
import { describe, expect, it } from "vitest";

import type { SessionContract } from "@/shared/api";

import { buildSessionFeed } from "./feed";

const sessions = sessionsJson.sessions as SessionContract[];
const running = sessions.find((session) => session.state === "running") as SessionContract;
const finished = sessions.find((session) => session.id === "ses-2026-09-16-01") as SessionContract;

describe("buildSessionFeed — идущее занятие", () => {
  it("at между двумя issuedAt → отдана только первая выдача", () => {
    const events = buildSessionFeed(running, { at: "2026-09-17T11:22:00+03:00" });
    expect(events.map((event) => event.kind)).toEqual(["cardIssued", "cardIssued", "cardIssued"]);
    expect(new Set(events.map((event) => event.at))).toEqual(new Set(["2026-09-17T11:20:00+03:00"]));
  });

  it("since отсекает уже виденные события (граница since — исключительно, at — включительно)", () => {
    const events = buildSessionFeed(running, {
      since: "2026-09-17T11:20:00+03:00",
      at: "2026-09-17T11:24:00+03:00",
    });
    expect(events.map((event) => [event.studentId, event.cardId])).toEqual([
      ["u-005", "c-093"],
      ["u-006", "c-081"],
    ]);
  });

  it("пустое окно → пустой массив", () => {
    expect(buildSessionFeed(running, { at: "2026-09-17T11:00:00+03:00" })).toEqual([]);
    const at = "2026-09-17T11:21:00+03:00";
    expect(buildSessionFeed(running, { since: at, at })).toEqual([]);
  });
});

describe("buildSessionFeed — завершённое занятие", () => {
  const all = buildSessionFeed(finished, { at: "2026-09-16T11:00:00+03:00" });

  it("генерирует события всех пяти kind из мока", () => {
    expect(new Set(all.map((event) => event.kind))).toEqual(
      new Set(["cardIssued", "cardOpened", "statusChanged", "cardCompleted", "aiEvaluation"]),
    );
    const statusCount = finished.cardEvents.reduce((sum, attempt) => sum + attempt.statuses.length, 0);
    const evaluated = finished.cardEvents.filter((attempt) => attempt.evaluation).length;
    expect(all).toHaveLength(
      finished.cardFlow.length + finished.cardEvents.length * 2 + statusCount + evaluated,
    );
  });

  it("мок-оценка ИИ помечена isAi, несёт балл и число ошибок (T3.3-01)", () => {
    const evaluated = all.find((event) => event.kind === "aiEvaluation" && event.attemptId === "att-03");
    expect(evaluated).toMatchObject({
      isAi: true,
      at: "2026-09-16T10:07:58+03:00",
      totalScore: 66,
      /* errors + grammarErrors — счётчик ошибок плитки «на лету». */
      errorCount: 5,
    });
    /* Попытка без Evaluation (идущее занятие) событие оценки не порождает. */
    const pending = { ...finished, cardEvents: [{ ...finished.cardEvents[0], evaluation: undefined }] };
    const pendingEvents = buildSessionFeed(pending, { at: "2026-09-16T11:00:00+03:00" });
    expect(pendingEvents.some((event) => event.kind === "aiEvaluation")).toBe(false);
  });

  it("cardCompleted несёт fullProcessingMs, statusChanged — отметку статуса", () => {
    const completed = all.find((event) => event.kind === "cardCompleted" && event.attemptId === "att-01");
    expect(completed).toMatchObject({ fullProcessingMs: 178_000, at: "2026-09-16T10:05:12+03:00" });
    const status = all.find((event) => event.kind === "statusChanged" && event.attemptId === "att-01");
    expect(status).toMatchObject({ mark: { ddsStatus: "accepted", dutyNumber: "5" } });
  });

  it("отсортировано по времени; при равных метках порядок детерминирован", () => {
    const times = all.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const sameTime = all
      .filter((event) => event.at === "2026-09-16T10:05:12+03:00")
      .map((event) => event.kind);
    expect(sameTime).toEqual(["statusChanged", "cardCompleted", "aiEvaluation"]);
    const firstIssued = all.slice(0, 3).map((event) => event.studentId);
    expect(firstIssued).toEqual(["u-005", "u-006", "u-007"]);
    const reversed = {
      ...finished,
      cardFlow: [...finished.cardFlow].reverse(),
      cardEvents: [...finished.cardEvents].reverse(),
    };
    expect(buildSessionFeed(reversed, { at: "2026-09-16T11:00:00+03:00" })).toEqual(all);
  });

  it("не мутирует занятие", () => {
    const snapshot = JSON.stringify(finished);
    buildSessionFeed(finished, { at: "2026-09-16T11:00:00+03:00" })[1].at = "изменено";
    expect(JSON.stringify(finished)).toBe(snapshot);
  });
});
