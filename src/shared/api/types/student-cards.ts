/*
 * Банк карточек обучающихся-112 — GET /api/v1/student-cards (спека 011; backend/app/schemas/v1/student_cards.py).
 * Преподаватель отбирает карточки в задание режима ДДС и подтверждает эталон каждой.
 */

/** Первичный статус, который ДДС должна поставить по карточке. */
export type StudentCardDecision = "accepted" | "notAccepted";

/** Эталон ДДС карточки обучающегося; для «Не принята» обязательно, кому передана информация. */
export interface StudentCardEtalon {
  cardId: string;
  expectedDecision: StudentCardDecision;
  expectedTransferTo?: string;
}

export interface StudentCard {
  id: string;
  /** Группа происшествия, выбранная обучающимся-112. */
  group: string;
  summary: string;
  address: string;
  authorId: string;
  authorName: string;
  authorGroup?: string;
  registeredAt?: string;
  /** Исходный билет, по которому обучающийся-112 принимал вызов. */
  sourceCardId?: string;
  /** Службы из списка оповещения карточки (выбор обучающегося-112). */
  selectedServices: string[];
  /** Службы по билету. */
  ticketServices: string[];
  /** Эталон, предложенный системой: службы совпали с билетом → «Принята», иначе «Не принята». */
  proposed: StudentCardEtalon;
}
