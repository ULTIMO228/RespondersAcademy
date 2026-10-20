/* Тестовый граф: шаг → выбор категории → условие (две ветки) → два завершения. */
import type { ScenarioGraph } from "@/shared/api";

export function sampleGraph(): ScenarioGraph {
  return {
    schemaVersion: "scenario-graph/1",
    start: "n1",
    nodes: [
      {
        id: "n1",
        type: "action",
        title: "Приём вызова",
        prompt: "Заявитель сообщает о дереве на дороге.",
        action: "captureCaller",
        label: "Записать данные заявителя",
        sets: { callerKnown: true },
        next: "n2",
        maxVisits: 10,
      },
      {
        id: "n2",
        type: "action",
        action: "classify",
        label: "Определить тип происшествия",
        input: {
          fact: "category",
          options: [
            { value: "tree", label: "Падение дерева" },
            { value: "fire", label: "Пожар", penalty: 20 },
          ],
        },
        next: "n3",
      },
      {
        id: "n3",
        type: "condition",
        title: "Тип происшествия",
        branches: [{ name: "Дерево", when: { fact: "category", op: "eq", value: "tree" }, next: "n4" }],
        else: { name: "Иначе", next: "n5" },
      },
      { id: "n4", type: "end", outcome: "completed", score: 100, passed: true },
      { id: "n5", type: "end", outcome: "wrongCategory", score: 40, passed: false },
    ],
    decoys: [{ action: "callPolice", label: "Вызвать полицию" }],
    scoring: { wrongActionPenalty: 5, passScore: 60 },
    layout: { n1: { x: 80, y: 60 } },
  };
}
