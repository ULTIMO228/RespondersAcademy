import { postAttemptProgress, postCardStatus, postCardWorkline } from "@/shared/api";
import type { CardEventContract, CardStatusEvent, CardWorkLine } from "@/shared/api";

import type { OutboxItem } from "../lib/outbox";

export type OutboxResult = CardStatusEvent | CardEventContract | CardWorkLine;

/**
 * Отправка элемента буфера в мок-слой. Статус ДДС: сначала карточка (валидация графа), затем попытка
 * (CardEvent.statuses). Время отметки — фактическое время действия курсанта, не время досылки.
 */
export async function sendOutboxItem(item: OutboxItem): Promise<OutboxResult> {
  if (item.kind === "workline") return postCardWorkline(item.cardId, item.request);
  if (item.kind === "progress") return postAttemptProgress(item.attemptId, item.request);
  const event = await postCardStatus(item.cardId, item.request);
  await postAttemptProgress(item.attemptId, { status: { ...item.request, at: item.at } });
  return event;
}
