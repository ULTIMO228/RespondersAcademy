/* Билеты — /api/v1/tickets (спека 002): выбор билетов для назначения. */
import { v1ApiClient } from "../v1-client";
import type { Ticket, TicketsQuery } from "../types";

/** GET /tickets: доступен любой роли; массивы group/difficulty — повторные ключи. Утверждённость — поле approved. */
export function listTickets(query?: TicketsQuery, signal?: AbortSignal): Promise<Ticket[]> {
  return v1ApiClient.get<Ticket[]>("/tickets", query, signal);
}
