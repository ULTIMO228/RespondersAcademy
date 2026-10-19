/*
 * Уровни карты ошибок (spec/003-error-map, FR-002, data-model.md §1). На каждом уровне три носителя смысла:
 * слово (обязательное), значок — символ своей формы, различимый без цвета, и имя цветового токена `--pf-*`
 * из tokens-platform.css. Цвет никогда не единственный носитель смысла (SC-006). Hex здесь не задаётся.
 */

/** Уровень этапа: «редко» / «иногда» / «часто» / «мало данных» (данных для вывода нет). */
export type ErrorMapLevel = "rare" | "sometimes" | "often" | "noData";

/** Сравнение обучающегося с группой (только карта обучающегося): «лучше» / «как у группы» / «хуже». */
export type ErrorMapComparison = "better" | "same" | "worse";

export interface ErrorMapLevelMeta {
  /** Слово уровня: подпись плитки и ячейки журнала. */
  readonly label: string;
  /** Значок: один символ, форма которого различает уровень без цвета. */
  readonly icon: string;
  /** Имя токена `--pf-*` для цвета значка и подписи. */
  readonly colorToken: string;
}

export const ERROR_MAP_LEVELS: readonly ErrorMapLevel[] = ["rare", "sometimes", "often", "noData"];

export const ERROR_MAP_LEVEL_META: Readonly<Record<ErrorMapLevel, ErrorMapLevelMeta>> = {
  rare: { label: "редко", icon: "✓", colorToken: "--pf-success" },
  sometimes: { label: "иногда", icon: "~", colorToken: "--pf-warning" },
  often: { label: "часто", icon: "!", colorToken: "--pf-danger" },
  noData: { label: "мало данных", icon: "○", colorToken: "--pf-text-muted" },
};

export const ERROR_MAP_COMPARISON_LABELS: Readonly<Record<ErrorMapComparison, string>> = {
  better: "лучше группы",
  same: "как у группы",
  worse: "хуже группы",
};
