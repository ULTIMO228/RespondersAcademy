/* Route handlers попыток: /api/mock/cards/[id]/attempt, /api/mock/attempts/[id]/progress (логика — ../attempts.ts). */
import { openCardAttempt, recordAttemptProgress } from "../attempts";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";
import type { ViewerResolver } from "../viewer";

/** POST /cards/[id]/attempt: пользователь запроса — из мок-сессии (зона ДДС по специализации, спека 019). */
export function createPostCardAttemptHandler(resolveViewer: ViewerResolver) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) => {
    const result = await openCardAttempt((await params).id, request, resolveViewer(request));
    return result.created ? jsonCreated(result) : jsonOk(result);
  });
}

export const handlePostAttemptProgress = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await recordAttemptProgress((await params).id, request)),
);
