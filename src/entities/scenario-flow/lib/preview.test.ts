import { describe, expect, it } from "vitest";

import type { FlowDictionaries, FlowNode } from "../model/types";
import { createDemoGraph } from "./demo";
import {
  answerMatches,
  chooseVariant,
  finishPreview,
  recordPreviewEvent,
  scorePreview,
  startPreview,
  waitPreview,
} from "./preview";
import type { PreviewEvent, PreviewState } from "./preview";

const dict: FlowDictionaries = {
  cards: [
    {
      value: "c-010",
      label: "Билет 4.1",
      summary: "Горит балкон",
      address: "ул. Грина",
      callerName: "",
      callerPhone: "",
    },
  ],
  ddsStatuses: [],
  services: ["101", "102", "103", "104"].map((n) => ({ value: `svc-${n}`, label: `Служба ${n}` })),
  phoneNumbers: [],
  signs: [],
};
const graph = createDemoGraph();

function play(state: PreviewState, ...events: (Omit<PreviewEvent, "at"> | number)[]): PreviewState {
  return events.reduce<PreviewState>(
    (current, event) =>
      typeof event === "number"
        ? waitPreview(graph, dict, current, event)
        : recordPreviewEvent(graph, dict, current, event),
    state,
  );
}

const field = (name: string, value: string) => ({ kind: "field" as const, field: name, value });
const notify = (service: string) => ({ kind: "service" as const, value: service });

describe("пробный прогон демо-сценария (билет 4.1)", () => {
  it("старт: вызов и реплика заявителя в ленте, движок ждёт уточнения адреса", () => {
    const state = startPreview(graph, dict, { seed: 1 });
    expect(state.feed.map((item) => item.kind)).toEqual(["call", "callerReply"]);
    expect(state.activeNodeId).toBe("n4");
    expect(state.watchers).toEqual([{ nodeId: "n13", since: 0 }]);
  });

  it("идеальное прохождение: ветка «Да», 100 баллов, сдано", () => {
    const state = play(
      startPreview(graph, dict, { seed: 1 }),
      10,
      field("addressRefined", "ул Грина, д. 11"),
      field("floors", "14"),
      field("gas", "Да"),
      notify("svc-104"),
      notify("svc-101"),
      notify("svc-102"),
    );
    expect(state.finished).toBe(true);
    expect(state.finishReason).toBe("end");
    expect(state.steps.map((step) => step.nodeId)).toContain("n8");
    const result = scorePreview(graph, dict, state);
    expect(result).toMatchObject({ earned: 10, max: 10, score: 100, passed: true, errors: [] });
  });

  it("ветка «Нет» с подсказкой и без службы 104: 7 из 10 → 70 баллов, сдано (как quickstart, сценарий 3)", () => {
    let state = play(
      startPreview(graph, dict, { seed: 1 }),
      field("addressRefined", "ул. Грина, 11"),
      field("floors", "14"),
      field("gas", "нет"),
      60,
    );
    expect(state.feed.at(-1)).toMatchObject({ kind: "hint" });
    state = play(state, notify("svc-101"), notify("svc-102"));
    expect(state.activeNodeId).toBe("n10"); // 104 ещё ждёт: выход «Не выполнено» не подключён
    state = finishPreview(graph, state);
    const result = scorePreview(graph, dict, state);
    expect(result.max).toBe(10);
    expect(result.earned).toBe(7);
    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("взята подсказка"),
        expect.stringContaining("Оповестить: Служба 104"),
      ]),
    );
  });

  it("неверный адрес и истёкший срок ведут по выходу «Неверно» к повторной реплике", () => {
    const state = play(
      startPreview(graph, dict, { seed: 1 }),
      field("addressRefined", "Ленинский проспект"),
      60,
    );
    expect(state.steps.find((step) => step.nodeId === "n4")).toMatchObject({
      outcome: "wrong",
      port: "wrong",
    });
    expect(state.feed.at(-1)?.text).toContain("библиотека сто девяносто три");
    expect(state.activeNodeId).toBe("n6");
  });

  it("действие после срока засчитывается частично; критическая ошибка — не сдано", () => {
    let state = play(
      startPreview(graph, dict, { seed: 1 }),
      field("addressRefined", "ул. Грина, 11"),
      field("floors", "14"),
      field("gas", "да"),
      notify("svc-104"),
    );
    state = play(state, 90, notify("svc-101"));
    expect(state.steps.find((step) => step.nodeId === "n11")?.outcome).toBe("late");
    const late = scorePreview(graph, dict, play(state, notify("svc-102")));
    expect(late.earned).toBe(8.5);
    expect(late.errors[0]).toMatchObject({ severity: "minor", pointsLost: 1.5 });

    const missedCritical = scorePreview(
      graph,
      dict,
      finishPreview(
        graph,
        play(startPreview(graph, dict, { seed: 1 }), field("addressRefined", "ул. Грина, 11")),
      ),
    );
    expect(missedCritical.passed).toBe(false);
    expect(missedCritical.errors.some((error) => error.severity === "critical")).toBe(true);
  });

  it("запрещённое действие фиксируется и снимает баллы", () => {
    const state = play(
      startPreview(graph, dict, { seed: 1 }),
      notify("svc-103"),
      field("addressRefined", "ул. Грина, 11"),
      field("floors", "14"),
      field("gas", "да"),
      notify("svc-104"),
      notify("svc-101"),
      notify("svc-102"),
    );
    expect(state.violations).toEqual([{ nodeId: "n13", at: 0 }]);
    const result = scorePreview(graph, dict, state);
    expect(result.earned).toBe(9);
    expect(result.errors[0].message).toContain("сделано запрещённое");
  });

  it("в экзамене подсказка пропускается без штрафа", () => {
    const state = play(
      startPreview(graph, dict, { seed: 1, exam: true }),
      field("addressRefined", "ул. Грина, 11"),
      field("floors", "14"),
      60,
    );
    expect(state.steps.find((step) => step.nodeId === "n9")?.outcome).toBe("skipped");
    expect(state.feed.some((item) => item.kind === "hint")).toBe(false);
  });

  it("досрочное завершение достраивает путь по выходам провала", () => {
    const state = finishPreview(graph, startPreview(graph, dict, { seed: 1 }));
    expect(state.finishReason).toBe("student");
    expect(state.steps.filter((step) => step.virtual).map((step) => step.nodeId)).toEqual([
      "n5",
      "n6",
      "n7",
      "n9",
      "n10",
      "n11",
      "n12",
      "n14",
    ]);
    const result = scorePreview(graph, dict, state);
    expect(result).toMatchObject({ score: 0, passed: false, max: 10 });
  });
});

describe("сравнение ответов и случайный вариант", () => {
  it.each([
    ["similar", "ул. Грина, 11", "улица Грина, дом 11", true],
    ["similar", "ул. Грина, 11", "ул. Грина, 17", false],
    ["similar", "ул. Грина, 11", "ул Грина 11", true],
    ["exact", "916-126-34-71", "9161263471", true],
    ["contains", "библиотека 193", "дом где библиотека 193", true],
    ["oneOf", "да; газифицирован", "Газифицирован", true],
    ["range", "10–15", "14", true],
    ["range", "10–15", "16", false],
    ["any", "", " ", false],
  ])("%s: «%s» против «%s» → %s", (mode, expected, actual, result) => {
    expect(answerMatches(mode, expected, actual)).toBe(result);
  });

  it("вариант зависит только от зерна и блока; нулевой вес не выбирается", () => {
    const node: FlowNode = {
      id: "n50",
      type: "randomVariant",
      position: { x: 0, y: 0 },
      props: { variants: "2", weightA: 1, weightB: 0 },
    };
    for (let seed = 0; seed < 20; seed += 1) expect(chooseVariant(node, seed)).toBe("a");
    const fair = { ...node, props: { variants: "3", weightA: 1, weightB: 1, weightC: 1 } };
    expect(chooseVariant(fair, 7)).toBe(chooseVariant(fair, 7));
    const picks = new Set(Array.from({ length: 30 }, (_, seed) => chooseVariant(fair, seed)));
    expect(picks.size).toBe(3);
  });
});
