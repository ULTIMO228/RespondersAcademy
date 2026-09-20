/* Route handlers GET /api/mock/cards и GET /api/mock/cards/[id] (тонкие: логика — ../cards*.ts). */
import { getCardDetails } from "../cards";
import { listCards } from "../cards-list";
import type { CardSearch } from "../cards-list";
import { readSearchParams } from "../request";
import type { RouteContext } from "../request";
import { jsonOk, withErrorHandling } from "../respond";

/** GET /cards; функцию расширенного поиска передаёт серверная сборка (src/app/mock-api). */
export function createGetCardsHandler(search: CardSearch) {
  return withErrorHandling((request: Request) => jsonOk(listCards(readSearchParams(request), search)));
}

export const handleGetCard = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(getCardDetails((await params).id)),
);
