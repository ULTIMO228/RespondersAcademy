import type { StatusTone } from "@/shared/ui";

/* Статус службы → цвет маркера по канонической палитре АРМ ЕДДС (spec/07 «Цветовая семантика»). */
export const SERVICE_STATUS_TONE: Record<string, StatusTone> = {
  added: "new",
  received: "created",
  accepted: "accepted",
  notAccepted: "new",
  responseStarted: "accepted",
  arrived: "accepted",
  workInProgress: "assigned",
  workDone: "completed",
  workRefused: "closed",
};

export function getServiceStatusTone(status: string): StatusTone {
  return SERVICE_STATUS_TONE[status] ?? "closed";
}
