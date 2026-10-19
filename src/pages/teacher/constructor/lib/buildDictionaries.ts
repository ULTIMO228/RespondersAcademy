/*
 * Справочники конструктора из моков (серверный модуль: runtime-моки импортируются только на сервере,
 * src/shared/api/mocks.ts). Клиентскому экрану они передаются пропсами.
 */
import { cards, classifier, reference } from "@/shared/api";
import type { ClassifierEntry, IncidentCard, ReferenceData } from "@/shared/api";
import type { FlowDictionaries } from "@/entities/scenario-flow";

export function buildFlowDictionaries(
  source: { cards: IncidentCard[]; classifier: ClassifierEntry[]; reference: ReferenceData } = {
    cards,
    classifier,
    reference,
  },
): FlowDictionaries {
  const signs = new Set<string>();
  for (const entry of source.classifier)
    for (const sign of [entry.sign1, entry.sign2, entry.sign3]) if (sign?.trim()) signs.add(sign.trim());
  return {
    cards: source.cards.map((card) => ({
      value: card.id,
      label: `Билет ${card.ticketNo}.${card.situationNo}`,
      summary: card.summary,
      address: card.addressRefined ? `${card.address} (${card.addressRefined})` : card.address,
      callerName: card.caller.name,
      callerPhone: card.caller.phone,
    })),
    ddsStatuses: source.reference.ddsStatuses.map((status) => ({
      value: status.status,
      label: status.title,
      next: [...status.next],
    })),
    services: source.reference.services.map((service) => ({ value: service.id, label: service.shortName })),
    phoneNumbers: source.reference.internalNumbers.map((item) => ({
      value: item.number,
      label: `${item.number} — ${item.title}`,
    })),
    signs: [...signs].sort((a, b) => a.localeCompare(b, "ru")).map((sign) => ({ value: sign, label: sign })),
  };
}
