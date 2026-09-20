/* Route handlers софтфона: /api/mock/calls/reply, /api/mock/cards/[id]/calls (логика — ../calls.ts). */
import { recordCardCall, replyToCall } from "../calls";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";

export const handlePostCallReply = withErrorHandling(async (request: Request) =>
  jsonOk(await replyToCall(request)),
);

export const handlePostCardCall = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonCreated(await recordCardCall((await params).id, request)),
);
