/*
 * Пользователь запроса к мок-API из сессии (cookie arm112_session; T2.5-01). Cookie ставит сервер мок-слоя:
 * подписанный JWT, проверяются подпись, срок, отзыв и активность пользователя (shared/api/mock/auth-tokens.ts).
 * Источник истины для studentId — сессия, не query.
 */
import { readRequestSession } from "@/shared/api/mock";
import type { MockViewer } from "@/shared/api/mock";

/** Нет cookie, подделка, истёкшая/отозванная сессия или заблокированный пользователь → null (аноним). */
export function readRequestViewer(request: Request): MockViewer | null {
  const session = readRequestSession(request, Date.now());
  return session ? { userId: session.userId, role: session.role } : null;
}
