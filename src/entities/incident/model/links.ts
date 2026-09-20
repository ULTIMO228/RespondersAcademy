import type { CardLink } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import type { IncidentLink, IncidentLinkRole } from "./types";

/* Read-only цепочка связей (POST /api/mock/cards/[id]/links — проекция IncidentCard.duplicateOf). */

const LINK_ROLE_TITLES: Record<CardLink["role"], IncidentLinkRole> = {
  main: "главная",
  subordinate: "подчинённая",
};
const ID_DIGITS = /\d+/;

/** Номер карточки для UI по id: «card-881412» → 881412, «c-047» → 47 (как в списке мок-слоя). */
export function toCardNumber(cardId: string): number {
  return Number(ID_DIGITS.exec(cardId)?.[0] ?? 0);
}

/** Звенья цепочки → строки «главная/подчинённая» с переходом в связанную карточку; пустая цепочка — []. */
export function toIncidentLinks(chain: CardLink[], currentId: string): IncidentLink[] {
  return chain.map((link) => ({
    id: link.cardId,
    number: toCardNumber(link.cardId),
    role: LINK_ROLE_TITLES[link.role],
    href: ROUTES.armCard(link.cardId),
    isCurrent: link.cardId === currentId,
  }));
}

/** Сколько карточек связано с текущей (сама карточка в счётчик не входит). */
export function countLinkedCards(links: IncidentLink[]): number {
  return links.filter((link) => !link.isCurrent).length;
}
