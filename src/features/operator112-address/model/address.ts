import type { AddressSource, CardDraftAddress, Street } from "@/shared/api";

export const EMPTY_ADDRESS: CardDraftAddress = {
  formal: "",
  street: "",
  house: "",
  okrug: "",
  raion: "",
  descriptive: "",
  source: "manual",
};

/** Формальный адрес карточки из полей блока: «Москва, <улица>, дом <N>, <описательный>». */
export function composeFormal(address: Pick<CardDraftAddress, "street" | "house" | "descriptive">): string {
  return [
    address.street.trim() ? "Москва" : "",
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
  return { ...next, formal: composeFormal(next) };
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
