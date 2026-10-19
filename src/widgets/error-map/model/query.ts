import type { ErrorMapMode, ErrorMapPeriod } from "@/shared/api";

export interface ErrorMapFilters {
  /** Пустая строка — группа не выбрана (страница подставит первую доступную). */
  groupId: string;
  period: ErrorMapPeriod;
  mode: ErrorMapMode;
}

export const DEFAULT_ERROR_MAP_MODE: ErrorMapMode = "dds";
export const DEFAULT_ERROR_MAP_PERIOD: ErrorMapPeriod = "1m";

export const ERROR_MAP_PERIOD_OPTIONS: { value: ErrorMapPeriod; label: string }[] = [
  { value: "2w", label: "2 недели" },
  { value: "1m", label: "месяц" },
  { value: "all", label: "всё время" },
];

export const ERROR_MAP_MODE_OPTIONS: { value: ErrorMapMode; label: string }[] = [
  { value: "dds", label: "ДДС" },
  { value: "operator112", label: "специалист-112" },
];

type QuerySource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: QuerySource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const raw = source[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Фильтры из query-параметров; неизвестные и пустые значения заменяются умолчанием (dds / 1m). */
export function parseErrorMapQuery(source: QuerySource): ErrorMapFilters {
  const period = read(source, "period");
  const mode = read(source, "mode");
  return {
    groupId: read(source, "group") ?? "",
    period: ERROR_MAP_PERIOD_OPTIONS.some((o) => o.value === period)
      ? (period as ErrorMapPeriod)
      : DEFAULT_ERROR_MAP_PERIOD,
    mode: ERROR_MAP_MODE_OPTIONS.some((o) => o.value === mode)
      ? (mode as ErrorMapMode)
      : DEFAULT_ERROR_MAP_MODE,
  };
}

/** Фильтры в строку query (без «?»); пустая группа не пишется. */
export function serializeErrorMapQuery(filters: ErrorMapFilters): string {
  const params = new URLSearchParams();
  if (filters.groupId) params.set("group", filters.groupId);
  params.set("period", filters.period);
  params.set("mode", filters.mode);
  return params.toString();
}
