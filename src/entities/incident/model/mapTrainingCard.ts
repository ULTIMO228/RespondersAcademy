import type { IncidentCard } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

import type { IncidentMapContext } from "./mapArmFixture";
import { toServiceStatus } from "./mapArmFixture";
import { toCardNumber } from "./links";
import { pickCodeFromServiceLabels, UNASSIGNED_OPERATOR } from "./parse";
import type { IncidentListItem } from "./types";

const NEW_SERVICE_STATUS = "added";
const REGISTERED_CARD_STATUS = "registered";
const TRAINING_SOURCE = "Служба 112";
const DEFAULT_TYPE_CODE = "112";
const NO_VICTIMS = "Нет";

export type TrainingCardOptions = {
  card: IncidentCard;
  /** CardFlowItem.issuedAt — момент выдачи в занятии (старт таймера 30 сек). */
  issuedAt: string;
  armNumber: string;
};

function toVictims(card: IncidentCard): string {
  return card.victims ? String(card.victims.count) : NO_VICTIMS;
}

/**
 * Учебная карточка занятия (GET /api/mock/cards/c-NNN → IncidentCard) → строка ленты. Номер — цифры id,
 * как в списочной проекции мок-слоя; переход — в /arm/card/c-NNN (мок-слой сам подбирает фикстуру рендера).
 * Эталон (expectedServices/expectedTags) в строку не раскрывается: службы выбирает курсант.
 */
export function mapTrainingCard(options: TrainingCardOptions, context: IncidentMapContext): IncidentListItem {
  const { card, issuedAt, armNumber } = options;
  return {
    id: card.id,
    href: ROUTES.armCard(card.id),
    number: toCardNumber(card.id),
    createdAt: issuedAt,
    operatorNumber: UNASSIGNED_OPERATOR,
    armNumber,
    typeName: card.group,
    typeCode: pickCodeFromServiceLabels(card.expectedServices, DEFAULT_TYPE_CODE),
    victims: toVictims(card),
    address: card.address,
    serviceStatus: toServiceStatus(NEW_SERVICE_STATUS, context),
    emergencyMark: null,
    smsCount: 0,
    description: { meta: `${formatDateTime(issuedAt)} ${TRAINING_SOURCE} -`, text: card.summary },
    links: [],
    isImportant: false,
    isEmpty: false,
    state: "new",
    issuedAt,
    reactionTimer: null,
    preview: {
      applicant: [card.caller.name, card.caller.status].filter(Boolean).join(", "),
      phone: card.caller.phone,
      cardStatus: context.cardStatusTitles[REGISTERED_CARD_STATUS] ?? REGISTERED_CARD_STATUS,
      services: [],
      recentStatuses: [],
    },
  };
}
