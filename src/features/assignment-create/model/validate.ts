import type { AssignmentCreateRequest, AssignmentParams } from "@/shared/api";

import type { StepErrors, WizardDraft } from "./types";

function toInt(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function positiveInt(value: string): boolean {
  const parsed = toInt(value);
  return parsed !== null && parsed > 0;
}

/** Правила бэкенда (schemas/v1/assignments.py), проверяемые заранее для UX; сервер остаётся источником истины. */
export function validateStudents(draft: WizardDraft): StepErrors {
  return draft.studentIds.length === 0 ? { studentIds: "Выберите хотя бы одного обучающегося" } : {};
}

export function validateTickets(draft: WizardDraft): StepErrors {
  if (draft.ticketSource === "rule") {
    const count = toInt(draft.ruleCount);
    if (count === null || count < 1 || count > 100) {
      return { ruleCount: "Количество случайных билетов — от 1 до 100" };
    }
    return {};
  }
  if (draft.cardIds.length === 0) {
    return {
      cardIds:
        draft.trainingMode === "chain"
          ? "Выберите утверждённую версию сценария"
          : "Выберите хотя бы один билет",
    };
  }
  if (draft.trainingMode === "chain") {
    const covered = new Set(draft.scenarioVersions.map((item) => item.cardId));
    if (draft.cardIds.some((cardId) => !covered.has(cardId))) {
      return { cardIds: "Для цепочки нужна утверждённая версия operator112 у каждого билета" };
    }
  }
  return {};
}

export function validateParams(draft: WizardDraft): StepErrors {
  const errors: StepErrors = {};
  if (!positiveInt(draft.answerSec)) errors.answerSec = "Норматив ответа — целое число секунд больше 0";
  if (!positiveInt(draft.submitSec)) errors.submitSec = "Норматив отработки — целое число секунд больше 0";
  if (draft.format === "training" && draft.hintsEnabled && !positiveInt(draft.hintIdleSec)) {
    errors.hintIdleSec = "Пауза до подсказки — целое число секунд больше 0";
  }
  if (draft.format === "exam") {
    const threshold = toInt(draft.passThreshold);
    if (threshold === null || threshold > 100) errors.passThreshold = "Порог экзамена — число от 0 до 100";
  }
  if (draft.timeLimitSec.trim() !== "" && !positiveInt(draft.timeLimitSec)) {
    errors.timeLimitSec = "Лимит на билет — положительное целое число секунд";
  }
  if (draft.workMessagesEnabled) {
    const values = draft.workMessageIntervals.map(toInt);
    const valid =
      values.length === 4 &&
      values.every((value): value is number => value !== null && value > 0) &&
      values.every((value, index) => index === 0 || (value as number) > (values[index - 1] as number));
    if (!valid) errors.workMessageIntervals = "Нужны четыре возрастающих интервала в секундах";
  }
  return errors;
}

export function validateStep(step: number, draft: WizardDraft): StepErrors {
  switch (step) {
    case 0:
      return validateStudents(draft);
    case 2:
      return validateTickets(draft);
    case 3:
      return validateParams(draft);
    default:
      return {};
  }
}

/** Все шаги сразу: подтверждающий шаг не отправляет запрос, пока хоть один шаг невалиден. */
export function validateAll(draft: WizardDraft): StepErrors {
  return { ...validateStudents(draft), ...validateTickets(draft), ...validateParams(draft) };
}

export function buildParams(draft: WizardDraft): AssignmentParams {
  const isExam = draft.format === "exam";
  const params: AssignmentParams = {
    norms: { answerSec: Number(draft.answerSec), submitSec: Number(draft.submitSec) },
    // Экзамен сервер всё равно создаёт без подсказок — фронт не даёт их включить.
    hints: isExam ? { enabled: false } : { enabled: draft.hintsEnabled, idleSec: Number(draft.hintIdleSec) },
    workMessagesEnabled: draft.workMessagesEnabled,
  };
  if (isExam) params.passThreshold = Number(draft.passThreshold);
  if (draft.timeLimitSec.trim() !== "") params.timeLimitSec = Number(draft.timeLimitSec);
  if (draft.workMessagesEnabled) params.workMessageIntervalsSec = draft.workMessageIntervals.map(Number);
  if (!draft.hintsEnabled || isExam) delete params.hints?.idleSec;
  return params;
}

/** Ровно один источник билетов: cardIds либо randomRule. */
export function buildRequest(draft: WizardDraft): AssignmentCreateRequest {
  const request: AssignmentCreateRequest = {
    studentIds: draft.studentIds,
    trainingMode: draft.trainingMode,
    format: draft.format,
    params: buildParams(draft),
  };
  if (draft.title.trim()) request.title = draft.title.trim();
  if (draft.dueDate) request.dueAt = `${draft.dueDate}T23:59:59+03:00`;
  if (draft.ticketSource === "rule") {
    request.randomRule = {
      groups: draft.ruleGroups,
      difficulty: draft.ruleDifficulty,
      count: Number(draft.ruleCount),
    };
  } else {
    request.cardIds = draft.cardIds;
    if (draft.trainingMode === "chain") request.scenarioVersions = draft.scenarioVersions;
  }
  return request;
}
