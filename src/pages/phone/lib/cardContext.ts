/*
 * Контекст карточки софтфона (`/arm/phone?cardId=…`): учебный id для эталона сценария, подпись для UI
 * и строки журнала вызовов (дата/время, номер, длительность, ссылка на карточку).
 */
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import { getCallDurationMs } from "@/features/call-control";
import type { CallLogEntry, ExpectedCall, ExpectedCallSource } from "@/features/call-control";
import { ROUTES } from "@/shared/config";
import { formatDateTime, formatDuration } from "@/shared/lib";

const FIXTURE_PREFIX = "card-";

const EXPECTED_SOURCE_TITLES: Record<ExpectedCallSource, string> = {
  etalon: "эталон сценария",
  mainService: "главная служба карточки",
  callTarget: "цель звонка сценария",
};

export type CallLogRow = {
  id: string;
  startedAt: string;
  number: string;
  subscriberTitle: string;
  duration: string;
  card: { label: string; href: string } | null;
  isSaved: boolean;
};

/** "card-36814850" → "c-095" (учебная карточка фикстуры); учебный id — как есть. */
export function toTrainingCardId(cardId: string): string {
  const match = Object.entries(TRAINING_CARD_FIXTURE_IDS).find(([, fixtureId]) => fixtureId === cardId);
  return match?.[0] ?? cardId;
}

/** Подпись карточки: номер ПОВ-112 фикстуры («36814850») или id учебной карточки. */
export function getCardLabel(cardId: string): string {
  const fixtureId = cardId.startsWith(FIXTURE_PREFIX) ? cardId : TRAINING_CARD_FIXTURE_IDS[cardId];
  return fixtureId ? fixtureId.slice(FIXTURE_PREFIX.length) : cardId;
}

export function describeExpected(expected: ExpectedCall): string {
  return `карточка ${getCardLabel(expected.cardId)}, ${EXPECTED_SOURCE_TITLES[expected.source]}`;
}

export function toCallLogRow(entry: CallLogEntry): CallLogRow {
  return {
    id: entry.id,
    startedAt: formatDateTime(entry.startedAt),
    number: entry.number,
    subscriberTitle: entry.subscriberTitle,
    duration: formatDuration(getCallDurationMs(entry)),
    card: entry.cardId ? { label: getCardLabel(entry.cardId), href: ROUTES.armCard(entry.cardId) } : null,
    isSaved: entry.isSaved,
  };
}
