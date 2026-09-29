import type { Analytics, LobbyMode } from "@/shared/api";

const MS_IN_SECOND = 1000;

/** «2026-09-25» → «25.09»; остальное возвращается как есть (форма `dynamics.labels` на бэкенде слабо типизирована). */
export function toDayLabel(label: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(label);
  return match ? `${match[2]}.${match[1]}` : label;
}

export type DynamicsSeries = { labels: string[]; values: number[] };

/** Динамика баллов; расходящиеся длины меток и значений обрезаются по меньшей, чтобы график и таблица совпадали. */
export function toDynamics(analytics: Analytics): DynamicsSeries {
  const { labels, values } = analytics.dynamics;
  const length = Math.min(labels.length, values.length);
  return { labels: labels.slice(0, length).map(toDayLabel), values: values.slice(0, length) };
}

const MODE_ORDER: LobbyMode[] = ["operator112", "dds"];
export const MODE_TITLES: Record<LobbyMode, string> = { operator112: "Режим 112", dds: "Режим ДДС" };

export type ModeTimes = { labels: string[]; reactionSec: number[]; processingSec: number[] };

/** Среднее время по режимам, где были попытки (в секундах): для столбцов против нормативов 30 с и 3 мин. */
export function toModeTimes(analytics: Analytics): ModeTimes {
  const modes = MODE_ORDER.filter((mode) => analytics.byMode[mode].count > 0);
  return {
    labels: modes.map((mode) => MODE_TITLES[mode]),
    reactionSec: modes.map((mode) => Math.round(analytics.byMode[mode].averageReactionMs / MS_IN_SECOND)),
    processingSec: modes.map((mode) => Math.round(analytics.byMode[mode].averageProcessingMs / MS_IN_SECOND)),
  };
}
