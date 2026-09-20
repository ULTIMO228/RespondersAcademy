/*
 * Ограничение доступа монитора (T3.3-09; ТЗ §8): экран курсанта открыт только в рамках своего идущего
 * занятия и только для его участников. Вторая линия — мок-слой: чужое занятие он не отдаёт (403),
 * а лента сужается по studentId (docs/mock-api.md, «Окно ленты занятия»).
 */
import type { LiveSessionState } from "@/widgets/monitor-grid";

export type MonitorAccess = "loading" | "granted" | "noSession" | "foreignStudent" | "error";

export function resolveAccess(state: LiveSessionState, studentId: string): MonitorAccess {
  if (state.status === "loading") return "loading";
  if (state.status === "empty") return "noSession";
  if (state.status === "error") return "error";
  return state.live.session.studentIds.includes(studentId) ? "granted" : "foreignStudent";
}

export const ACCESS_MESSAGES: Record<Exclude<MonitorAccess, "granted" | "loading">, string> = {
  noSession: "Занятие не идёт — экран курсанта доступен только во время вашего занятия.",
  foreignStudent: "Курсант не участвует в вашем занятии — просмотр его экрана недоступен.",
  error: "Не удалось проверить занятие. Повторите попытку или вернитесь к классу.",
};
