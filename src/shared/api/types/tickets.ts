/* Билеты — GET /api/v1/tickets (backend/app/api/v1/tickets.py::ticket_contract): карточка + сложность и утверждение. */
import type { IncidentCard } from "./incident-card";
import type { TicketAudio } from "./operator112";

/** seed — исходные билеты; прочие значения приходят от бэкенда (ручное создание, генерация). */
export type TicketOrigin = string;

export interface Ticket extends IncidentCard {
  /** 1..5. */
  difficulty: number;
  /** Назначать можно только утверждённые билеты. */
  approved: boolean;
  modeOrigin: TicketOrigin;
  audio?: TicketAudio;
  validation?: Record<string, unknown>;
}

export type TicketsQuery = {
  group?: string[];
  difficulty?: number[];
  source?: string;
  validationStatus?: "approved" | "pending";
  q?: string;
};
