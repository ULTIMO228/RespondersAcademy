import type { RatingMode, RatingPeriod, StudentRatingRow } from "@/shared/api";

/** Столбцы, по которым сортируется рейтинг (FR-003). */
export type SortKey =
  | "fullName"
  | "averageScore"
  | "ratingOperator112"
  | "ratingDds"
  | "averageReactionMs"
  | "averageProcessingMs"
  | "withinNormsShare"
  | "attempts";
export type SortDir = "asc" | "desc";

export type RatingFilters = {
  groupId: string;
  mode: RatingMode;
  period: RatingPeriod;
  sort: SortKey;
  dir: SortDir;
};

export type RankedRow = StudentRatingRow & { place: number | null };

const SORT_KEYS: SortKey[] = [
  "fullName",
  "averageScore",
  "ratingOperator112",
  "ratingDds",
  "averageReactionMs",
  "averageProcessingMs",
  "withinNormsShare",
  "attempts",
];
const MODES: RatingMode[] = ["all", "operator112", "dds"];
const PERIODS: RatingPeriod[] = ["all", "1m", "2w"];

/** Направление по умолчанию: время — чем меньше, тем лучше; остальное — чем больше. */
export function defaultDir(key: SortKey): SortDir {
  return key === "fullName" || key === "averageReactionMs" || key === "averageProcessingMs" ? "asc" : "desc";
}

export const DEFAULT_FILTERS: RatingFilters = {
  groupId: "",
  mode: "all",
  period: "all",
  sort: "averageScore",
  dir: "desc",
};

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function parseRatingQuery(params: URLSearchParams): RatingFilters {
  return {
    groupId: params.get("groupId") ?? "",
    mode: pick(params.get("mode"), MODES, DEFAULT_FILTERS.mode),
    period: pick(params.get("period"), PERIODS, DEFAULT_FILTERS.period),
    sort: pick(params.get("sort"), SORT_KEYS, DEFAULT_FILTERS.sort),
    dir: pick(params.get("dir"), ["asc", "desc"] as const, DEFAULT_FILTERS.dir),
  };
}

export function serializeRatingQuery(filters: RatingFilters): string {
  const query = new URLSearchParams();
  if (filters.groupId) query.set("groupId", filters.groupId);
  query.set("mode", filters.mode);
  query.set("period", filters.period);
  query.set("sort", filters.sort);
  query.set("dir", filters.dir);
  return query.toString();
}

function value(row: StudentRatingRow, key: SortKey): string | number | null {
  return row[key];
}

function compare(a: StudentRatingRow, b: StudentRatingRow, key: SortKey, dir: SortDir): number {
  const left = value(a, key);
  const right = value(b, key);
  // Пустые значения («нет попыток») всегда внизу, независимо от направления.
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  const diff = typeof left === "string" ? left.localeCompare(String(right), "ru") : left - Number(right);
  return dir === "asc" ? diff : -diff;
}

/**
 * Сортировка и места (FR-003, FR-006): строки с достаточными данными идут первыми и получают места
 * «1, 2, 2, 4» по выбранному столбцу; равные значения делят место, вторичный порядок — ФИО.
 * Строки с «мало данных» — ниже, без места, в том же порядке сортировки.
 */
export function rankRows(rows: StudentRatingRow[], key: SortKey, dir: SortDir): RankedRow[] {
  const ordered = [...rows].sort(
    (a, b) =>
      Number(b.enoughData) - Number(a.enoughData) ||
      compare(a, b, key, dir) ||
      a.fullName.localeCompare(b.fullName, "ru"),
  );
  const ranked: RankedRow[] = [];
  ordered.forEach((row, index) => {
    if (!row.enoughData || key === "fullName" || value(row, key) === null) {
      ranked.push({ ...row, place: null });
      return;
    }
    const previous = ranked[index - 1];
    const tied = previous && previous.place !== null && value(previous, key) === value(row, key);
    ranked.push({ ...row, place: tied ? previous.place : index + 1 });
  });
  return ranked;
}
