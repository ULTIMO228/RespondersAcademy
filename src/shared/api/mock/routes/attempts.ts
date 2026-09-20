/* Route handlers попыток: /api/mock/cards/[id]/attempt, /api/mock/attempts/[id]/progress (логика — ../attempts.ts). */
import { openCardAttempt, recordAttemptProgress } from "../attempts";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";

export const handlePostCardAttempt = withErrorHandling(async (request: Request, { params }: RouteContext) => {
  const result = await openCardAttempt((await params).id, request);
  return result.created ? jsonCreated(result) : jsonOk(result);
});

export const handlePostAttemptProgress = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await recordAttemptProgress((await params).id, request)),
);
