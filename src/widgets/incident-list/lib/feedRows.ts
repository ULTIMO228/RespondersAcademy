import type { IncidentCard } from "@/shared/api";

/* Поступившие в занятии карточки курсанта: без дублей при повторных тиках, новые сверху. */

export type IssuedCard = {
  card: IncidentCard;
  /** CardFlowItem.issuedAt (событие cardIssued ленты занятия). */
  issuedAt: string;
};

/** Сортировка «новые сверху»: по issuedAt ↓, при равенстве — по id (детерминированно). */
export function compareIssuedDesc(left: IssuedCard, right: IssuedCard): number {
  const byTime = Date.parse(right.issuedAt) - Date.parse(left.issuedAt);
  return byTime !== 0 ? byTime : left.card.id.localeCompare(right.card.id);
}

/** Слияние новой порции ленты: карточка, уже бывшая в ленте, повторно не добавляется. */
export function mergeIssued(current: readonly IssuedCard[], fresh: readonly IssuedCard[]): IssuedCard[] {
  const known = new Set(current.map((item) => item.card.id));
  const added = fresh.filter((item) => {
    if (known.has(item.card.id)) return false;
    known.add(item.card.id);
    return true;
  });
  return [...current, ...added].sort(compareIssuedDesc);
}
