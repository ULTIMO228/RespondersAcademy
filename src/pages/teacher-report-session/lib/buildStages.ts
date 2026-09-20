/* Тайминги попытки по этапам с отклонениями от нормативов 30/180 сек (spec/04-pages/13 п. 3). */
import {
  formatDeviationSec,
  getElapsedSec,
  msToSec,
  PROCESSING_NORM_SEC,
  REACTION_NORM_SEC,
} from "@/entities/session";
import type { CardEventContract, DdsStatusDef } from "@/shared/api";
import { formatDuration } from "@/shared/lib";

import type { StageView } from "../model/types";

const MS_IN_SECOND = 1000;

function formatOffset(seconds: number): string {
  return `+${formatDuration(seconds * MS_IN_SECOND)}`;
}

function buildNormStage(id: string, title: string, factSec: number, normSec: number): StageView {
  return {
    id,
    title,
    offset: formatOffset(factSec),
    normText: `норматив ${normSec} с`,
    deviation: formatDeviationSec(factSec - normSec),
    isExceeded: factSec > normSec,
  };
}

/** Реакция → статусы ДДС по времени → завершение; у нормативных этапов показано отклонение. */
export function buildStages(attempt: CardEventContract, ddsStatuses: DdsStatusDef[]): StageView[] {
  const statusStages = attempt.statuses.map((status, index) => ({
    id: `status-${index}`,
    title: `Статус «${ddsStatuses.find((ref) => ref.status === status.ddsStatus)?.title ?? status.ddsStatus}»`,
    offset: formatOffset(getElapsedSec(attempt.openedAt, status.at)),
    isExceeded: false,
  }));
  return [
    buildNormStage("reaction", "Первичная реакция", msToSec(attempt.primaryReactionMs), REACTION_NORM_SEC),
    ...statusStages,
    buildNormStage(
      "processing",
      "Завершение (полная отработка)",
      msToSec(attempt.fullProcessingMs),
      PROCESSING_NORM_SEC,
    ),
  ];
}
