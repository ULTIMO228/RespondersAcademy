/*
 * Пользователь запроса к мок-API из мок-сессии (cookie arm112_session; T2.5-01). Разбор и 24-часовой срок —
 * общие с proxy и серверными лэйаутами (entities/user). Источник истины для studentId — сессия, не query.
 */
import { isSessionExpired, parseSession, SESSION_COOKIE } from "@/entities/user";
import type { MockViewer } from "@/shared/api/mock";
import { systemClock } from "@/shared/lib";

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

/** Нет cookie, битая или истёкшая (24 ч) сессия → null (аноним). */
export function readRequestViewer(request: Request): MockViewer | null {
  const session = parseSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
  if (!session || isSessionExpired(session, systemClock.now())) return null;
  return { userId: session.userId, role: session.role };
}
