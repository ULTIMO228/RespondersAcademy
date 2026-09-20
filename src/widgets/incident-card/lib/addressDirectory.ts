/*
 * Локальный мок-справочник адресов (T2.3-06): эмуляция вариантов адресной строки ПОВ-112
 * (в реальном АРМ — Яндекс.Карты / Яндекс.Организации / ФИАС). Уровень приложения — mocks/local,
 * spec/mocks не расширяется. Внешних запросов нет: JSON входит в бандл.
 */
import addressesJson from "@mocks/local/addresses.json";

import type { AddressFields } from "./parseAddress";

export type AddressEntry = AddressFields & {
  id: string;
  geo: { lat: number; lon: number };
};

export const ADDRESS_DIRECTORY: readonly AddressEntry[] = addressesJson.addresses;

const SUGGESTION_LIMIT = 6;

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
}

/** «Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2» — формат ПОВ-112. */
export function formatAddress(entry: AddressFields): string {
  const district =
    entry.okrug || entry.raion ? `(${[entry.okrug, entry.raion].filter(Boolean).join(", ")})` : "";
  const parts = [
    entry.country,
    entry.subject,
    district,
    entry.street,
    entry.house,
    entry.building ? `к. ${entry.building}` : "",
    entry.entrance ? `под. ${entry.entrance}` : "",
    entry.floor ? `эт. ${entry.floor}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

/** Варианты адресной строки: все слова запроса входят в адрес (регистр и «ё/е» не различаются). */
export function searchAddresses(
  query: string,
  directory: readonly AddressEntry[] = ADDRESS_DIRECTORY,
): AddressEntry[] {
  const words = normalize(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length === 0) return directory.slice(0, SUGGESTION_LIMIT);
  return directory
    .filter((entry) => {
      const haystack = normalize(`${formatAddress(entry)} ${entry.descriptive}`);
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, SUGGESTION_LIMIT);
}

/** Ближайший адрес справочника к точке на карте («Указать на карте» подставляет адрес). */
export function findNearestAddress(
  geo: { lat: number; lon: number },
  directory: readonly AddressEntry[] = ADDRESS_DIRECTORY,
): AddressEntry | undefined {
  const distance = (entry: AddressEntry) => (entry.geo.lat - geo.lat) ** 2 + (entry.geo.lon - geo.lon) ** 2;
  return [...directory].sort((left, right) => distance(left) - distance(right))[0];
}

/** Поля блока «Адрес» из записи справочника (автозаполнение). */
export function toAddressFields(entry: AddressEntry): AddressFields {
  const { country, subject, locality, okrug, raion, street, house, building, entrance, floor } = entry;
  return {
    country,
    subject,
    locality,
    okrug,
    raion,
    street,
    house,
    building,
    entrance,
    floor,
    descriptive: entry.descriptive,
  };
}
