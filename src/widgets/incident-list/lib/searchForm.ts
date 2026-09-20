import type { CardSearchFilters, CardStatus } from "@/shared/api";

import { fromMoscowInputValue } from "./time";

/*
 * Значения формы «расширенный по параметрам» (17 полей памятки стр. 35–40) → CardSearchFilters мок-слоя.
 * «По округу» — через запятую (каждый округ — отдельное значение, OR); период — московское время формы.
 */

export type AdvancedSearchValues = {
  incidentType: string;
  signs: string[];
  arms: string[];
  address: string;
  okrugs: string;
  raion: string;
  descriptiveAddress: string;
  region: string;
  services: string[];
  description: string;
  applicant: string;
  channels: string[];
  sources: string[];
  operator: string;
  cardNumber: string;
  cardStatuses: string[];
  periodFrom: string;
  periodTo: string;
};

export type AdvancedSearchField = keyof AdvancedSearchValues;

export const EMPTY_SEARCH_VALUES: AdvancedSearchValues = {
  incidentType: "",
  signs: [],
  arms: [],
  address: "",
  okrugs: "",
  raion: "",
  descriptiveAddress: "",
  region: "",
  services: [],
  description: "",
  applicant: "",
  channels: [],
  sources: [],
  operator: "",
  cardNumber: "",
  cardStatuses: [],
  periodFrom: "",
  periodTo: "",
};

const OKRUG_SEPARATOR = ",";

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
] as const;

const LIST_FIELDS = ["signs", "arms", "services", "channels", "sources"] as const;

/** «ЮАО, ЦАО» → ["ЮАО", "ЦАО"]. */
export function splitOkrugs(value: string): string[] {
  return value
    .split(OKRUG_SEPARATOR)
    .map((okrug) => okrug.trim())
    .filter(Boolean);
}

export function toSearchFilters(values: AdvancedSearchValues): CardSearchFilters {
  const filters: CardSearchFilters = {};
  for (const field of SCALAR_FIELDS) {
    const value = values[field].trim();
    if (value) filters[field] = value;
  }
  for (const field of LIST_FIELDS) {
    if (values[field].length > 0) filters[field] = [...values[field]];
  }
  const okrugs = splitOkrugs(values.okrugs);
  if (okrugs.length > 0) filters.okrugs = okrugs;
  if (values.cardStatuses.length > 0) filters.cardStatuses = values.cardStatuses as CardStatus[];
  const createdFrom = fromMoscowInputValue(values.periodFrom);
  const createdTo = fromMoscowInputValue(values.periodTo);
  if (createdFrom) filters.createdFrom = createdFrom;
  if (createdTo) filters.createdTo = createdTo;
  return filters;
}
