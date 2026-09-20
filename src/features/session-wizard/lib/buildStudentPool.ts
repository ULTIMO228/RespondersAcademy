import type { IncidentCard, PublicUser, SessionContract } from "@/shared/api";
import { formatDate } from "@/shared/lib";

import type { PoolCard } from "../model/types";

type PoolSource = {
  sessions: readonly SessionContract[];
  users: readonly PublicUser[];
  cards: readonly IncidentCard[];
};

/**
 * Пул «сформированные обучающимися» (Session.cardSource = studentCreated, сценарий В): карточки с пометкой
 * автора-курсанта (IncidentCard.createdByStudentId) и карточки, заполненные курсантами на прошлых занятиях
 * (CardEvent.enteredText). Преподаватель видит размер пула и автора каждой карточки — состав прозрачен.
 */
export function buildStudentPool({ sessions, users, cards }: PoolSource): PoolCard[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const authorName = (studentId: string) =>
    users.find((user) => user.id === studentId)?.fullName ?? studentId;
  const fromCards: PoolCard[] = cards
    .filter((card) => card.createdByStudentId)
    .map((card) => ({
      id: card.id,
      cardNumber: card.id,
      cardType: card.group,
      authorName: authorName(card.createdByStudentId ?? ""),
      sessionDate: "—",
    }));
  const fromAttempts: PoolCard[] = sessions.flatMap((session) =>
    session.cardEvents
      .filter((attempt) => Object.keys(attempt.enteredText).length > 0)
      .map((attempt) => ({
        id: `${session.id}:${attempt.cardId}:${attempt.studentId}`,
        cardNumber: attempt.cardId,
        cardType: cardById.get(attempt.cardId)?.group ?? "—",
        authorName: authorName(attempt.studentId),
        sessionDate: formatDate(session.startedAt),
      })),
  );
  return [...fromCards, ...fromAttempts];
}
