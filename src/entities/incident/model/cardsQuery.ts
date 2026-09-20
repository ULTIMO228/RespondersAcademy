import type { CardSearchFilters, CardsQuery } from "@/shared/api";

/*
 * Запрос списка GET /api/mock/cards (T2.2-01, T2.2-13): фильтры расширенного поиска → query-ключи мок-слоя
 * (множественные — повторными ключами в единственном числе), вид ленты, датасет и пагинация (page — с 1).
 */

/** «выберите что показать»: все карточки / пустые / новые СМС. */
export type CardListView = "all" | "empty" | "sms";
/** Источник списка мок-слоя: fixtures — рабочие карточки ПОВ-112, all — + 96 учебных карточек. */
export type CardDataset = "all" | "fixtures" | "training";

export type CardListRequest = {
  filters: CardSearchFilters;
  view: CardListView;
  dataset: CardDataset;
  /** Номер страницы с 1. */
  page: number;
  perPage: number;
};

/** Колонка «Дата ↓» ленты: новые карточки сверху (сортирует мок-слой до пагинации). */
const DATE_DESC_SORT = "-createdAt";

type ListField = "signs" | "arms" | "okrugs" | "services" | "channels" | "sources" | "cardStatuses";

const LIST_QUERY_KEYS: Record<ListField, string> = {
  signs: "sign",
  arms: "arm",
  okrugs: "okrug",
  services: "service",
  channels: "channel",
  sources: "source",
  cardStatuses: "cardStatus",
};

const SCALAR_FIELDS = [
  "incidentType",
  "address",
  "raion",
  "descriptiveAddress",
  "region",
  "description",
  "applicant",
  "operator",
  "cardNumber",
  "createdFrom",
  "createdTo",
] as const;

function toFilterQuery(filters: CardSearchFilters): CardsQuery {
  const query: CardsQuery = {};
  for (const field of SCALAR_FIELDS) {
    const value = filters[field]?.trim();
    if (value) query[field] = value;
  }
  for (const [field, key] of Object.entries(LIST_QUERY_KEYS) as Array<[ListField, string]>) {
    const values = (filters[field] ?? []).filter((value) => value.trim() !== "");
    if (values.length > 0) query[key] = values;
  }
  return query;
}

/** Есть ли в фильтрах хоть одно заданное поле (пустые строки/списки не считаются). */
export function hasActiveFilters(filters: CardSearchFilters): boolean {
  return Object.keys(toFilterQuery(filters)).length > 0;
}

export function toCardsQuery(request: CardListRequest): CardsQuery {
  return {
    ...toFilterQuery(request.filters),
    view: request.view === "all" ? undefined : request.view,
    dataset: request.dataset,
    sort: DATE_DESC_SORT,
    page: request.page,
    perPage: request.perPage,
  };
}
