import type { MistakeCategory, MistakeSeverity } from "../model/attempt";

/** Нормативы заказчика (Q&A в6): первичная реакция 30 сек, полная отработка 3 мин. */
export const REACTION_NORM_MS = 30_000;
export const PROCESSING_NORM_MS = 180_000;

/** Критерии Evaluation (spec/05-data-models.md §7) в порядке вывода. */
export const EVALUATION_CRITERIA = [
  { key: "timeScore", title: "Время (нормативы)" },
  { key: "correctnessScore", title: "Корректность заполнения" },
  { key: "grammarScore", title: "Грамматика" },
  { key: "semanticScore", title: "Смысловая точность" },
  { key: "totalScore", title: "Интегральный балл" },
] as const;

/** Типы ошибок «Мои ошибки» (spec/04-pages/04-arm-progress.md). */
export const MISTAKE_CATEGORY_TITLES: Record<MistakeCategory, string> = {
  timing: "Тайминг",
  filling: "Заполнение",
  grammar: "Грамматика",
  statusSequence: "Последовательность статусов",
  missedCall: "Пропущенный звонок",
};

/** Короткие подписи для оси диаграммы. */
export const MISTAKE_CATEGORY_SHORT_TITLES: Record<MistakeCategory, string> = {
  timing: "Тайминг",
  filling: "Заполнение",
  grammar: "Грамматика",
  statusSequence: "Статусы",
  missedCall: "Звонок",
};

export const MISTAKE_CATEGORY_ORDER: MistakeCategory[] = [
  "timing",
  "filling",
  "grammar",
  "statusSequence",
  "missedCall",
];

export const SEVERITY_TITLES: Record<string, string> = {
  critical: "критичная",
  major: "существенная",
  minor: "незначительная",
};

/** Порядок вывода уровней критичности — от тяжёлых к незначительным. */
export const SEVERITY_ORDER: MistakeSeverity[] = ["critical", "major", "minor"];

/** Правила отнесения ошибки к уровню (spec/04-pages/13 п. 3) — расшифровка рядом с фильтром severity. */
export const SEVERITY_RULES: Record<MistakeSeverity, string> = {
  critical:
    "нарушение регламента или искажение смысла: пропущен регламентный звонок, оповещена не та служба, истёк норматив реакции",
  major: "влияет на балл: превышение норматива отработки, незаполненное обязательное поле",
  minor: "незначительное: опечатка без искажения смысла",
};

/** В моке у grammarErrors нет severity — опечатка без искажения смысла трактуется как minor. */
export const GRAMMAR_ERROR_SEVERITY: MistakeSeverity = "minor";
