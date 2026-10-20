import type { AssignableMode } from "@/shared/api";
import { ASSIGNMENT_NEW_QUERY } from "@/shared/config";

import type { WizardInitial } from "./types";

/** Query страницы: Next отдаёт повторяющийся ключ массивом. */
export type AssignmentQuery = Readonly<Record<string, string | string[] | undefined>>;

export type AssignmentPrefill = { initial: WizardInitial; focusStage?: string };

/** Режим `chain` выведен 20.10.2026 (spec/007 Clarifications): в ссылке он отбрасывается как неизвестный. */
const PREFILL_MODES: readonly AssignableMode[] = ["operator112", "dds"];

const valuesOf = (raw: string | string[] | undefined): string[] =>
  raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];

const firstTrimmed = (raw: string | string[] | undefined): string | undefined =>
  valuesOf(raw)[0]?.trim() || undefined;

/**
 * Разбор query `/teacher/assignments/new` (переход из карты ошибок). Query — внешний ввод: неизвестный режим и
 * пустые значения отбрасываются. Идентификаторы обучающихся здесь не проверяются — это делает мастер по списку доступных.
 */
export function assignmentPrefillFromQuery(query: AssignmentQuery): AssignmentPrefill {
  const studentIds = [
    ...new Set(
      valuesOf(query[ASSIGNMENT_NEW_QUERY.studentIds])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const mode = firstTrimmed(query[ASSIGNMENT_NEW_QUERY.mode]);
  const trainingMode = PREFILL_MODES.find((item) => item === mode);
  const initial: WizardInitial = {
    studentIds,
    trainingMode,
    title: firstTrimmed(query[ASSIGNMENT_NEW_QUERY.title]),
  };
  return { initial, focusStage: firstTrimmed(query[ASSIGNMENT_NEW_QUERY.focusStage]) };
}
