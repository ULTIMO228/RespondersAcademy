/* Route handler GET /api/mock/users (логика — ../users.ts): состав учебных групп для преподавателя. */
import { readSearchParams } from "../request";
import { jsonOk, withErrorHandling } from "../respond";
import { listUsers } from "../users";
import type { ViewerResolver } from "../viewer";

/** Резолвер мок-сессии передаёт серверная сборка (app/api/mock/_server): обучающемуся — 403. */
export function createGetUsersHandler(resolveViewer: ViewerResolver) {
  return withErrorHandling((request: Request) =>
    jsonOk(listUsers(readSearchParams(request), resolveViewer(request))),
  );
}
