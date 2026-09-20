/* Русские подписи действий эталона: статусы ДДС и внутренние номера — из справочника, не из констант кода. */
import type { EtalonActionDictionary } from "@/entities/session";
import type { MonitorReference } from "@/widgets/monitor-grid";

export function buildActionDictionary(
  reference: MonitorReference,
  cardId: string,
  cardNumber: string,
): EtalonActionDictionary {
  return {
    statusTitles: Object.fromEntries(reference.ddsStatuses.map((ref) => [ref.status, ref.title])),
    numberTitles: Object.fromEntries(reference.internalNumbers.map((ref) => [ref.number, ref.title])),
    cardLabels: cardId ? { [cardId]: cardNumber } : {},
  };
}
