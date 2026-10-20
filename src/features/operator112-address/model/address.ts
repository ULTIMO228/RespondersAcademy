import type { AddressSource, CardDraftAddress, Street } from "@/shared/api";

/** Умолчания блока адреса ПОВ-112 (КАРТОЧКА_image1: «Субъект: Москва»; спека 009, FR-014). */
export const DEFAULT_COUNTRY = "Россия";
export const DEFAULT_SUBJECT = "Москва";
export const DEFAULT_LOCALITY = "Москва";

export const EMPTY_ADDRESS: CardDraftAddress = {
  country: DEFAULT_COUNTRY,
  subject: DEFAULT_SUBJECT,
  locality: DEFAULT_LOCALITY,
  formal: "",
  street: "",
  house: "",
  okrug: "",
  raion: "",
  descriptive: "",
  source: "manual",
};

/** Адрес Москвы: справочник улиц доступен только для неё, для других субъектов — ручной ввод (FR-023). */
/** Административные округа Москвы — список «Округ» адресного блока ПОВ-112 (КАРТОЧКА_image1: поле с ▾). */
export const MOSCOW_OKRUGS: readonly string[] = [
  "ЦАО",
  "САО",
  "СВАО",
  "ВАО",
  "ЮВАО",
  "ЮАО",
  "ЮЗАО",
  "ЗАО",
  "СЗАО",
  "ЗелАО",
  "НАО",
  "ТАО",
];

export function isMoscow(address: Pick<CardDraftAddress, "subject">): boolean {
  return (address.subject ?? DEFAULT_SUBJECT).trim().toLowerCase() === DEFAULT_SUBJECT.toLowerCase();
}

/** Очистка адреса: все поля пустые, страна/субъект/населённый пункт возвращаются к умолчаниям. */
export function clearAddress(): CardDraftAddress {
  return { ...EMPTY_ADDRESS };
}

/** Формальный адрес карточки из полей блока: «<нас. пункт>, <улица>, дом <N>, <описательный>». */
export function composeFormal(
  address: Pick<CardDraftAddress, "street" | "house" | "descriptive"> &
    Partial<Pick<CardDraftAddress, "locality" | "subject">>,
): string {
  const place = address.locality?.trim() || address.subject?.trim() || DEFAULT_LOCALITY;
  return [
    address.street.trim() ? place : "",
    address.street.trim(),
    address.house.trim() ? `дом ${address.house.trim()}` : "",
    address.descriptive.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Обновление полей с пересчётом formal; source не трогается (его задаёт выбор из справочника). */
export function withFields(address: CardDraftAddress, patch: Partial<CardDraftAddress>): CardDraftAddress {
  const next = { ...address, ...patch };
  // Справочник — только для Москвы: смена субъекта на другой делает источник ручным.
  const source: AddressSource = isMoscow(next) ? next.source : "manual";
  return { ...next, source, formal: composeFormal(next) };
}

/** Выбор из подсказки справочника: улица, округ и район берутся из записи, источник — directory. */
export function pickStreet(address: CardDraftAddress, street: Street): CardDraftAddress {
  return withFields(address, {
    street: street.name,
    okrug: street.okrug ?? address.okrug,
    raion: street.raion ?? address.raion,
    source: "directory",
  });
}

/** Ручной ввод улицы: любая правка текста после выбора из справочника меняет источник на manual. */
export function typeStreet(
  address: CardDraftAddress,
  text: string,
  pickedName: string | null,
): CardDraftAddress {
  const source: AddressSource = pickedName !== null && text === pickedName ? address.source : "manual";
  return withFields(address, { street: text, source });
}
