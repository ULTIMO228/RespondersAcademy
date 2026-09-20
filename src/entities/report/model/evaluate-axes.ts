/*
 * Оси мок-оценки попытки (T1.2-08): время, соответствие эталону, грамматика, смысл.
 * ИИ-модуль: заменить на реальный сервис. Все функции чистые и детерминированные.
 */
import { getCardEtalonSegment, isNormExceeded, parseEtalonAction } from "@/entities/session/@x/report";
import type { TimeNormsMs } from "@/entities/session/@x/report";
import type { CardEventContract, EvaluationError, GrammarError, SuccessCriteria } from "@/shared/api";

import {
  GRAMMAR_PENALTY_OVER_LIMIT,
  GRAMMAR_PENALTY_WITHIN_LIMIT,
  MAX_SCORE,
  MIN_SCORE,
  SEMANTIC_MIN_WORD_LENGTH,
  SEMANTIC_STEM_LENGTH,
  TIME_NORM_SHARE,
} from "./score-weights";

const MS_IN_SECOND = 1000;
const OPEN_CARD_ACTION = "openCard";
const WORD_PATTERN = /[а-яa-z0-9]+/g;

export type AxisResult = { score: number; errors: EvaluationError[] };

export function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(value)));
}

function toSec(valueMs: number): number {
  return Math.round(valueMs / MS_IN_SECOND);
}

/** Половина оси на норматив: в норме — полный балл, сверх — пропорционально norm / fact. */
function normPart(factMs: number, normMs: number): number {
  const share = MAX_SCORE * TIME_NORM_SHARE;
  return isNormExceeded(factMs, normMs) ? (share * normMs) / factMs : share;
}

export function scoreTime(attempt: CardEventContract, norms: TimeNormsMs): AxisResult {
  const errors: EvaluationError[] = [];
  const { primaryReactionMs: reaction, fullProcessingMs: processing } = attempt;
  if (isNormExceeded(reaction, norms.primaryReactionMs)) {
    const message = `Превышен норматив реакции: ${toSec(reaction)} с (норма ${toSec(norms.primaryReactionMs)} с)`;
    errors.push({ type: "timeReactionExceeded", severity: "major", message });
  }
  if (isNormExceeded(processing, norms.fullProcessingMs)) {
    const message = `Превышено время отработки: ${toSec(processing)} с (норма ${toSec(norms.fullProcessingMs)} с)`;
    errors.push({ type: "timeProcessingExceeded", severity: "major", message });
  }
  const score = normPart(reaction, norms.primaryReactionMs) + normPart(processing, norms.fullProcessingMs);
  return { score: clampScore(score), errors };
}

/** Действия попытки в терминах эталона («status:accepted», «call:103») в хронологическом порядке. */
export function collectAttemptActions(attempt: CardEventContract): string[] {
  const timed = [
    ...attempt.statuses.map((mark) => ({ at: Date.parse(mark.at), action: `status:${mark.ddsStatus}` })),
    ...attempt.calls.map((call) => ({ at: Date.parse(call.startedAt), action: `call:${call.toNumber}` })),
  ];
  return timed.sort((left, right) => left.at - right.at).map((item) => item.action);
}

/** Сегмент эталона карточки без «openCard»; нет сегмента — весь эталон без «openCard». */
export function getExpectedCardActions(expectedActions: readonly string[], cardId: string): string[] {
  const isAction = (action: string) => parseEtalonAction(action).kind !== OPEN_CARD_ACTION;
  const segment = getCardEtalonSegment([...expectedActions], cardId).filter(isAction);
  return segment.length > 0 ? segment : expectedActions.filter(isAction);
}

function lcsLength(left: readonly string[], right: readonly string[]): number {
  let previous = new Array<number>(right.length + 1).fill(0);
  for (const leftItem of left) {
    const current = [0];
    right.forEach((rightItem, index) => {
      current.push(
        leftItem === rightItem ? previous[index] + 1 : Math.max(previous[index + 1], current[index]),
      );
    });
    previous = current;
  }
  return previous[right.length];
}

function describeMissing(action: string): EvaluationError {
  const { kind, target } = parseEtalonAction(action);
  if (kind === "call") {
    return {
      type: "missedRequiredCall",
      severity: "critical",
      message: `Пропущен ожидаемый звонок точке C (${target})`,
    };
  }
  if (kind === "status") {
    return {
      type: "statusMissing",
      severity: "major",
      message: `Не проставлен ожидаемый статус ДДС: ${target}`,
    };
  }
  return {
    type: "etalonActionMissing",
    severity: "minor",
    message: `Не выполнено действие эталона: ${action}`,
  };
}

/** Соответствие эталону: LCS упорядоченных действий относительно большей из последовательностей. */
export function scoreCorrectness(expected: readonly string[], actual: readonly string[]): AxisResult {
  const remaining = [...actual];
  const errors: EvaluationError[] = [];
  for (const action of expected) {
    const index = remaining.indexOf(action);
    if (index < 0) errors.push(describeMissing(action));
    else remaining.splice(index, 1);
  }
  const common = lcsLength(expected, actual);
  if (errors.length === 0 && common < expected.length) {
    errors.push({
      type: "statusSequenceOrder",
      severity: "minor",
      message: "Нарушен порядок действий относительно эталона",
    });
  }
  const longest = Math.max(expected.length, actual.length);
  return { score: longest === 0 ? MAX_SCORE : clampScore((MAX_SCORE * common) / longest), errors };
}

export function scoreGrammar(grammarErrors: readonly GrammarError[], criteria: SuccessCriteria): AxisResult {
  const count = grammarErrors.length;
  const overLimit = count > criteria.maxGrammarErrors;
  const penalty = overLimit ? GRAMMAR_PENALTY_OVER_LIMIT : GRAMMAR_PENALTY_WITHIN_LIMIT;
  const errors: EvaluationError[] = overLimit
    ? [
        {
          type: "grammarLimitExceeded",
          severity: "major",
          message: `Грамматических ошибок: ${count} (допустимо ${criteria.maxGrammarErrors})`,
        },
      ]
    : [];
  return { score: clampScore(MAX_SCORE - penalty * count), errors };
}

function toStems(text: string): string[] {
  const words = text.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").match(WORD_PATTERN) ?? [];
  return words
    .filter((word) => word.length >= SEMANTIC_MIN_WORD_LENGTH)
    .map((word) => word.slice(0, SEMANTIC_STEM_LENGTH));
}

/**
 * Смысловое покрытие keyPhrases (Q&A в5): не посимвольное сравнение, а доля основ слов фразы,
 * встретившихся в ручном вводе (регистр, «ё», словоформы с общей основой не важны).
 */
export function scoreSemantic(
  keyPhrases: readonly string[],
  enteredText: Readonly<Record<string, string>>,
): number {
  const textStems = new Set(toStems(Object.values(enteredText).join(" ")));
  const coverages = keyPhrases
    .map(toStems)
    .filter((stems) => stems.length > 0)
    .map((stems) => stems.filter((stem) => textStems.has(stem)).length / stems.length);
  if (coverages.length === 0) return MAX_SCORE;
  return clampScore((MAX_SCORE * coverages.reduce((sum, value) => sum + value, 0)) / coverages.length);
}

export function findMissingRequiredFields(
  enteredText: Readonly<Record<string, string>>,
  criteria: SuccessCriteria,
): EvaluationError[] {
  return criteria.requiredFields
    .filter((field) => (enteredText[field] ?? "").trim() === "")
    .map((field) => ({
      type: "requiredFieldMissing",
      severity: "major",
      message: `Не заполнено обязательное поле «${field}»`,
    }));
}
