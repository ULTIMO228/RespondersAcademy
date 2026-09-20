import type { IncidentListItem } from "@/entities/incident";
import { isNormExceeded, parseIsoMs, primaryReactionMs } from "@/entities/session";
import { formatDuration } from "@/shared/lib";

/*
 * Таймер первичной реакции 30 сек в строке новой карточки (T2.2-06; Q&A в6). Отсчёт — от CardFlowItem.issuedAt
 * (а не от рендера), поэтому независим для каждой карточки. Нарушение — строго больше норматива.
 */

export type ReactionRecord = {
  sessionId: string;
  cardId: string;
  issuedAt: string;
  /** null — карточка не открыта, норматив истёк (нарушение без открытия). */
  openedAt: string | null;
  primaryReactionMs: number | null;
  isViolation: boolean;
};

export type ReactionState = {
  state: IncidentListItem["state"];
  /** «0:30»…«0:00»; null — таймер остановлен (карточка открыта). */
  timer: string | null;
};

/** Состояние таймера на момент nowMs: новая (идёт отсчёт) или нарушение (норматив истёк). */
export function getReactionState(issuedAt: string, nowMs: number, normMs: number): ReactionState {
  const elapsedMs = nowMs - parseIsoMs(issuedAt);
  const isViolation = isNormExceeded(elapsedMs, normMs);
  return { state: isViolation ? "violation" : "new", timer: formatDuration(Math.max(0, normMs - elapsedMs)) };
}

/** Фиксация открытия: primaryReactionMs = openedAt − issuedAt, нарушение — сверх норматива. */
export function buildOpenedRecord(
  base: Pick<ReactionRecord, "sessionId" | "cardId" | "issuedAt">,
  openedAt: string,
  normMs: number,
): ReactionRecord {
  const reactionMs = primaryReactionMs(base.issuedAt, openedAt);
  return {
    ...base,
    openedAt,
    primaryReactionMs: reactionMs,
    isViolation: isNormExceeded(reactionMs, normMs),
  };
}

/** Строка ленты с живым таймером: открытая — обычная без таймера; неоткрытая — новая/нарушение. */
export function applyReactionState(
  item: IncidentListItem,
  nowMs: number,
  normMs: number,
  record: ReactionRecord | undefined,
): IncidentListItem {
  if (!item.issuedAt) return item;
  if (record?.openedAt) return { ...item, state: "normal", reactionTimer: null };
  const reaction = getReactionState(item.issuedAt, nowMs, normMs);
  return { ...item, state: reaction.state, reactionTimer: reaction.timer };
}
