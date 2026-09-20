import { mapTrainingCard } from "@/entities/incident";
import type { IncidentListItem, IncidentMapContext } from "@/entities/incident";

import type { IssuedCard } from "./feedRows";
import type { ReactionRecord } from "./reactionTimer";
import { applyReactionState } from "./reactionTimer";

export type SessionRowsInput = {
  issued: readonly IssuedCard[];
  context: IncidentMapContext;
  armNumber: string;
  nowMs: number;
  normMs: number;
  /** Факт открытия/нарушения по id карточки. */
  findRecord: (cardId: string) => ReactionRecord | undefined;
};

/** Поступившие карточки занятия → строки ленты с живым таймером 30 сек (новые сверху — порядок issued). */
export function buildSessionRows(input: SessionRowsInput): IncidentListItem[] {
  return input.issued.map(({ card, issuedAt }) => {
    const item = mapTrainingCard({ card, issuedAt, armNumber: input.armNumber }, input.context);
    return applyReactionState(item, input.nowMs, input.normMs, input.findRecord(card.id));
  });
}
