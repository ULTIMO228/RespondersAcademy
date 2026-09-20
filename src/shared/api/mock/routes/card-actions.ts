/* Route handlers действий карточки /api/mock/cards/[id]/* (тонкие: логика — ../card-actions.ts). */
import type { DdsTransitionGuard } from "../card-actions";
import {
  getCardLinks,
  listRecordings,
  listSms,
  postReminder,
  postSms,
  postStatus,
  postWorkLine,
} from "../card-actions";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";

/** POST /cards/[id]/status; машину статусов ДДС передаёт серверная сборка (src/app/mock-api). */
export function createPostCardStatusHandler(assertTransition: DdsTransitionGuard) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) =>
    jsonOk(await postStatus((await params).id, request, assertTransition)),
  );
}

export const handlePostCardLinks = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(getCardLinks((await params).id)),
);

export const handlePostCardWorkLine = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonCreated(await postWorkLine((await params).id, request)),
);

export const handlePostCardReminder = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonCreated(await postReminder((await params).id, request)),
);

export const handleGetCardSms = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(listSms((await params).id)),
);

export const handlePostCardSms = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonCreated(await postSms((await params).id, request)),
);

export const handleGetCardRecordings = withErrorHandling(
  async (_request: Request, { params }: RouteContext) => jsonOk(listRecordings((await params).id)),
);
