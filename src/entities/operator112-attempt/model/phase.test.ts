import { describe, expect, it } from "vitest";

import type { OperatorAttempt } from "@/shared/api";

import { isHintDue, pickHintStep } from "./hints";
import type { HintProgress } from "./hints";
import { attemptPhase, canAnswer, canEdit, canSubmit, hasAnswerTimeout } from "./phase";
import { isEmergencyAudio, isReplayBlocked } from "./phase";

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-1",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: "2026-09-29T10:00:00+03:00",
    openedAt: "2026-09-29T10:00:00+03:00",
    state: "ringing",
    events: [],
    replays: 0,
    hintsShown: 0,
    ...overrides,
  };
}

describe("фаза и доступность действий", () => {
  it("фазы: нет попытки → starting; состояния сервера; submitting только при активном запросе", () => {
    expect(attemptPhase(null)).toBe("starting");
    expect(attemptPhase(attempt())).toBe("ringing");
    expect(attemptPhase(attempt({ state: "answered" }))).toBe("answered");
    expect(attemptPhase(attempt({ state: "answered" }), true)).toBe("submitting");
    expect(attemptPhase(attempt({ state: "submitted" }), true)).toBe("submitted");
  });

  it("ответить можно только на входящий, править и передавать — только после ответа, не дважды", () => {
    expect(canAnswer(attempt())).toBe(true);
    expect(canAnswer(attempt({ state: "answered" }))).toBe(false);
    expect(canEdit(attempt())).toBe(false);
    expect(canEdit(attempt({ state: "answered" }))).toBe(true);
    expect(canSubmit(attempt({ state: "answered" }))).toBe(true);
    expect(canSubmit(attempt({ state: "answered" }), true)).toBe(false);
    expect(canSubmit(attempt({ state: "submitted" }))).toBe(false);
  });

  it("повтор записи блокируется только в экзамене после первого прослушивания", () => {
    expect(isReplayBlocked(attempt({ replays: 1 }), "exam")).toBe(true);
    expect(isReplayBlocked(attempt({ replays: 0 }), "exam")).toBe(false);
    expect(isReplayBlocked(attempt({ replays: 3 }), "training")).toBe(false);
    expect(isReplayBlocked(attempt({ replays: 1 }), null)).toBe(false);
  });

  it("answerTimeout из событий сервера", () => {
    expect(hasAnswerTimeout(attempt())).toBe(false);
    const overdue = attempt({
      events: [{ id: "ev-001", type: "answerTimeout" as const, at: "t", payload: {} }],
    });
    expect(hasAnswerTimeout(overdue)).toBe(true);
  });

  it("аварийный режим: нет записи, emergency или статус не ready", () => {
    expect(isEmergencyAudio(attempt())).toBe(true);
    const audio = {
      cardId: "c-010",
      status: "ready" as const,
      transcript: "",
      voice: "female",
      emergency: false,
    };
    expect(isEmergencyAudio(attempt({ audio }))).toBe(false);
    expect(isEmergencyAudio(attempt({ audio: { ...audio, status: "pending" } }))).toBe(true);
    expect(isEmergencyAudio(attempt({ audio: { ...audio, emergency: true } }))).toBe(true);
  });
});

const STEPS = [
  { stage: "answer", text: "Примите вызов" },
  { stage: "applicant", text: "Заполните заявителя" },
  { stage: "address", text: "Заполните адрес" },
  { stage: "description", text: "Опишите" },
  { stage: "poll", text: "Опросная карта" },
  { stage: "signs", text: "Признаки" },
  { stage: "notification", text: "Оповещение" },
  { stage: "submit", text: "Сохраните" },
];
const NOTHING: HintProgress = {
  answered: false,
  applicant: false,
  address: false,
  description: false,
  poll: false,
  signs: false,
  notification: false,
};

describe("подсказки тренировки", () => {
  it("подсказывается первый невыполненный шаг", () => {
    expect(pickHintStep(STEPS, NOTHING)?.stage).toBe("answer");
    expect(pickHintStep(STEPS, { ...NOTHING, answered: true })?.stage).toBe("applicant");
    expect(pickHintStep(STEPS, { ...NOTHING, answered: true, applicant: true, address: true })?.stage).toBe(
      "description",
    );
  });

  it("всё заполнено — «сохраните карточку»; без шагов — null", () => {
    const done: HintProgress = {
      answered: true,
      applicant: true,
      address: true,
      description: true,
      poll: true,
      signs: true,
      notification: true,
    };
    expect(pickHintStep(STEPS, done)?.stage).toBe("submit");
    expect(pickHintStep([], NOTHING)).toBeNull();
  });

  it("подсказка полагается после idleSec простоя; в экзамене (enabled=false) и после передачи — нет", () => {
    const training = attempt({ hints: { enabled: true, idleSec: 20, steps: STEPS } });
    expect(isHintDue(training, 1000, 1000 + 19_999)).toBe(false);
    expect(isHintDue(training, 1000, 1000 + 20_000)).toBe(true);
    expect(isHintDue({ ...training, hints: { enabled: false, idleSec: 20, steps: STEPS } }, 0, 999_999)).toBe(
      false,
    );
    expect(isHintDue({ ...training, state: "submitted" }, 0, 999_999)).toBe(false);
    expect(isHintDue(attempt(), 0, 999_999)).toBe(false);
  });
});
