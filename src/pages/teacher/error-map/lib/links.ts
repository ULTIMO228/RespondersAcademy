/*
 * Ссылки между картой группы и картой обучающегося. Фильтры (group/period/mode) переезжают в query как есть;
 * выбранный на карте группы этап уходит на страницу обучающегося парой `stage` (стартовый разбор) и `from`
 * (куда вернёт «К карте группы»). `from` не меняется, пока обучающийся выбирает свои этапы.
 */
import { ROUTES } from "@/shared/config";
import { serializeErrorMapQuery } from "@/widgets/error-map";
import type { ErrorMapFilters } from "@/widgets/error-map";

export const STAGE_PARAM = "stage";
export const FROM_PARAM = "from";

/** Карта обучающегося из разбора этапа группы: тот же этап открыт сразу и запомнен для «Назад». */
export function studentMapHref(studentId: string, filters: ErrorMapFilters, groupStageId?: string | null) {
  const query = new URLSearchParams(serializeErrorMapQuery(filters));
  if (groupStageId) {
    query.set(STAGE_PARAM, groupStageId);
    query.set(FROM_PARAM, groupStageId);
  }
  return `${ROUTES.teacherErrorMapStudent(studentId)}?${query}`;
}

/** Карта группы с теми же period/mode и выбранным ранее этапом. */
export function groupMapHref(filters: ErrorMapFilters, groupStageId?: string | null) {
  const query = new URLSearchParams(serializeErrorMapQuery(filters));
  if (groupStageId) query.set(STAGE_PARAM, groupStageId);
  return `${ROUTES.teacherErrorMap}?${query}`;
}

/** Журнал группы: группа — в пути, period/mode — в query (как на карте группы, чтобы фильтры переезжали между видами). */
export function journalHref(filters: ErrorMapFilters) {
  const query = new URLSearchParams({ period: filters.period, mode: filters.mode });
  return `${ROUTES.teacherErrorMapJournal(filters.groupId)}?${query}`;
}

/** Вид, с которого открыт показ: выход вернёт на него (по умолчанию — карта группы). */
export const VIEW_PARAM = "view";
export type PresentView = "map" | "journal";

/** Режим показа группы: группа в пути; period, mode, шаг (с 1) и вид-источник — в query. */
export function presentHref(filters: ErrorMapFilters, options: { step?: number; view?: PresentView } = {}) {
  const query = new URLSearchParams({ period: filters.period, mode: filters.mode });
  if (options.step !== undefined) query.set("step", String(options.step));
  if (options.view === "journal") query.set(VIEW_PARAM, "journal");
  return `${ROUTES.teacherErrorMapPresent(filters.groupId)}?${query}`;
}
