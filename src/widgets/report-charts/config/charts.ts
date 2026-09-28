/* Подписи и шкалы графиков отчёта (spec/000-фронт/04-pages/13, п. 7). */
export const REACTION_STAGE_INDEX = 0;
export const PROCESSING_STAGE_INDEX = 1;

export const ERROR_COLUMNS = [
  { key: "spelling", title: "Орфография", source: "grammar" },
  { key: "syntax", title: "Синтаксис", source: "grammar" },
  { key: "critical", title: "Критичные", source: "errors" },
  { key: "major", title: "Существенные", source: "errors" },
  { key: "minor", title: "Незначительные", source: "errors" },
] as const;

/** Пороги heatmap: 0 / 1 / 2 / 3+ (равные шаги, шкала не искажает — ТЗ §17). */
export const HEAT_LEVEL_MAX = 3;
